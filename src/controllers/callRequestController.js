const prisma = require('../config/db');
require('../config/firebase'); // initializes the Firebase app
const { getMessaging } = require('firebase-admin/messaging');
const { dobFilterForAgeRange } = require('../utils/age');

// Every coordinator must be linked to a production. Returns the
// productionId, or sends a 403 and returns null if they aren't linked.
function requireProduction(req, res) {
  if (!req.user.productionId) {
    res.status(403).json({ error: 'Your account is not linked to a production' });
    return null;
  }
  return req.user.productionId;
}

// POST /call-requests — ADMIN creates a call for one of THEIR production's
// shoot days, and matching extras (on that production) are invited automatically.
//
// Expected body:
// {
//   "shootDayId": "...",
//   "description": "20 men, fight scene",
//   "quantityNeeded": 20,
//   "criteria": { "minAge": 25, "maxAge": 45, "gender": "MALE", "skills": ["stunt work"] }
// }
async function createCallRequest(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { shootDayId, description, quantityNeeded, criteria } = req.body;

    if (!shootDayId || !description || !quantityNeeded || !criteria) {
      return res.status(400).json({
        error: 'shootDayId, description, quantityNeeded and criteria are required',
      });
    }

    // Make sure the shoot day belongs to this coordinator's production
    const shootDay = await prisma.shootDay.findFirst({
      where: { id: shootDayId, productionId },
    });
    if (!shootDay) {
      return res.status(404).json({ error: 'Shoot day not found' });
    }

    const callRequest = await prisma.callRequest.create({
      data: { shootDayId, description, quantityNeeded, criteria },
    });

    const matchedExtras = await findMatchingExtras(criteria, productionId);

    if (matchedExtras.length > 0) {
      await prisma.callInvite.createMany({
        data: matchedExtras.map((extra) => ({
          callRequestId: callRequest.id,
          extraProfileId: extra.id,
        })),
        skipDuplicates: true,
      });

      await sendPushNotifications(matchedExtras, callRequest);
    }

    return res.status(201).json({
      callRequest,
      matchedCount: matchedExtras.length,
      warning: matchedExtras.length === 0 ? 'No extras matched this criteria — try widening the age range, gender, or skills.' : undefined,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong creating the call request' });
  }
}

// Sends a push notification to each matched extra who has a saved FCM token.
// Extras without a token yet (haven't opened the app, denied permission, etc.)
// are just skipped — no error, since this is expected for some users.
async function sendPushNotifications(matchedExtras, callRequest) {
  const tokens = matchedExtras
    .map((extra) => extra.fcmToken)
    .filter((token) => token != null && token !== '');

  if (tokens.length === 0) {
    console.log('No FCM tokens to send to for this call request');
    return;
  }

  const message = {
    notification: {
      title: 'New Call Request',
      body: callRequest.description,
    },
    tokens,
  };

  try {
    const response = await getMessaging().sendEachForMulticast(message);
    console.log(`Push sent: ${response.successCount} succeeded, ${response.failureCount} failed`);
  } catch (error) {
    console.error('Error sending push notifications:', error);
  }
}

// Finds extra profiles matching the given criteria, limited to extras
// linked to the given production (extras on both productions still match).
// criteria can include: minAge, maxAge, gender, skills (array — extra must have ALL listed skills)
async function findMatchingExtras(criteria, productionId) {
  const { minAge, maxAge, gender, skills } = criteria;

  return prisma.extraProfile.findMany({
    where: {
      productions: { some: { id: productionId } },
      dateOfBirth: dobFilterForAgeRange(minAge, maxAge),
      gender: gender ?? undefined,
      skills: skills && skills.length > 0 ? { hasEvery: skills } : undefined,
      user: {
        deletedAt: null,
        deletionRequestStatus: { not: 'PENDING' },
      },
    },
  });
}

// GET /call-requests/:id — see the invites and their current status.
// Only works for call requests on this coordinator's production.
async function getCallRequestStatus(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { id } = req.params;

    const callRequest = await prisma.callRequest.findFirst({
      where: { id, shootDay: { productionId } },
      include: {
        invites: {
          include: {
            extraProfile: {
              include: {
                // only the fields the app needs — no passwordHash
                user: { select: { id: true, name: true, email: true, phone: true } },
              },
            },
          },
        },
      },
    });

    if (!callRequest) {
      return res.status(404).json({ error: 'Call request not found' });
    }

    const tally = {
      needed: callRequest.quantityNeeded,
      accepted: callRequest.invites.filter((i) => i.status === 'ACCEPTED').length,
      declined: callRequest.invites.filter((i) => i.status === 'DECLINED').length,
      cancelled: callRequest.invites.filter((i) => i.status === 'CANCELLED').length,
      pending: callRequest.invites.filter((i) => i.status === 'PENDING').length,
    };

    return res.json({ callRequest, tally });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong loading that call request' });
  }
}

