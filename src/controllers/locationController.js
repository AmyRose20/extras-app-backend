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

// GET /locations — ADMIN gets their production's saved meeting points
// (used for the meeting point dropdown when creating/editing shoot days)
async function listMyLocations(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const locations = await prisma.location.findMany({
      where: { productionId },
      select: { id: true, name: true, address: true, latitude: true, longitude: true },
      orderBy: { name: 'asc' },
    });

    return res.json(locations);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong loading locations' });
  }
}

module.exports = { listMyLocations };