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

// POST /locations — ADMIN saves a new meeting point for THEIR production
// body: { "name": "Brittas Bay beach car park", "address": "Brittas Bay, Co. Wicklow" }
// If a location with the same name (ignoring upper/lower case) is already
// saved for this production, that one is returned instead of a duplicate.
async function createLocation(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const name = req.body.name?.trim();
    const address = req.body.address?.trim();

    if (!name || !address) {
      return res.status(400).json({ error: 'name and address are required' });
    }

    const select = { id: true, name: true, address: true, latitude: true, longitude: true };

    const existing = await prisma.location.findFirst({
      where: { productionId, name: { equals: name, mode: 'insensitive' } },
      select,
    });
    if (existing) {
      return res.json(existing);
    }

    const location = await prisma.location.create({
      data: { name, address, productionId },
      select,
    });

    return res.status(201).json(location);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong saving that location' });
  }
}

module.exports = { listMyLocations, createLocation };