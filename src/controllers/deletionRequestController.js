const prisma = require('../config/db');

// Fields safe to send back to the client describing a user's deletion status
function toDeletionStatusPayload(user) {
  return {
    userId: user.id,
    deletionRequestStatus: user.deletionRequestStatus,
    deletionRequestedAt: user.deletionRequestedAt,
    deletionRequestedBy: user.deletionRequestedBy,
    deletionReason: user.deletionReason,
    deletionReviewedAt: user.deletionReviewedAt,
    deletionReviewedByAdminId: user.deletionReviewedByAdminId,
  };
}

// POST /deletion-requests/me  (extra requests their own account be deleted)
async function requestOwnDeletion(req, res) {
  try {
    const { reason } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.deletionRequestStatus === 'PENDING') {
      return res.status(409).json({ error: 'You already have a pending deletion request' });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        deletionRequestStatus: 'PENDING',
        deletionRequestedAt: new Date(),
        deletionRequestedBy: 'EXTRA',
        deletionReason: reason || null,
        deletionReviewedAt: null,
        deletionReviewedByAdminId: null,
      },
    });

    return res.json(toDeletionStatusPayload(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong requesting deletion' });
  }
}

// DELETE /deletion-requests/me  (extra cancels their own pending request)
async function cancelOwnDeletion(req, res) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.deletionRequestStatus !== 'PENDING') {
      return res.status(400).json({ error: 'You do not have a pending deletion request to cancel' });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        deletionRequestStatus: 'NONE',
        deletionRequestedAt: null,
        deletionRequestedBy: null,
        deletionReason: null,
        deletionReviewedAt: null,
        deletionReviewedByAdminId: null,
      },
    });

    return res.json(toDeletionStatusPayload(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong cancelling the deletion request' });
  }
}

// POST /deletion-requests/:id  (admin initiates a deletion request on behalf of an extra)
async function adminRequestDeletion(req, res) {
  try {
    const userId = req.params.id;
    const { reason } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'EXTRA') {
      return res.status(404).json({ error: 'Extra not found' });
    }
    if (user.deletionRequestStatus === 'PENDING') {
      return res.status(409).json({ error: 'This extra already has a pending deletion request' });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        deletionRequestStatus: 'PENDING',
        deletionRequestedAt: new Date(),
        deletionRequestedBy: 'ADMIN',
        deletionReason: reason || null,
        deletionReviewedAt: null,
        deletionReviewedByAdminId: null,
      },
    });

    return res.json(toDeletionStatusPayload(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong requesting deletion' });
  }
}

// GET /deletion-requests  (admin: list all pending deletion requests)
async function listPendingDeletionRequests(req, res) {
  try {
    const users = await prisma.user.findMany({
      where: { deletionRequestStatus: 'PENDING', role: 'EXTRA' },
      select: {
        id: true,
        name: true,
        email: true,
        deletionRequestedAt: true,
        deletionRequestedBy: true,
        deletionReason: true,
      },
      orderBy: { deletionRequestedAt: 'asc' },
    });

    return res.json(users);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong fetching deletion requests' });
  }
}

// PATCH /deletion-requests/:id/approve  (admin approves — soft-deletes the account)
async function approveDeletionRequest(req, res) {
  try {
    const userId = req.params.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.deletionRequestStatus !== 'PENDING') {
      return res.status(400).json({ error: 'This user does not have a pending deletion request' });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        deletionRequestStatus: 'APPROVED',
        deletedAt: new Date(),
        deletionReviewedAt: new Date(),
        deletionReviewedByAdminId: req.user.userId,
      },
    });

    return res.json(toDeletionStatusPayload(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong approving the deletion request' });
  }
}

// PATCH /deletion-requests/:id/deny  (admin denies — account stays active)
async function denyDeletionRequest(req, res) {
  try {
    const userId = req.params.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.deletionRequestStatus !== 'PENDING') {
      return res.status(400).json({ error: 'This user does not have a pending deletion request' });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        deletionRequestStatus: 'DENIED',
        deletionReviewedAt: new Date(),
        deletionReviewedByAdminId: req.user.userId,
      },
    });

    return res.json(toDeletionStatusPayload(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong denying the deletion request' });
  }
}

module.exports = {
  requestOwnDeletion,
  cancelOwnDeletion,
  adminRequestDeletion,
  listPendingDeletionRequests,
  approveDeletionRequest,
  denyDeletionRequest,
};