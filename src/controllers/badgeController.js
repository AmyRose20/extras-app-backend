const prisma = require('../config/db');

// Notification badges: how many NEW things are waiting since the user last
// opened each screen. Opening a screen calls PATCH /badges/seen/:type,
// which resets that badge to 0 (until something newer arrives).

// Which badge belongs to which role, and which User column stores "last seen"
const BADGE_TYPES = {
  invites: { role: 'EXTRA', field: 'invitesLastSeenAt' },
  deletionRequests: { role: 'ADMIN', field: 'deletionRequestsLastSeenAt' },
  productionRequests: { role: 'ADMIN', field: 'productionRequestsLastSeenAt' },
};

// GET /badges — counts for the logged-in user
//   EXTRA → { invites }
//   ADMIN → { deletionRequests, productionRequests } (their production only)
async function getBadgeCounts(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        role: true,
        invitesLastSeenAt: true,
        deletionRequestsLastSeenAt: true,
        productionRequestsLastSeenAt: true,
      },
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'EXTRA') {
      // New invites they can still answer
      const invites = await prisma.callInvite.count({
        where: {
          extraProfile: { userId: req.user.userId },
          status: 'PENDING',
          sentAt: { gt: user.invitesLastSeenAt },
          callRequest: { shootDay: { date: { gt: new Date() } } }, // only upcoming shoot days
        },
      });
      return res.json({ invites });
    }

    // Coordinator: only requests for extras on THEIR production
    const productionId = req.user.productionId;
    if (!productionId) {
      return res.json({ deletionRequests: 0, productionRequests: 0 });
    }

    const [deletionRequests, productionRequests] = await Promise.all([
      // New deletion requests made by extras themselves
      // (ones a coordinator started aren't "news" to the coordinator)
      prisma.user.count({
        where: {
          deletionRequestStatus: 'PENDING',
          deletionRequestedBy: 'EXTRA',
          deletionRequestedAt: { gt: user.deletionRequestsLastSeenAt },
          deletedAt: null,
          extraProfile: { memberships: { some: { productionId, status: 'APPROVED' } } },
        },
      }),
      // New requests to join this production
      prisma.extraProduction.count({
        where: {
          productionId,
          status: 'PENDING',
          requestedAt: { gt: user.productionRequestsLastSeenAt },
          extraProfile: { user: { deletedAt: null } },
        },
      }),
    ]);

    return res.json({ deletionRequests, productionRequests });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong loading notifications' });
  }
}

// PATCH /badges/seen/:type — "I've just opened this screen": resets that badge to 0
async function markBadgeSeen(req, res) {
  try {
    const badge = BADGE_TYPES[req.params.type];
    if (!badge) {
      return res.status(400).json({ error: 'Unknown badge type' });
    }
    if (req.user.role !== badge.role) {
      return res.status(403).json({ error: 'That badge is not available for your account' });
    }

    await prisma.user.update({
      where: { id: req.user.userId },
      data: { [badge.field]: new Date() },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong updating notifications' });
  }
}

module.exports = { getBadgeCounts, markBadgeSeen };