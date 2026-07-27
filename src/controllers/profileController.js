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
  const { age, gender, heightCm, skills, availability, photoUrl } = req.body;

  const updated = await prisma.extraProfile.update({
    where: { userId: req.user.userId },
    data: { age, gender, heightCm, skills, availability, photoUrl },
  });

  return res.json(updated);
}

module.exports = { getMyProfile, updateMyProfile };
