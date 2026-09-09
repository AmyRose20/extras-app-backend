const prisma = require('../config/db');

// GET /profiles/me — an EXTRA viewing their own profile
async function getMyProfile(req, res) {
  const profile = await prisma.extraProfile.findUnique({
    where: { userId: req.user.userId },
  });

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  return res.json(profile);
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

// GET /profiles — an ADMIN listing all extras (optionally filtered by skill)
async function listProfiles(req, res) {
  const { skill, gender, minAge, maxAge, availability } = req.query;

  const where = {};

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
}

// GET /profiles/:id — an ADMIN viewing one extra's full profile
async function getProfileById(req, res) {
  const { id } = req.params;

  const profile = await prisma.extraProfile.findUnique({
    where: { id },
    include: { user: { select: { name: true } } },
  });

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  const { user, ...rest } = profile;
  return res.json({ ...rest, name: user.name });
}

module.exports = { getMyProfile, updateMyProfile, updateFcmToken, listProfiles, getProfileById };

