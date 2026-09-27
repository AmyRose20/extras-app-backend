require('../config/firebase'); // initializes the Firebase app
const { getMessaging } = require('firebase-admin/messaging');
const prisma = require('../config/db');

// Every coordinator must be linked to a production. Returns the
// productionId, or sends a 403 and returns null if they aren't linked.
function requireProduction(req, res) {
  if (!req.user.productionId) {
    res.status(403).json({ error: 'Your account is not linked to a production' });
    return null;
  }
  return req.user.productionId;
}

// GET /profiles/me — an EXTRA viewing their own profile
async function getMyProfile(req, res) {
  const profile = await prisma.extraProfile.findUnique({
    where: { userId: req.user.userId },
    include: {
      user: {
        select: { deletionRequestStatus: true, deletionRequestedAt: true, deletionReason: true },
      },
      productions: { select: { id: true, name: true } },
    },
  });

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  const { user, ...rest } = profile;
  return res.json({
    ...rest,
    deletionRequestStatus: user.deletionRequestStatus,
    deletionRequestedAt: user.deletionRequestedAt,
    deletionReason: user.deletionReason,
  });
}

// PATCH /profiles/me — an EXTRA updating their own profile
async function updateMyProfile(req, res) {
  const { age, gender, heightCm, skills, languages, phoneNumber, contactEmail, availability, facePhotoUrl, fullBodyPhotoUrl } = req.body;

  const updated = await prisma.extraProfile.update({
    where: { userId: req.user.userId },
    data: { age, gender, heightCm, skills, languages, phoneNumber, contactEmail, availability, facePhotoUrl, fullBodyPhotoUrl },
  });

  return res.json(updated);
}

// PATCH /profiles/me/fcm-token — an EXTRA's device registering its push token
async function updateFcmToken(req, res) {
  const { fcmToken } = req.body;

  if (!fcmToken) {
    return res.status(400).json({ error: 'fcmToken is required' });
  }

  const profile = await prisma.extraProfile.findUnique({
    where: { userId: req.user.userId },
  });

  if (!profile) {
    // Admins/coordinators don't have an ExtraProfile — nothing to save the token to.
    return res.status(404).json({ error: 'No extra profile found for this user' });
  }

  const updated = await prisma.extraProfile.update({
    where: { userId: req.user.userId },
    data: { fcmToken },
  });

  return res.json(updated);
}

// GET /profiles — an ADMIN listing extras on THEIR production (with optional filters)
async function listProfiles(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { skill, gender, minAge, maxAge, availability } = req.query;

    const where = {
      productions: { some: { id: productionId } }, // only extras on my production
      user: { deletedAt: null },                    // hide soft-deleted extras
    };

    if (skill) {
      const skillList = skill.split(',').map((s) => s.trim()).filter(Boolean);
      where.skills = { hasSome: skillList };
    }

    if (gender) {
      where.gender = gender;
    }

    if (availability) {
      const availabilityList = availability.split(',').map((a) => a.trim()).filter(Boolean);
      where.availability = { hasSome: availabilityList };
    }

    if (minAge || maxAge) {
      where.age = {};
      if (minAge) where.age.gte = parseInt(minAge, 10);
      if (maxAge) where.age.lte = parseInt(maxAge, 10);
    }

    const profiles = await prisma.extraProfile.findMany({
      where,
      include: { user: { select: { name: true } } },
    });

    const result = profiles.map((p) => ({
      id: p.id,
      name: p.user.name,
      skills: p.skills,
      availability: p.availability,
    }));

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong loading extras' });
  }
}

