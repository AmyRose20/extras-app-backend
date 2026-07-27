const prisma = require('../config/db');

// GET /invites/me — an EXTRA sees their own pending/past invites
async function getMyInvites(req, res) {
  const profile = await prisma.extraProfile.findUnique({
    where: { userId: req.user.userId },
  });

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  const invites = await prisma.callInvite.findMany({
    where: { extraProfileId: profile.id },
    include: { callRequest: { include: { shootDay: true } } },
    orderBy: { sentAt: 'desc' },
  });

  return res.json(invites);
}

// PATCH /invites/:id — an EXTRA accepts or declines an invite
// body: { "status": "ACCEPTED" | "DECLINED" }
async function respondToInvite(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  if (!['ACCEPTED', 'DECLINED'].includes(status)) {
    return res.status(400).json({ error: 'status must be ACCEPTED or DECLINED' });
  }

  const profile = await prisma.extraProfile.findUnique({
    where: { userId: req.user.userId },
  });

  const invite = await prisma.callInvite.findUnique({ where: { id } });
  if (!invite || invite.extraProfileId !== profile.id) {
    return res.status(404).json({ error: 'Invite not found' });
  }

  const updated = await prisma.callInvite.update({
    where: { id },
    data: { status, respondedAt: new Date() },
  });

  return res.json(updated);
}

module.exports = { getMyInvites, respondToInvite };
