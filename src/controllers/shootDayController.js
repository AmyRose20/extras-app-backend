const prisma = require('../config/db');
const { notifyExtras, EXTRA_WITH_USER, newLinkToken } = require('../utils/notify');
const { buildShootDayChangedEmail } = require('../utils/inviteEmails');

// Include this on shoot day queries so responses carry the production's name.
const PRODUCTION_SELECT = { select: { id: true, name: true } };

const HOUR = 60 * 60 * 1000;
const MAX_WRAP_HOURS = 24;

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

// HH:MM (24-hour)
function formatTimeForMessage(date) {
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

// Checks an estimated wrap time against the call time.
// wrapInput: undefined = not provided, null/'' = clear it, otherwise a date string.
// The app works out overnight wraps (e.g. 18:00 call, 04:00 wrap -> next day)
// and sends the full date/time; here we just check it makes sense.
// Returns { value } or { error }.
function checkWrapTime(callDate, wrapInput) {
  if (wrapInput === undefined) return { value: undefined };
  if (wrapInput === null || wrapInput === '') return { value: null };

  const call = new Date(callDate);
  const wrap = new Date(wrapInput);

  if (isNaN(wrap.getTime())) {
    return { error: 'Estimated wrap time is not a valid date/time' };
  }
  if (wrap <= call) {
    return { error: 'Estimated wrap time must be after the call time' };
  }
  if (wrap - call > MAX_WRAP_HOURS * HOUR) {
    return { error: `Estimated wrap time must be within ${MAX_WRAP_HOURS} hours of the call time` };
  }
  return { value: wrap };
}

// Checks an optional map pin. Both missing/null = no pin (fine).
// Otherwise both must be valid coordinates.
// Returns { value: { latitude, longitude } } or { error }.
function checkPin(latitude, longitude) {
  const missing = (v) => v === undefined || v === null || v === '';
  if (missing(latitude) && missing(longitude)) {
    return { value: { latitude: null, longitude: null } };
  }
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { error: 'The map pin has invalid coordinates' };
  }
  return { value: { latitude: lat, longitude: lng } };
}

