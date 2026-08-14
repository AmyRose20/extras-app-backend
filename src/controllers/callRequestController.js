const prisma = require('../config/db');
require('../config/firebase'); // initializes the Firebase app
const { getMessaging } = require('firebase-admin/messaging');

// POST /call-requests — ADMIN creates a call for a shoot day and the
// matching extras are found and invited automatically.
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
    const { shootDayId, description, quantityNeeded, criteria } = req.body;

    if (!shootDayId || !description || !quantityNeeded || !criteria) {
      return res.status(400).json({
        error: 'shootDayId, description, quantityNeeded and criteria are required',
      });
    }

    const callRequest = await prisma.callRequest.create({
      data: { shootDayId, description, quantityNeeded, criteria },
    });

    const matchedExtras = await findMatchingExtras(criteria);

    if (matchedExtras.length > 0) {
      await prisma.callInvite.createMany({
        data: matchedExtras.map((extra) => ({
          callRequestId: callRequest.id,
          extraProfileId: extra.id,
        })),
        skipDuplicates: true,
      });

      // Sending the actual push notifications happens here in a later step
      // (Week 6) via Firebase Cloud Messaging — this is the hook point.
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

// Finds extra profiles matching the given criteria.
// criteria can include: minAge, maxAge, gender, skills (array — extra must have ALL listed skills)
async function findMatchingExtras(criteria) {
  const { minAge, maxAge, gender, skills } = criteria;

  return prisma.extraProfile.findMany({
    where: {
      age: {
        gte: minAge ?? undefined,
        lte: maxAge ?? undefined,
      },
      gender: gender ?? undefined,
      skills: skills && skills.length > 0 ? { hasEvery: skills } : undefined,
    },
  });
}

// GET /call-requests/:id — see the invites and their current status
async function getCallRequestStatus(req, res) {
  const { id } = req.params;

  const callRequest = await prisma.callRequest.findUnique({
    where: { id },
    include: {
      invites: {
        include: { extraProfile: { include: { user: true } } },
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
    pending: callRequest.invites.filter((i) => i.status === 'PENDING').length,
  };

  return res.json({ callRequest, tally });
}

module.exports = { createCallRequest, getCallRequestStatus };
