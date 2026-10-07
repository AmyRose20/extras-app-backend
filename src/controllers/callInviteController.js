const prisma = require('../config/db');

// Config for the 3-strikes flag: how many days back counts as "recent",
// and how many recent cancellations + no-shows trigger the flag.
const STRIKES_WINDOW_DAYS = 90;
const THREE_STRIKES_THRESHOLD = 3;

// Which status an invite can move to, based on its current status.
// PENDING -> ACCEPTED/DECLINED covers the initial response.
// ACCEPTED -> CANCELLED covers backing out after already accepting.
// (NO_SHOW is only ever set by a coordinator, on the Attendance screen.)
// Shared with the email answer pages (emailLinkController.js) so both follow the same rules.
const VALID_TRANSITIONS = {
  PENDING: ['ACCEPTED', 'DECLINED'],
  ACCEPTED: ['CANCELLED'],
};

// Every coordinator must be linked to a production. Returns the
// productionId, or sends a 403 and returns null if they aren't linked.
function requireProduction(req, res) {
  if (!req.user.productionId) {
    res.status(403).json({ error: 'Your account is not linked to a production' });
    return null;
  }
  return req.user.productionId;
}

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
    include: {
      callRequest: {
        include: {
          shootDay: { include: { production: { select: { id: true, name: true } } } },
        },
      },
    },
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
  if (!profile || !invite || invite.extraProfileId !== profile.id) {
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
// "worked"    = ACCEPTED invites for shoot days that have already happened
//               (no-shows are NO_SHOW, so they're not counted as worked).
// "declined" / "cancelled" / "noShows" = lifetime totals of those statuses.
// "threeStrikes" = true if recent cancellations + recent no-shows
// (in the last STRIKES_WINDOW_DAYS days) reach THREE_STRIKES_THRESHOLD.
// If productionId is given, only invites for that production are counted
// (coordinator view). If not, all productions are counted (extra's own view).
async function buildTally(extraProfileId, productionId = null) {
  const windowStart = new Date(Date.now() - STRIKES_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Added to every count below when we're limiting to one production
  const productionFilter = productionId ? { productionId } : {};

  const [worked, declined, cancelled, noShows, recentCancelled, recentNoShows] = await Promise.all([
    prisma.callInvite.count({
      where: {
        extraProfileId,
        status: 'ACCEPTED',
        callRequest: { shootDay: { date: { lt: new Date() }, ...productionFilter } },
      },
    }),
    prisma.callInvite.count({
      where: { extraProfileId, status: 'DECLINED', callRequest: { shootDay: productionFilter } },
    }),
    prisma.callInvite.count({
      where: { extraProfileId, status: 'CANCELLED', callRequest: { shootDay: productionFilter } },
    }),
    prisma.callInvite.count({
      where: { extraProfileId, status: 'NO_SHOW', callRequest: { shootDay: productionFilter } },
    }),
    // Recent cancellation = cancelled (respondedAt) in the window
    prisma.callInvite.count({
      where: {
        extraProfileId,
        status: 'CANCELLED',
        respondedAt: { gte: windowStart },
        callRequest: { shootDay: productionFilter },
      },
    }),
    // Recent no-show = the shoot day they missed was in the window
    prisma.callInvite.count({
      where: {
        extraProfileId,
        status: 'NO_SHOW',
        callRequest: { shootDay: { date: { gte: windowStart }, ...productionFilter } },
      },
    }),
  ]);

  return {
    worked,
    declined,
    cancelled,
    noShows,
    threeStrikes: recentCancelled + recentNoShows >= THREE_STRIKES_THRESHOLD,
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

// GET /invites/tally/:extraProfileId — an ADMIN sees the lifetime tally
// of an extra on THEIR production
async function getExtraTally(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { extraProfileId } = req.params;

    const profile = await prisma.extraProfile.findFirst({
      where: { id: extraProfileId, memberships: { some: { productionId, status: 'APPROVED' } } },
    });
    if (!profile) {
      return res.status(404).json({ error: 'Extra profile not found' });
    }

    const tally = await buildTally(extraProfileId, productionId);
    return res.json(tally);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong loading that tally' });
  }
}

module.exports = { getMyInvites, respondToInvite, getMyTally, getExtraTally, VALID_TRANSITIONS };