// GET /profiles/:id — an ADMIN viewing one extra's full profile.
// Only works if that extra is on the coordinator's production.
async function getProfileById(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { id } = req.params;

    const profile = await prisma.extraProfile.findFirst({
      where: { id, productions: { some: { id: productionId } } },
      include: {
        user: { select: { name: true, deletionRequestStatus: true } },
        productions: { select: { id: true, name: true } },
      },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { user, ...rest } = profile;
    return res.json({ ...rest, name: user.name, deletionRequestStatus: user.deletionRequestStatus });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong loading that profile' });
  }
}

// PATCH /profiles/me/productions — an EXTRA sets which productions they're on.
// body: { "productionIds": ["...", "..."] }  (the FULL list they want, not just changes)
// Rules:
//  - must keep at least one production
//  - can't leave a production they have upcoming ACCEPTED shoot days on
//  - pending invites on upcoming shoot days of a removed production become EXPIRED
async function updateMyProductions(req, res) {
  try {
    const { productionIds } = req.body;

    if (!Array.isArray(productionIds) || productionIds.length === 0) {
      return res.status(400).json({ error: 'You must be on at least one production' });
    }

    // Make sure every id is a real production
    const validProductions = await prisma.production.findMany({
      where: { id: { in: productionIds } },
    });
    if (validProductions.length !== productionIds.length) {
      return res.status(400).json({ error: 'One or more productions were not found' });
    }

    const profile = await prisma.extraProfile.findUnique({
      where: { userId: req.user.userId },
      include: { productions: true },
    });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Which productions are being removed?
    const removedIds = profile.productions
      .map((p) => p.id)
      .filter((id) => !productionIds.includes(id));

    const now = new Date();

    if (removedIds.length > 0) {
      // Block if they're booked (ACCEPTED) on an upcoming shoot day for a removed production
      const bookedInvites = await prisma.callInvite.findMany({
        where: {
          extraProfileId: profile.id,
          status: 'ACCEPTED',
          callRequest: { shootDay: { productionId: { in: removedIds }, date: { gt: now } } },
        },
        include: { callRequest: { include: { shootDay: { include: { production: true } } } } },
      });

      if (bookedInvites.length > 0) {
        const productionName = bookedInvites[0].callRequest.shootDay.production.name;
        return res.status(400).json({
          error: `You're booked on ${bookedInvites.length} upcoming shoot day(s) for ${productionName}. Cancel those first.`,
        });
      }
    }

    // Do both changes together: update the list + expire pending invites on removed productions
    const [updated] = await prisma.$transaction([
      prisma.extraProfile.update({
        where: { id: profile.id },
        data: { productions: { set: productionIds.map((id) => ({ id })) } },
        include: { productions: { select: { id: true, name: true } } },
      }),
      prisma.callInvite.updateMany({
        where: {
          extraProfileId: profile.id,
          status: 'PENDING',
          callRequest: { shootDay: { productionId: { in: removedIds }, date: { gt: now } } },
        },
        data: { status: 'EXPIRED' },
      }),
    ]);

    return res.json(updated.productions);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong updating your productions' });
  }
}

// DELETE /profiles/:id/production — an ADMIN removes an extra from THEIR production.
// The extra's account and other productions are untouched.
// Their pending + accepted invites on upcoming shoot days for this production become EXPIRED
// (not CANCELLED — it wasn't the extra's choice, so it doesn't count against them).
async function removeExtraFromMyProduction(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { id } = req.params;

    const profile = await prisma.extraProfile.findFirst({
      where: { id, productions: { some: { id: productionId } } },
      include: { productions: true },
    });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    if (profile.productions.length === 1) {
      return res.status(400).json({
        error: "This is the extra's only production. Use a deletion request instead.",
      });
    }

    const production = profile.productions.find((p) => p.id === productionId);
    const now = new Date();

    await prisma.$transaction([
      prisma.extraProfile.update({
        where: { id: profile.id },
        data: { productions: { disconnect: { id: productionId } } },
      }),
      prisma.callInvite.updateMany({
        where: {
          extraProfileId: profile.id,
          status: { in: ['PENDING', 'ACCEPTED'] },
          callRequest: { shootDay: { productionId, date: { gt: now } } },
        },
        data: { status: 'EXPIRED' },
      }),
    ]);

    // Let the extra know (skipped quietly if they have no push token)
    if (profile.fcmToken) {
      try {
        await getMessaging().send({
          token: profile.fcmToken,
          notification: {
            title: 'Production update',
            body: `You've been removed from ${production.name}.`,
          },
        });
      } catch (pushErr) {
        console.error('Error sending removal notification:', pushErr);
      }
    }

    return res.json({ message: `Removed from ${production.name}` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong removing that extra' });
  }
}

module.exports = {
  getMyProfile,
  updateMyProfile,
  updateFcmToken,
  listProfiles,
  getProfileById,
  updateMyProductions,
  removeExtraFromMyProduction,
};