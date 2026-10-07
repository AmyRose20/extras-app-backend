const crypto = require('crypto');
require('../config/firebase'); // initializes the Firebase app
const { getMessaging } = require('firebase-admin/messaging');
const { sendEmail, emailLayout, escapeHtml } = require('./email');

// Tells extras about something (Phase 3 Part 11):
//   - extras WITH a smartphone get a push alert
//   - extras WITHOUT a smartphone (hasSmartphone = false) get an email instead
//
// Each extra passed in is an ExtraProfile that also includes its user's name and email.
// Add EXTRA_WITH_USER to the query to get that:
//   prisma.extraProfile.findMany({ where: ..., include: EXTRA_WITH_USER })
const EXTRA_WITH_USER = { user: { select: { name: true, email: true } } };

// Where an extra's emails go: the contact email on their profile, or their login email if that's empty
function emailAddressFor(extra) {
  return (extra.contactEmail && extra.contactEmail.trim()) || extra.user?.email || null;
}

// The full web address of a page on this backend, e.g. appUrl('/email/invite/abc')
// → "http://localhost:4000/email/invite/abc"
function appUrl(path) {
  const base = (process.env.APP_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');
  return `${base}${path}`;
}

// Turns a link code into its SHA-256 hash (what we store in the database).
// A fast hash is fine here, unlike the 6-digit reset codes: these codes are 64 random
// characters, so they can't be guessed by trying every possibility.
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// Makes a new random code for a link in an email.
// The code goes in the email; only the hash is saved in the database.
function newLinkToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashToken(token) };
}

// The plain email used when there's no special one: "Hi <name>," + the message
function simpleEmail(extra, title, body) {
  const name = extra.user?.name || 'there';
  return {
    subject: title,
    text: `Hi ${name},\n\n${body}`,
    html: emailLayout(title, `<p>Hi ${escapeHtml(name)},</p><p>${escapeHtml(body)}</p>`),
  };
}

// notifyExtras(extras, { title, body, buildEmail })
//   title, body – the push alert text (also used for the plain email)
//   buildEmail  – optional: async (extra) => ({ subject, text, html }) for a custom email
// Never throws: a failed push or email is just logged, so the coordinator's action still succeeds.
async function notifyExtras(extras, { title, body, buildEmail }) {
  const pushExtras = extras.filter((extra) => extra.hasSmartphone !== false);
  const emailExtras = extras.filter((extra) => extra.hasSmartphone === false);

  // 1) Push alerts (extras who haven't opened the app yet have no token, so they're skipped)
  const tokens = pushExtras.map((extra) => extra.fcmToken).filter((token) => !!token);
  if (tokens.length > 0) {
    try {
      const response = await getMessaging().sendEachForMulticast({ notification: { title, body }, tokens });
      console.log(`Push sent: ${response.successCount} succeeded, ${response.failureCount} failed`);
    } catch (err) {
      console.error('Error sending push notifications:', err);
    }
  }

  // 2) Emails (sent at the same time; one failing doesn't stop the others)
  if (emailExtras.length === 0) return;

  const results = await Promise.allSettled(
    emailExtras.map(async (extra) => {
      const to = emailAddressFor(extra);
      if (!to) {
        console.log(`Extra ${extra.id} has no email address, so no email was sent`);
        return;
      }
      const email = buildEmail ? await buildEmail(extra) : simpleEmail(extra, title, body);
      await sendEmail({ to, ...email, detailsFooter: true }); // these all go to extras without a smartphone
    })
  );

  const failed = results.filter((result) => result.status === 'rejected');
  failed.forEach((result) => console.error('Error sending notification email:', result.reason?.message || result.reason));
  console.log(`Emails sent: ${emailExtras.length - failed.length} succeeded, ${failed.length} failed`);
}

// Same thing for just one extra
function notifyExtra(extra, message) {
  return notifyExtras([extra], message);
}

module.exports = { notifyExtras, notifyExtra, EXTRA_WITH_USER, emailAddressFor, appUrl, hashToken, newLinkToken };