const prisma = require('../config/db');
const { hashToken, emailAddressFor } = require('../utils/notify');
const { sendEmail, escapeHtml } = require('../utils/email');
const { sendPage } = require('../utils/webPage');
const { detailsHtml, directionsUrl, buildBookedEmail } = require('../utils/inviteEmails');
const { VALID_TRANSITIONS } = require('./callInviteController');

// Pages opened from the buttons in invite emails (Phase 3 Part 11), for extras without a smartphone.
// No login: the long random code in the link proves it's them.
// Opening a link (GET) only SHOWS the page. Only pressing the button (POST) changes anything,
// because some email apps open links by themselves to scan them.

// ?answer=... in the link → the invite status it means
const ANSWERS = { accept: 'ACCEPTED', decline: 'DECLINED', cancel: 'CANCELLED' };
const ANSWER_FOR_STATUS = { ACCEPTED: 'accept', DECLINED: 'decline', CANCELLED: 'cancel' };

const BUTTONS = {
  ACCEPTED: { label: 'Yes, accept this call', className: 'btn-primary' },
  DECLINED: { label: 'Decline', className: 'btn-secondary' },
  CANCELLED: { label: "Cancel – I can't make it", className: 'btn-danger' },
};

const HEADINGS = {
  ACCEPTED: 'Accept this call?',
  DECLINED: 'Decline this call?',
  CANCELLED: 'Cancel your booking?',
};

const STATUS_TEXT = {
  PENDING: "You haven't answered this call yet.",
  ACCEPTED: "You've accepted this call – you're booked.",
  DECLINED: "You've declined this call.",
  CANCELLED: "You've cancelled this booking.",
  EXPIRED: 'This call is no longer open.',
  NO_SHOW: 'You were marked as not turning up for this shoot day.',
};

const DONE = {
  ACCEPTED: ["You're booked!", "Thanks – the coordinator can see you've accepted. We've emailed you the details, with a link in case you can't make it any more."],
  DECLINED: ['Call declined', "Thanks for letting us know. You'll still get future calls."],
  CANCELLED: ['Booking cancelled', "Thanks for letting us know. The coordinator can see you're no longer coming."],
};

const BAD_LINK_MESSAGE = "<p>This link isn't working. It may have been copied wrongly, or it's no longer valid.</p><p class=\"muted\">If you think this is a mistake, please contact your coordinator.</p>";

// Finds the invite a link belongs to (or null). Codes are 64 letters/numbers; anything else is ignored.
async function findInviteByToken(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;

  const invite = await prisma.callInvite.findUnique({
    where: { responseTokenHash: hashToken(token) },
    include: {
      callRequest: { include: { shootDay: { include: { production: { select: { name: true } } } } } },
      extraProfile: { include: { user: { select: { name: true, email: true, deletedAt: true } } } },
    },
  });

  if (!invite || invite.extraProfile.user.deletedAt) return null;
  return invite;
}

function shootDayHasPassed(invite) {
  return new Date(invite.callRequest.shootDay.date) < new Date();
}

// What this extra can do right now (same rules as the app)
function allowedActions(invite) {
  if (shootDayHasPassed(invite)) return [];
  return VALID_TRANSITIONS[invite.status] || [];
}

// Draws the page: message, call details, directions, and a button for each action
function renderInvitePage(res, statusCode, invite, token, heading, message, actions) {
  const name = invite.extraProfile.user.name;
  const shootDay = invite.callRequest.shootDay;

  const buttons = actions
    .map((status) => {
      const { label, className } = BUTTONS[status];
      return `<form method="post" action="/email/invite/${token}">
                <input type="hidden" name="answer" value="${ANSWER_FOR_STATUS[status]}">
                <button type="submit" class="btn ${className}">${escapeHtml(label)}</button>
              </form>`;
    })
    .join('');

  const cancelWarning = actions.includes('CANCELLED')
    ? '<p class="muted">Cancelling after accepting is recorded on your profile, so please only cancel if you really can\'t make it.</p>'
    : '';

  sendPage(
    res,
    statusCode,
    heading,
    `<p>Hi ${escapeHtml(name)},</p>
     <p class="status">${escapeHtml(message)}</p>
     ${detailsHtml(invite.callRequest)}
     <p><a href="${escapeHtml(directionsUrl(shootDay))}" target="_blank" rel="noopener">Get directions</a></p>
     ${cancelWarning}
     <div class="actions">${buttons}</div>`
  );
}

// GET /email/invite/:token?answer=accept|decline|cancel — shows the call and the buttons
async function showInvitePage(req, res) {
  try {
    const { token } = req.params;
    const invite = await findInviteByToken(token);
    if (!invite) return sendPage(res, 404, 'Link not working', BAD_LINK_MESSAGE);

    const actions = allowedActions(invite);
    const requested = ANSWERS[req.query.answer];
    const canDoRequested = requested && actions.includes(requested);

    // Put the button they clicked in the email first
    const ordered = canDoRequested ? [requested, ...actions.filter((a) => a !== requested)] : actions;
    const heading = canDoRequested ? HEADINGS[requested] : 'Your call';

    let message = STATUS_TEXT[invite.status];
    if (shootDayHasPassed(invite) && ['PENDING', 'ACCEPTED'].includes(invite.status)) {
      message = 'This shoot day has already passed, so this call can no longer be changed.';
    }

    return renderInvitePage(res, 200, invite, token, heading, message, ordered);
  } catch (err) {
    console.error(err);
    return sendPage(res, 500, 'Something went wrong', '<p>Sorry, something went wrong. Please try again in a few minutes.</p>');
  }
}

// POST /email/invite/:token — records the answer when they press the button
async function answerInvite(req, res) {
  try {
    const { token } = req.params;
    const invite = await findInviteByToken(token);
    if (!invite) return sendPage(res, 404, 'Link not working', BAD_LINK_MESSAGE);

    const newStatus = ANSWERS[req.body.answer];
    const actions = allowedActions(invite);

    if (!newStatus || !actions.includes(newStatus)) {
      return renderInvitePage(res, 400, invite, token, "That can't be changed now", STATUS_TEXT[invite.status], actions);
    }

    // Only update if the status hasn't changed since we loaded it (e.g. a double click)
    const result = await prisma.callInvite.updateMany({
      where: { id: invite.id, status: invite.status },
      data: { status: newStatus, respondedAt: new Date() },
    });
    if (result.count === 0) {
      const latest = await findInviteByToken(token);
      return renderInvitePage(res, 409, latest, token, 'Already answered', STATUS_TEXT[latest.status], allowedActions(latest));
    }
    invite.status = newStatus;

    // Accepted: email them the details, with a link in case they can't make it any more
    if (newStatus === 'ACCEPTED') {
      const to = emailAddressFor(invite.extraProfile);
      if (to) {
        try {
          await sendEmail({ to, ...buildBookedEmail(invite.extraProfile, invite.callRequest, token), detailsFooter: true });
        } catch (emailErr) {
          console.error("Could not send 'You're booked' email:", emailErr.message);
        }
      }
    }

    const [heading, message] = DONE[newStatus];
    return renderInvitePage(res, 200, invite, token, heading, message, []); // no buttons straight after answering
  } catch (err) {
    console.error(err);
    return sendPage(res, 500, 'Something went wrong', '<p>Sorry, something went wrong. Please try again in a few minutes.</p>');
  }
}

module.exports = { showInvitePage, answerInvite };