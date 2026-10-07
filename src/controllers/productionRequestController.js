const prisma = require('../config/db');
const { notifyExtra, EXTRA_WITH_USER } = require('../utils/notify');
const { ageFromDob } = require('../utils/age');

// Coordinators approve or deny extras' requests to join THEIR production.
// A "request" is an ExtraProduction (membership) row with status PENDING.
// Extras create/cancel requests via PATCH /profiles/me/productions.

// Every coordinator must be linked to a production. Returns the
// productionId, or sends a 403 and returns null if they aren't linked.
function requireProduction(req, res) {
  if (!req.user.productionId) {
    res.status(403).json({ error: 'Your account is not linked to a production' });
    return null;
  }
  return req.user.productionId;
}

// GET /production-requests — an ADMIN lists PENDING requests to join their production.
// Includes enough of each extra's profile to decide (no bank details), oldest first.
async function listProductionRequests(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const requests = await prisma.extraProduction.findMany({
      where: {
        productionId,
        status: 'PENDING',
        extraProfile: { user: { deletedAt: null } }, // hide soft-deleted extras
      },
      orderBy: { requestedAt: 'asc' },
      include: {
        extraProfile: {
          include: {
            user: { select: { name: true } },
            memberships: {
              where: { status: 'APPROVED' },
              include: { production: { select: { name: true } } },
            },
          },
        },
      },
    });

    const result = requests.map((r) => {
      const p = r.extraProfile;
      return {
        id: r.id, // the request (membership) id — used to approve/deny
        requestedAt: r.requestedAt,
        extraProfileId: p.id,
        name: p.user.name,
        age: ageFromDob(p.dateOfBirth),
        gender: p.gender,
        heightCm: p.heightCm,
        skills: p.skills,
        languages: p.languages,
        facePhotoUrl: p.facePhotoUrl,
        fullBodyPhotoUrl: p.fullBodyPhotoUrl,
        currentProductions: p.memberships.map((m) => m.production.name),
      };
    });

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong loading production requests' });
  }
}

// Shared by approve + deny: only PENDING requests for MY production can be reviewed.
async function reviewRequest(req, res, newStatus) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { id } = req.params;

    const request = await prisma.extraProduction.findFirst({
      where: { id, productionId, status: 'PENDING' },
      include: {
        production: { select: { name: true } },
        extraProfile: { include: EXTRA_WITH_USER },
      },
    });
    if (!request) {
      return res.status(404).json({ error: 'Request not found, or it has already been dealt with' });
    }

    const updated = await prisma.extraProduction.update({
      where: { id },
      data: { status: newStatus, reviewedAt: new Date(), reviewedByAdminId: req.user.userId },
    });

    const productionName = request.production.name;
    if (newStatus === 'APPROVED') {
      await notifyExtra(request.extraProfile, {
        title: 'Request approved',
        body: `You've been added to ${productionName}. You'll now get calls for it.`,
      });
    } else {
      await notifyExtra(request.extraProfile, {
        title: 'Production request',
        body: `Your request to join ${productionName} wasn't approved this time.`,
      });
    }

    return res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong updating that request' });
  }
}

// PATCH /production-requests/:id/approve
function approveProductionRequest(req, res) {
  return reviewRequest(req, res, 'APPROVED');
}

// PATCH /production-requests/:id/deny
function denyProductionRequest(req, res) {
  return reviewRequest(req, res, 'DENIED');
}

module.exports = {
  listProductionRequests,
  approveProductionRequest,
  denyProductionRequest,
};