const prisma = require('../config/db');

// POST /shoot-days — ADMIN creates a new shoot day
async function createShootDay(req, res) {
  try {
    const { productionName, date, location } = req.body;

    if (!productionName || !date || !location) {
      return res.status(400).json({
        error: 'productionName, date and location are required',
      });
    }

    const shootDay = await prisma.shootDay.create({
      data: {
        productionName,
        date: new Date(date),
        location,
        createdById: req.user.userId,
      },
    });

    return res.status(201).json(shootDay);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong creating the shoot day' });
  }
}

module.exports = { createShootDay };