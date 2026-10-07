const prisma = require('../config/db');

// Attendance on a shoot day that has started: who didn't turn up (NO_SHOW),
// and what time each extra finished (for payroll).
// Only invites that were ACCEPTED (or already marked NO_SHOW) are involved.

const HOUR = 60 * 60 * 1000;
const MAX_SHIFT_HOURS = 24;

// Every coordinator must be linked to a production. Returns the
// productionId, or sends a 403 and returns null if they aren't linked.
function requireProduction(req, res) {
  if (!req.user.productionId) {
    res.status(403).json({ error: 'Your account is not linked to a production' });
    return null;
  }
  return req.user.productionId;
}

// Finds a shoot day on MY production that has already started (call time has passed).
// Sends an error and returns null if not.
async function findStartedShootDay(req, res) {
  const productionId = requireProduction(req, res);
  if (!productionId) return null;

  const shootDay = await prisma.shootDay.findFirst({
    where: { id: req.params.id, productionId },
  });
  if (!shootDay) {
    res.status(404).json({ error: 'Shoot day not found' });
    return null;
  }
  if (new Date(shootDay.date) > new Date()) {
    res.status(400).json({ error: 'Attendance can only be recorded once the shoot day has started' });
    return null;
  }
  return shootDay;
}

// A finish time must be after the call time, and within 24 hours of it
// (so overnight shoots that wrap after midnight are fine).
function checkFinishTime(shootDay, value) {
  if (value === null) return { value: null }; // clear it → back to the estimated wrap time
  const finished = new Date(value);
  if (isNaN(finished.getTime())) {
    return { error: 'Please enter a valid finish time' };
  }
  const call = new Date(shootDay.date);
  if (finished <= call) {
    return { error: 'The finish time must be after the call time' };
  }
  if (finished - call > MAX_SHIFT_HOURS * HOUR) {
    return { error: 'The finish time must be within 24 hours of the call time' };
  }
  return { value: finished };
}

// What the app shows for one extra
function toAttendee(invite, shootDay) {
  return {
    inviteId: invite.id,
    extraProfileId: invite.extraProfileId,
    name: invite.extraProfile?.user?.name,
    callRequest: invite.callRequest?.description,
    noShow: invite.status === 'NO_SHOW',
    // If no finish time was set for this extra, use the shoot day's estimated wrap
    finishedAt: invite.finishedAt ?? shootDay.estimatedWrapAt,
    finishTimeIsEstimate: !invite.finishedAt,
  };
}

// GET /shoot-days/:id/attendance — everyone who accepted, A–Z by name
async function getAttendance(req, res) {
  try {
    const shootDay = await findStartedShootDay(req, res);
    if (!shootDay) return;

    const invites = await prisma.callInvite.findMany({
      where: {
        status: { in: ['ACCEPTED', 'NO_SHOW'] },
        callRequest: { shootDayId: shootDay.id },
      },
      include: {
        callRequest: { select: { description: true } },
        extraProfile: { include: { user: { select: { name: true } } } },
      },
    });

    const attendees = invites
      .map((invite) => toAttendee(invite, shootDay))
      .sort((a, b) => a.name.localeCompare(b.name));

    return res.json({
      shootDay: { id: shootDay.id, date: shootDay.date, estimatedWrapAt: shootDay.estimatedWrapAt },
      attendees,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong loading attendance' });
  }
}

// PATCH /shoot-days/:id/attendance/:inviteId — one extra
// body: { "noShow": true | false }  and/or  { "finishedAt": "2026-09-18T19:30:00.000Z" | null }
async function updateAttendance(req, res) {
  try {
    const shootDay = await findStartedShootDay(req, res);
    if (!shootDay) return;

    const { noShow, finishedAt } = req.body;
    if (noShow === undefined && finishedAt === undefined) {
      return res.status(400).json({ error: 'Nothing to update' });
    }
    if (noShow !== undefined && typeof noShow !== 'boolean') {
      return res.status(400).json({ error: 'noShow must be true or false' });
    }

    const invite = await prisma.callInvite.findFirst({
      where: {
        id: req.params.inviteId,
        status: { in: ['ACCEPTED', 'NO_SHOW'] },
        callRequest: { shootDayId: shootDay.id },
      },
    });
    if (!invite) {
      return res.status(404).json({ error: "That extra isn't booked on this shoot day" });
    }

    const data = {};
    if (noShow !== undefined) {
      data.status = noShow ? 'NO_SHOW' : 'ACCEPTED';
    }
    if (finishedAt !== undefined) {
      const check = checkFinishTime(shootDay, finishedAt);
      if (check.error) {
        return res.status(400).json({ error: check.error });
      }
      data.finishedAt = check.value;
    }

    const updated = await prisma.callInvite.update({
      where: { id: invite.id },
      data,
      include: {
        callRequest: { select: { description: true } },
        extraProfile: { include: { user: { select: { name: true } } } },
      },
    });

    return res.json(toAttendee(updated, shootDay));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong updating attendance' });
  }
}

// PATCH /shoot-days/:id/finish-time — same finish time for everyone who turned up
// body: { "finishedAt": "2026-09-18T19:30:00.000Z" }
async function setFinishTimeForAll(req, res) {
  try {
    const shootDay = await findStartedShootDay(req, res);
    if (!shootDay) return;

    if (!req.body.finishedAt) {
      return res.status(400).json({ error: 'Please choose a finish time' });
    }
    const check = checkFinishTime(shootDay, req.body.finishedAt);
    if (check.error) {
      return res.status(400).json({ error: check.error });
    }

    const result = await prisma.callInvite.updateMany({
      where: { status: 'ACCEPTED', callRequest: { shootDayId: shootDay.id } }, // no-shows are skipped
      data: { finishedAt: check.value },
    });

    return res.json({ updated: result.count, finishedAt: check.value });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong setting finish times' });
  }
}

module.exports = { getAttendance, updateAttendance, setFinishTimeForAll };