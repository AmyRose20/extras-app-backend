const prisma = require('../config/db');
require('../config/firebase'); // initializes the Firebase app
const { getMessaging } = require('firebase-admin/messaging');

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

// GET /shoot-days — ADMIN sees every shoot day, most recent first
async function getShootDays(req, res) {
  try {
    const shootDays = await prisma.shootDay.findMany({
      orderBy: { date: 'desc' },
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

// GET /shoot-days/:id — ADMIN sees one shoot day plus its call requests
async function getShootDay(req, res) {
  try {
    const { id } = req.params;

    const shootDay = await prisma.shootDay.findUnique({
      where: { id },
      include: { callRequests: true },
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
    const { id } = req.params;
    const { date } = req.body;

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    const shootDay = await prisma.shootDay.findUnique({ where: { id } });
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

        const updated = await prisma.shootDay.update({
      where: { id },
      data: { date: newDate },
    });

    await sendShootDayUpdateNotifications(updated);

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong updating that shoot day' });
  }
}

// Notifies extras who have ACCEPTED an invite on any of this shoot day's
// call requests that the date/time has changed. Extras with a still-PENDING
// invite aren't notified here — they'll see the updated date/time the next
// time they load their invites, since that's always a live fetch anyway.
async function sendShootDayUpdateNotifications(shootDay) {
  const acceptedInvites = await prisma.callInvite.findMany({
    where: {
      status: 'ACCEPTED',
      callRequest: { shootDayId: shootDay.id },
    },
    include: { extraProfile: true },
  });

  const tokens = acceptedInvites
    .map((invite) => invite.extraProfile.fcmToken)
    .filter((token) => token != null && token !== '');

  if (tokens.length === 0) {
    console.log('No FCM tokens to send to for this shoot day update');
    return;
  }

  const message = {
    notification: {
      title: 'Shoot Day Updated',
      body: `${shootDay.productionName}'s date/time has changed to ${new Date(shootDay.date).toLocaleString()}`,
    },
    tokens,
  };

  try {
    const response = await getMessaging().sendEachForMulticast(message);
    console.log(`Push sent: ${response.successCount} succeeded, ${response.failureCount} failed`);
  } catch (error) {
    console.error('Error sending shoot day update notifications:', error);
  }
}

module.exports = { createShootDay, getShootDays, getShootDay, updateShootDay };