const prisma = require('../config/db');

// GET /productions — any logged-in user gets the list of productions
// (used by the extra's Edit Profile to pick which productions they're on)
async function listProductions(req, res) {
  try {
    const productions = await prisma.production.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return res.json(productions);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong loading productions' });
  }
}

module.exports = { listProductions };