// PATCH /call-requests/:id — ADMIN edits description and/or quantityNeeded.
// criteria/matching is intentionally untouched. Blocked once the
// call request's shoot day has already passed.
// body: { "description": "...", "quantityNeeded": 15 }  (either or both)
async function updateCallRequest(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { id } = req.params;
    const { description, quantityNeeded } = req.body;

    if (description === undefined && quantityNeeded === undefined) {
      return res.status(400).json({ error: 'Provide description and/or quantityNeeded to update' });
    }

    const callRequest = await prisma.callRequest.findFirst({
      where: { id, shootDay: { productionId } },
      include: { shootDay: true },
    });

    if (!callRequest) {
      return res.status(404).json({ error: 'Call request not found' });
    }

    if (new Date(callRequest.shootDay.date) < new Date()) {
      return res.status(400).json({ error: "This call request's shoot day has already passed and can no longer be edited" });
    }

    const data = {};
    if (description !== undefined) data.description = description;
    if (quantityNeeded !== undefined) data.quantityNeeded = quantityNeeded;

    const updated = await prisma.callRequest.update({
      where: { id },
      data,
    });

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong updating that call request' });
  }
}

// POST /call-requests/:id/copy — ADMIN copies a call request to other shoot days.
// body: { "shootDayIds": ["...", "..."] }
// Each chosen shoot day gets its own call request with the same description,
// quantity and criteria; matching runs and invites/push go out for each one.
// Only upcoming shoot days in the coordinator's own production are allowed.
async function copyCallRequest(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { id } = req.params;
    const { shootDayIds } = req.body;

    if (!Array.isArray(shootDayIds) || shootDayIds.length === 0) {
      return res.status(400).json({ error: 'Choose at least one shoot day to copy to' });
    }

    // The call request being copied (must be on this coordinator's production)
    const source = await prisma.callRequest.findFirst({
      where: { id, shootDay: { productionId } },
    });
    if (!source) {
      return res.status(404).json({ error: 'Call request not found' });
    }

    if (shootDayIds.includes(source.shootDayId)) {
      return res.status(400).json({ error: "You can't copy a call request to the shoot day it's already on" });
    }

    // Every target must be an upcoming shoot day on this production
    const targets = await prisma.shootDay.findMany({
      where: { id: { in: shootDayIds }, productionId, date: { gt: new Date() } },
      orderBy: { date: 'asc' },
    });
    if (targets.length !== shootDayIds.length) {
      return res.status(400).json({ error: 'One or more shoot days were not found or have already passed' });
    }

    // Create a copy on each shoot day, then match + invite + notify, one day at a time
    const results = [];
    for (const shootDay of targets) {
      const copy = await prisma.callRequest.create({
        data: {
          shootDayId: shootDay.id,
          description: source.description,
          quantityNeeded: source.quantityNeeded,
          criteria: source.criteria,
        },
      });

      const matchedExtras = await findMatchingExtras(source.criteria, productionId);

      if (matchedExtras.length > 0) {
        await prisma.callInvite.createMany({
          data: matchedExtras.map((extra) => ({
            callRequestId: copy.id,
            extraProfileId: extra.id,
          })),
          skipDuplicates: true,
        });
        await sendPushNotifications(matchedExtras, copy);
      }

      results.push({
        callRequestId: copy.id,
        shootDayId: shootDay.id,
        date: shootDay.date,
        matchedCount: matchedExtras.length,
      });
    }

    return res.status(201).json({ copied: results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong copying that call request' });
  }
}

module.exports = { createCallRequest, getCallRequestStatus, updateCallRequest, copyCallRequest };