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

module.exports = { getMyProfile, updateMyProfile, updateFcmToken, listProfiles, getProfileById };