// POST /shoot-days — ADMIN creates a new shoot day for THEIR production
// body: { "date": "...", "location": "Ashford Studios - Phase 1",
//         "locationAddress": "Ballyhenry, Ashford, Co. Wicklow",
//         "estimatedWrapAt": "..." (optional) }
async function createShootDay(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { date, location, locationAddress, estimatedWrapAt, latitude, longitude } = req.body;

    if (!date || !location?.trim() || !locationAddress?.trim()) {
      return res.status(400).json({ error: 'date, meeting point name and address are required' });
    }

    if (new Date(date) < new Date()) {
      return res.status(400).json({ error: "Shoot days can't be in the past" });
    }

    const wrap = checkWrapTime(date, estimatedWrapAt);
    if (wrap.error) return res.status(400).json({ error: wrap.error });

    const pin = checkPin(latitude, longitude);
    if (pin.error) return res.status(400).json({ error: pin.error });

    const shootDay = await prisma.shootDay.create({
      data: {
        productionId,
        date: new Date(date),
        location: location.trim(),
        locationAddress: locationAddress.trim(),
        estimatedWrapAt: wrap.value ?? null,
        ...pin.value, // latitude + longitude (or nulls)
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

// PATCH /shoot-days/:id — ADMIN edits a shoot day. Every field is optional:
// body: { "date": "...", "estimatedWrapAt": "..." | null,
//         "location": "...", "locationAddress": "...",
//         "latitude": 53.0 | null, "longitude": -6.1 | null }
// Blocked once the shoot day has already passed. Extras with an ACCEPTED
// invite are notified of whatever actually changed.
async function updateShootDay(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { id } = req.params;
    const { date, estimatedWrapAt, location, locationAddress, latitude, longitude } = req.body;

    if ([date, estimatedWrapAt, location, locationAddress, latitude, longitude].every((v) => v === undefined)) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    // 1) Load the shoot day FIRST — everything below uses it
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

    const data = {};     // what we'll actually save
    const changes = [];  // human-readable list for the push notification

    // 2) Call date/time
    let callDate = new Date(shootDay.date);
    if (date !== undefined) {
      const newDate = new Date(date);
      if (newDate < new Date()) {
        return res.status(400).json({ error: 'The new date/time cannot be in the past' });
      }

      // Same production can't have two shoot days on the same calendar date
      const otherShootDays = await prisma.shootDay.findMany({
        where: { productionId, id: { not: shootDay.id } },
        select: { date: true },
      });
      const newDayKey = toDayKey(newDate);
      if (otherShootDays.some((d) => toDayKey(d.date) === newDayKey)) {
        return res.status(400).json({
          error: `${shootDay.production.name} already has a shoot day on ${formatDateForMessage(newDate)}`,
        });
      }

      if (newDate.getTime() !== callDate.getTime()) {
        data.date = newDate;
        changes.push(`new call time ${formatDateForMessage(newDate)} ${formatTimeForMessage(newDate)}`);
      }
      callDate = newDate;
    }

    // 3) Estimated wrap time
    if (estimatedWrapAt !== undefined) {
      const wrap = checkWrapTime(callDate, estimatedWrapAt);
      if (wrap.error) return res.status(400).json({ error: wrap.error });
      data.estimatedWrapAt = wrap.value;
    } else if (data.date && shootDay.estimatedWrapAt) {
      // Call time moved but no new wrap sent: keep the same length of day
      const shift = callDate.getTime() - new Date(shootDay.date).getTime();
      data.estimatedWrapAt = new Date(new Date(shootDay.estimatedWrapAt).getTime() + shift);
    }

    if ('estimatedWrapAt' in data) {
      const oldWrap = shootDay.estimatedWrapAt ? new Date(shootDay.estimatedWrapAt).getTime() : null;
      const newWrap = data.estimatedWrapAt ? data.estimatedWrapAt.getTime() : null;
      if (oldWrap !== newWrap) {
        changes.push(newWrap ? `est. wrap ${formatTimeForMessage(data.estimatedWrapAt)}` : 'wrap time removed');
      } else {
        delete data.estimatedWrapAt; // no real change
      }
    }

    // 4) Meeting point (name, address and optional map pin)
    if (
      location !== undefined ||
      locationAddress !== undefined ||
      latitude !== undefined ||
      longitude !== undefined
    ) {
      const newName = (location ?? shootDay.location ?? '').trim();
      const newAddress = (locationAddress ?? shootDay.locationAddress ?? '').trim();

      if (!newName || !newAddress) {
        return res.status(400).json({ error: 'Meeting point needs a name and an address' });
      }

      // Pin: if a pin was sent, use it (null clears it); otherwise keep the existing one
      let newLat = shootDay.latitude;
      let newLng = shootDay.longitude;
      if (latitude !== undefined || longitude !== undefined) {
        const pin = checkPin(latitude, longitude);
        if (pin.error) return res.status(400).json({ error: pin.error });
        newLat = pin.value.latitude;
        newLng = pin.value.longitude;
      }

      const changed =
        newName !== shootDay.location ||
        newAddress !== (shootDay.locationAddress ?? '') ||
        newLat !== shootDay.latitude ||
        newLng !== shootDay.longitude;

      if (changed) {
        data.location = newName;
        data.locationAddress = newAddress;
        data.latitude = newLat;
        data.longitude = newLng;
        changes.push(`meeting point: ${newName}`);
      }
    }

    // 5) Nothing actually changed — just send the shoot day back
    if (Object.keys(data).length === 0) {
      return res.json(shootDay);
    }

    const updated = await prisma.shootDay.update({
      where: { id },
      data,
      include: { production: PRODUCTION_SELECT },
    });

    if (changes.length > 0) {
      await sendShootDayUpdateNotifications(updated, changes);
    }

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong updating that shoot day' });
  }
}

// Tells extras who've accepted a call on this shoot day what changed. Expects shootDay to include production.
//   - smartphone: push alert
//   - no smartphone: email with the full updated details + a fresh Cancel link (Phase 3 Part 11)
async function sendShootDayUpdateNotifications(shootDay, changes) {
  try {
    const acceptedInvites = await prisma.callInvite.findMany({
      where: {
        status: 'ACCEPTED',
        callRequest: { shootDayId: shootDay.id },
      },
      include: { extraProfile: { include: EXTRA_WITH_USER }, callRequest: true },
    });

    // Someone could be accepted on two call requests for the same day, so only tell each extra once
    // (keyed by extra, keeping their first invite for the email's Cancel link)
    const inviteByExtra = new Map();
    acceptedInvites.forEach((invite) => {
      if (!inviteByExtra.has(invite.extraProfileId)) inviteByExtra.set(invite.extraProfileId, invite);
    });
    const extras = [...inviteByExtra.values()].map((invite) => invite.extraProfile);

    await notifyExtras(extras, {
      title: 'Shoot day updated',
      body: `${shootDay.production.name} (${formatDateForMessage(shootDay.date)}) updated: ${changes.join(', ')}`,
      buildEmail: async (extra) => {
        const invite = inviteByExtra.get(extra.id);
        const { token, tokenHash } = newLinkToken();
        await prisma.callInvite.update({
          where: { id: invite.id },
          data: { responseTokenHash: tokenHash },
        });
        // The invite's call request, with the UPDATED shoot day (new time/meeting point)
        return buildShootDayChangedEmail(extra, { ...invite.callRequest, shootDay }, token, changes);
      },
    });
  } catch (err) {
    console.error('Error sending shoot day update notifications:', err);
  }
}

// POST /shoot-days/bulk — ADMIN creates several shoot days at once for
// THEIR production. Each day has its own date/time, meeting point and
// optional wrap time.
// body: {
//   "shootDays": [
//     { "date": "...", "location": "Ashford Studios - Phase 1",
//       "locationAddress": "Ballyhenry, Ashford, Co. Wicklow",
//       "estimatedWrapAt": "..." },
//     ...
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

    // Validate every day (and its wrap time) before creating anything
    const checkedWraps = [];
    const checkedPins = [];
    for (const day of shootDays) {
      if (!day.date || !day.location?.trim() || !day.locationAddress?.trim()) {
        return res.status(400).json({ error: 'Each shoot day needs a date, meeting point name and address' });
      }
      if (new Date(day.date) < new Date()) {
        return res.status(400).json({ error: `${formatDateForMessage(day.date)}: shoot days can't be in the past` });
      }
      const wrap = checkWrapTime(day.date, day.estimatedWrapAt);
      if (wrap.error) {
        return res.status(400).json({ error: `${formatDateForMessage(day.date)}: ${wrap.error}` });
      }
      checkedWraps.push(wrap.value ?? null);
      const pin = checkPin(day.latitude, day.longitude);
      if (pin.error) {
        return res.status(400).json({ error: `${formatDateForMessage(day.date)}: ${pin.error}` });
      }
      checkedPins.push(pin.value);
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
      shootDays.map((day, index) =>
        prisma.shootDay.create({
          data: {
            productionId,
            date: new Date(day.date),
            location: day.location.trim(),
            locationAddress: day.locationAddress.trim(),
            estimatedWrapAt: checkedWraps[index],
            ...checkedPins[index], // latitude + longitude (or nulls)
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