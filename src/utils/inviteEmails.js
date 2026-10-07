const { emailLayout, escapeHtml } = require('./email');
const { appUrl } = require('./notify');

// Emails for extras without a smartphone (Phase 3 Part 11):
// the call request invite (Accept / Decline) and "You're booked" (with a Cancel link).
// callRequest must include shootDay, and shootDay must include production.

const TIME_ZONE = 'Europe/Dublin';

// "Friday 16 October 2026"
function formatDay(date) {
  return new Intl.DateTimeFormat('en-IE', {
    timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(date)).replace(',', '');
}

// "07:30"
function formatTime(date) {
  return new Intl.DateTimeFormat('en-IE', {
    timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(date));
}

// The details of a call as [label, value] pairs, shared by the emails and the web page
function detailRows(callRequest) {
  const shootDay = callRequest.shootDay;
  const rows = [
    ['Production', shootDay.production.name],
    ['Date', formatDay(shootDay.date)],
    ['Call time', formatTime(shootDay.date)],
  ];
  if (shootDay.estimatedWrapAt) rows.push(['Est. wrap', formatTime(shootDay.estimatedWrapAt)]);
  rows.push(['Meeting point', shootDay.locationAddress ? `${shootDay.location}, ${shootDay.locationAddress}` : shootDay.location]);
  rows.push(['Call', callRequest.description]);
  return rows;
}

function detailsText(callRequest) {
  return detailRows(callRequest).map(([label, value]) => `${label}: ${value}`).join('\n');
}

// cssClass is used on the web page; emails need inline styles instead (email apps ignore <style>)
function detailsHtml(callRequest, { forEmail = false } = {}) {
  const labelStyle = forEmail ? ' style="color:#6b7280;padding:6px 12px 6px 0;vertical-align:top;"' : ' class="label"';
  const valueStyle = forEmail ? ' style="padding:6px 0;"' : '';
  const rows = detailRows(callRequest)
    .map(([label, value]) => `<tr><td${labelStyle}>${escapeHtml(label)}</td><td${valueStyle}>${escapeHtml(value)}</td></tr>`)
    .join('');
  return `<table class="details" style="border-collapse:collapse;margin:12px 0;">${rows}</table>`;
}

// Google Maps directions to the exact pin if there is one, otherwise to the address
function directionsUrl(shootDay) {
  const destination = shootDay.latitude != null && shootDay.longitude != null
    ? `${shootDay.latitude},${shootDay.longitude}`
    : shootDay.locationAddress || shootDay.location;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

// The page an extra lands on from an email button, e.g. answer = 'accept'
function answerLink(token, answer) {
  return appUrl(`/email/invite/${token}?answer=${answer}`);
}

// A button that works in email apps (a link styled with inline CSS)
function emailButton(href, label, background) {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;margin:4px 8px 4px 0;border-radius:8px;background:${background};color:#ffffff;font-weight:bold;text-decoration:none;">${escapeHtml(label)}</a>`;
}

// New call request: Accept / Decline
function buildInviteEmail(extra, callRequest, token) {
  const name = extra.user?.name || 'there';
  const shootDay = callRequest.shootDay;
  const acceptUrl = answerLink(token, 'accept');
  const declineUrl = answerLink(token, 'decline');

  return {
    subject: `New call: ${shootDay.production.name} on ${formatDay(shootDay.date)}`,
    text:
      `Hi ${name},\n\n` +
      `You've been matched for a call:\n\n${detailsText(callRequest)}\n\n` +
      `Accept: ${acceptUrl}\n` +
      `Decline: ${declineUrl}\n\n` +
      `You'll be asked to confirm on the next page.`,
    html: emailLayout(
      'New call request',
      `<p>Hi ${escapeHtml(name)},</p>
       <p>You've been matched for a call:</p>
       ${detailsHtml(callRequest, { forEmail: true })}
       <p>${emailButton(acceptUrl, 'Accept', '#2563eb')}${emailButton(declineUrl, 'Decline', '#6b7280')}</p>
       <p style="color:#6b7280;font-size:13px;">You'll be asked to confirm on the next page.</p>`
    ),
  };
}

// Sent after accepting from an email: the details again, directions, and a Cancel link
function buildBookedEmail(extra, callRequest, token) {
  const name = extra.user?.name || 'there';
  const shootDay = callRequest.shootDay;
  const cancelUrl = answerLink(token, 'cancel');
  const mapsUrl = directionsUrl(shootDay);

  return {
    subject: `You're booked: ${shootDay.production.name} on ${formatDay(shootDay.date)}`,
    text:
      `Hi ${name},\n\n` +
      `You're booked for this call:\n\n${detailsText(callRequest)}\n\n` +
      `Get directions: ${mapsUrl}\n\n` +
      `Can't make it any more? Let us know here: ${cancelUrl}`,
    html: emailLayout(
      "You're booked",
      `<p>Hi ${escapeHtml(name)},</p>
       <p>You're booked for this call:</p>
       ${detailsHtml(callRequest, { forEmail: true })}
       <p>${emailButton(mapsUrl, 'Get directions', '#2563eb')}</p>
       <p style="color:#6b7280;font-size:13px;">Can't make it any more?
          <a href="${escapeHtml(cancelUrl)}" style="color:#dc2626;">Cancel your booking</a></p>`
    ),
  };
}

// Sent to booked extras when a coordinator changes the shoot day (time, wrap or meeting point).
// It gets a fresh link code, so links in earlier emails for this call stop working.
// changes: e.g. ['new call time 16-10-2026 08:00', 'meeting point: Brittas Bay']
function buildShootDayChangedEmail(extra, callRequest, token, changes) {
  const name = extra.user?.name || 'there';
  const shootDay = callRequest.shootDay;
  const cancelUrl = answerLink(token, 'cancel');
  const mapsUrl = directionsUrl(shootDay);
  const changeList = changes.join(', ');

  return {
    subject: `Shoot day changed: ${shootDay.production.name} on ${formatDay(shootDay.date)}`,
    text:
      `Hi ${name},\n\n` +
      `A shoot day you're booked for has changed (${changeList}). Here are the updated details:\n\n` +
      `${detailsText(callRequest)}\n\n` +
      `Get directions: ${mapsUrl}\n\n` +
      `Can't make it any more? Let us know here: ${cancelUrl}\n\n` +
      `This email replaces earlier ones for this call, so please use the links in this one.`,
    html: emailLayout(
      'Shoot day changed',
      `<p>Hi ${escapeHtml(name)},</p>
       <p style="background:#fff7ed;border-left:4px solid #d99c4a;padding:10px 14px;border-radius:6px;">
         A shoot day you're booked for has changed: <strong>${escapeHtml(changeList)}</strong></p>
       <p>Here are the updated details:</p>
       ${detailsHtml(callRequest, { forEmail: true })}
       <p>${emailButton(mapsUrl, 'Get directions', '#2563eb')}</p>
       <p style="color:#6b7280;font-size:13px;">Can't make it any more?
          <a href="${escapeHtml(cancelUrl)}" style="color:#dc2626;">Cancel your booking</a></p>
       <p style="color:#6b7280;font-size:13px;">This email replaces earlier ones for this call, so please use the links in this one.</p>`
    ),
  };
}

module.exports = {
  formatDay, formatTime, detailsHtml, directionsUrl,
  buildInviteEmail, buildBookedEmail, buildShootDayChangedEmail,
};