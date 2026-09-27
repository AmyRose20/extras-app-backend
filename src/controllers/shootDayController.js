const prisma = require('../config/db');
require('../config/firebase'); // initializes the Firebase app
const { getMessaging } = require('firebase-admin/messaging');

// Include this on shoot day queries so responses carry the production's name.
const PRODUCTION_SELECT = { select: { id: true, name: true } };

// A key that identifies a calendar date regardless of the time portion,
// so two shoot days on the same day but different times still count as
// a clash.
function toDayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// DD-MM-YYYY, matching how dates are shown elsewhere in the app.
function formatDateForMessage(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

// Every coordinator must be linked to a production. Returns the
// productionId, or sends a 403 and returns null if they aren't linked.
function requireProduction(req, res) {
  if (!req.user.productionId) {
    res.status(403).json({ error: 'Your account is not linked to a production' });
    return null;
  }
  return req.user.productionId;
}

// POST /shoot-days — ADMIN creates a new shoot day for THEIR production
// body: { "date": "...", "location": "..." }
async function createShootDay(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { date, location } = req.body;

    if (!date || !location) {
      return res.status(400).json({ error: 'date and location are required' });
    }

    const shootDay = await prisma.shootDay.create({
      data: {
        productionId,
        date: new Date(date),
        location,
        createdById: req.user.userId,
      },
      include: { production: PRODUCTION_SELECT },
    });

    return res.status(201).json(shootDay);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong creating the shoot day' });
  }
}

// GET /shoot-days — ADMIN sees every shoot day for THEIR production, most recent first
async function getShootDays(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const shootDays = await prisma.shootDay.findMany({
      where: { productionId },
      orderBy: { date: 'desc' },
      include: { production: PRODUCTION_SELECT },
    });

    const withPastFlag = shootDays.map((day) => ({
      ...day,
      isPast: new Date(day.date) < new Date(),
    }));

    return res.json(withPastFlag);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong loading shoot days' });
  }
}

// GET /shoot-days/:id — ADMIN sees one shoot day plus its call requests.
// Only works for shoot days in their own production.
async function getShootDay(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { id } = req.params;

    // findFirst (not findUnique) so we can filter on productionId as well as id
    const shootDay = await prisma.shootDay.findFirst({
      where: { id, productionId },
      include: { callRequests: true, production: PRODUCTION_SELECT },
    });

    if (!shootDay) {
      return res.status(404).json({ error: 'Shoot day not found' });
    }

    return res.json({
      ...shootDay,
      isPast: new Date(shootDay.date) < new Date(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong loading that shoot day' });
  }
}

// PATCH /shoot-days/:id — ADMIN edits a shoot day's date/time.
// Blocked once the shoot day has already passed, and the new
// date/time can't itself be in the past.
// body: { "date": "2026-10-01T18:00:00.000Z" }
async function updateShootDay(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { id } = req.params;
    const { date } = req.body;

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    const shootDay = await prisma.shootDay.findFirst({
      where: { id, productionId },
      include: { production: PRODUCTION_SELECT },
    });
    if (!shootDay) {
      return res.status(404).json({ error: 'Shoot day not found' });
    }

    if (new Date(shootDay.date) < new Date()) {
      return res.status(400).json({ error: 'This shoot day has already passed and can no longer be edited' });
    }

    const newDate = new Date(date);
    if (newDate < new Date()) {
      return res.status(400).json({ error: 'The new date/time cannot be in the past' });
    }

    // Same production can't have two shoot days on the same calendar date
    const otherShootDays = await prisma.shootDay.findMany({
      where: {
        productionId,
        id: { not: shootDay.id },
      },
      select: { date: true },
    });
    const newDayKey = toDayKey(newDate);
    const conflict = otherShootDays.some((d) => toDayKey(d.date) === newDayKey);

    if (conflict) {
      return res.status(400).json({
        error: `${shootDay.production.name} already has a shoot day on ${formatDateForMessage(newDate)}`,
      });
    }

    const updated = await prisma.shootDay.update({
      where: { id },
      data: { date: newDate },
      include: { production: PRODUCTION_SELECT },
    });

    await sendShootDayUpdateNotifications(updated);

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong updating that shoot day' });
  }
}

// Notify every extra with an ACCEPTED invite on this shoot day that its
// date/time has changed. Expects shootDay to include production.
async function sendShootDayUpdateNotifications(shootDay) {
  try {
    const acceptedInvites = await prisma.callInvite.findMany({
      where: {
        status: 'ACCEPTED',
        callRequest: { shootDayId: shootDay.id },
      },
      include: { extraProfile: true },
    });

    const tokens = acceptedInvites
      .map((invite) => invite.extraProfile.fcmToken)
      .filter((token) => !!token);

    if (tokens.length === 0) {
      return;
    }

    const message = {
      notification: {
        title: 'Shoot day updated',
        body: `${shootDay.production.name} has a new date/time: ${formatDateForMessage(shootDay.date)}`,
      },
      tokens,
    };

    const response = await getMessaging().sendEachForMulticast(message);
    console.log(`Push sent: ${response.successCount} succeeded, ${response.failureCount} failed`);
  } catch (err) {
    console.error('Error sending shoot day update notifications:', err);
  }
}

// POST /shoot-days/bulk — ADMIN creates several shoot days at once for
// THEIR production. Each day can have its own date/time and location.
// body: {
//   "shootDays": [
//     { "date": "2026-09-22T08:00:00.000Z", "location": "Riverside Studios" },
//     { "date": "2026-09-23T09:30:00.000Z", "location": "Downtown Lot" }
//   ]
// }
async function createShootDaysBulk(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { shootDays } = req.body;

    if (!Array.isArray(shootDays) || shootDays.length === 0) {
      return res.status(400).json({ error: 'A non-empty shootDays array is required' });
    }

    for (const day of shootDays) {
      if (!day.date || !day.location) {
        return res.status(400).json({ error: 'Each shoot day needs a date and a location' });
      }
    }

    // Look up the production's name for error messages
    const production = await prisma.production.findUnique({ where: { id: productionId } });

    // Catch two days in this same batch landing on the same calendar date.
    const seenDayKeys = new Set();
    for (const day of shootDays) {
      const dayKey = toDayKey(day.date);
      if (seenDayKeys.has(dayKey)) {
        return res.status(400).json({
          error: `You've entered more than one shoot day for ${production.name} on ${formatDateForMessage(day.date)}`,
        });
      }
      seenDayKeys.add(dayKey);
    }

    // Catch a date this production already has a shoot day on.
    const existingShootDays = await prisma.shootDay.findMany({
      where: { productionId },
      select: { date: true },
    });
    const existingDayKeys = new Set(existingShootDays.map((d) => toDayKey(d.date)));

    const conflict = shootDays.find((day) => existingDayKeys.has(toDayKey(day.date)));
    if (conflict) {
      return res.status(400).json({
        error: `${production.name} already has a shoot day on ${formatDateForMessage(conflict.date)}`,
      });
    }

    const created = await prisma.$transaction(
      shootDays.map((day) =>
        prisma.shootDay.create({
          data: {
            productionId,
            date: new Date(day.date),
            location: day.location,
            createdById: req.user.userId,
          },
          include: { production: PRODUCTION_SELECT },
        })
      )
    );

    return res.status(201).json(created);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong creating those shoot days' });
  }
}

module.exports = { createShootDay, getShootDays, getShootDay, updateShootDay, createShootDaysBulk };