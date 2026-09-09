const prisma = require('../config/db');

// Config for the 3-strikes flag: how many days back counts as "recent",
// and how many recent cancellations trigger the flag.
const CANCEL_WINDOW_DAYS = 90;
const THREE_STRIKES_THRESHOLD = 3;

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

  const invitesWithExpiry = invites.map((invite) => ({
    ...invite,
    isExpired: invite.status === 'PENDING' && new Date(invite.callRequest.shootDay.date) < new Date(),
  }));

  return res.json(invitesWithExpiry);
}

// PATCH /invites/:id — an EXTRA responds to an invite
// body: { "status": "ACCEPTED" | "DECLINED" | "CANCELLED" }
async function respondToInvite(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  // Which status an invite can move to, based on its current status.
  // PENDING -> ACCEPTED/DECLINED covers the initial response.
  // ACCEPTED -> CANCELLED covers backing out after already accepting.
  const VALID_TRANSITIONS = {
    PENDING: ['ACCEPTED', 'DECLINED'],
    ACCEPTED: ['CANCELLED'],
  };
  const ALL_STATUSES = Object.values(VALID_TRANSITIONS).flat();

  if (!ALL_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${ALL_STATUSES.join(', ')}` });
  }

  const profile = await prisma.extraProfile.findUnique({
    where: { userId: req.user.userId },
  });

  const invite = await prisma.callInvite.findUnique({
    where: { id },
    include: { callRequest: { include: { shootDay: true } } },
  });
  if (!invite || invite.extraProfileId !== profile.id) {
    return res.status(404).json({ error: 'Invite not found' });
  }

  if (new Date(invite.callRequest.shootDay.date) < new Date()) {
    return res.status(400).json({ error: 'This invite has expired — the shoot day has already passed' });
  }

  const allowedNext = VALID_TRANSITIONS[invite.status] || [];
  if (!allowedNext.includes(status)) {
    return res.status(400).json({ error: `Cannot change status from ${invite.status} to ${status}` });
  }

  const updated = await prisma.callInvite.update({
    where: { id },
    data: { status, respondedAt: new Date() },
  });

  return res.json(updated);
}

// Shared helper — builds the lifetime tally for one extra profile.
// "worked" = ACCEPTED invites for shoot days that have already happened.
// "declined" / "cancelled" = lifetime totals of those statuses.
// "threeStrikes" = true if CANCELLED count in the last CANCEL_WINDOW_DAYS
// days is at or above THREE_STRIKES_THRESHOLD.
async function buildTally(extraProfileId) {
  const windowStart = new Date(Date.now() - CANCEL_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [worked, declined, cancelled, recentCancelled] = await Promise.all([
    prisma.callInvite.count({
      where: {
        extraProfileId,
        status: 'ACCEPTED',
        callRequest: { shootDay: { date: { lt: new Date() } } },
      },
    }),
    prisma.callInvite.count({
      where: { extraProfileId, status: 'DECLINED' },
    }),
    prisma.callInvite.count({
      where: { extraProfileId, status: 'CANCELLED' },
    }),
    prisma.callInvite.count({
      where: { extraProfileId, status: 'CANCELLED', respondedAt: { gte: windowStart } },
    }),
  ]);

  return {
    worked,
    declined,
    cancelled,
    threeStrikes: recentCancelled >= THREE_STRIKES_THRESHOLD,
  };
}

// GET /invites/tally/me — an EXTRA sees their own lifetime tally
async function getMyTally(req, res) {
  const profile = await prisma.extraProfile.findUnique({
    where: { userId: req.user.userId },
  });
  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  const tally = await buildTally(profile.id);
  return res.json(tally);
}

// GET /invites/tally/:extraProfileId — an ADMIN sees any extra's lifetime tally
async function getExtraTally(req, res) {
  const { extraProfileId } = req.params;

  const profile = await prisma.extraProfile.findUnique({
    where: { id: extraProfileId },
  });
  if (!profile) {
    return res.status(404).json({ error: 'Extra profile not found' });
  }

  const tally = await buildTally(extraProfileId);
  return res.json(tally);
}

module.exports = { getMyInvites, respondToInvite, getMyTally, getExtraTally };