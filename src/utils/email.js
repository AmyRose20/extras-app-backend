const nodemailer = require('nodemailer');

// Sends emails through Brevo's SMTP server, using the SMTP_* and EMAIL_FROM_* values in .env.
// Used for password reset codes, and invites/updates for extras without a smartphone (Part 11).

let transporter = null;

// Creates the SMTP connection the first time it's needed, then reuses it
function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error('Email is not set up: add SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS to .env');
  }

  const port = Number(SMTP_PORT);
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465, // 587 starts plain and upgrades to an encrypted connection (STARTTLS)
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

// Makes text safe to put inside HTML (so a name like "<b>" can't break the email)
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Wraps an email's content in a simple, consistent layout.
// bodyHtml is already-safe HTML (escape any user text with escapeHtml first).
// <!--DETAILS_LINK--> is an invisible marker: sendEmail puts the "update your details" link there when asked.
function emailLayout(title, bodyHtml) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <div style="background:#241d3d;padding:18px 24px;color:#d99c4a;font-weight:bold;font-size:18px;">Extras App</div>
      <div style="padding:24px;">
        <h1 style="font-size:20px;margin:0 0 16px;">${escapeHtml(title)}</h1>
          ${bodyHtml}
        <!--DETAILS_LINK-->
      </div>
      <div style="padding:14px 24px;background:#f9fafb;color:#6b7280;font-size:12px;">
        This is an automated email from the Extras App. Please don't reply to it.
        <span style="display:none;font-size:0;color:transparent;">${Date.now()}</span>
      </div>
    </div>
  </body>
</html>`;
}

// Sends one email. Always give a plain-text version too (some email apps show only that).
//   sendEmail({ to: 'someone@example.com', subject: 'Hello', text: 'Hi!', html: emailLayout('Hello', '<p>Hi!</p>') })
// detailsFooter: true adds "Need to update your details?" at the bottom (emails to extras without a smartphone)
async function sendEmail({ to, subject, text, html, detailsFooter = false }) {
  const fromName = process.env.EMAIL_FROM_NAME || 'Extras App';
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;
  if (!fromAddress) {
    throw new Error('Email is not set up: add EMAIL_FROM_ADDRESS to .env');
  }

  if (detailsFooter) {
    const detailsUrl = `${(process.env.APP_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '')}/details`;
    text = `${text}\n\nNeed to update your details? ${detailsUrl}`;
    html = html.replace(
      '<!--DETAILS_LINK-->',
      `<div style="margin-top:22px;padding:12px 14px;background:#f3f4f6;border-radius:8px;font-size:14px;color:#1f2937;">
         Changed your phone number, availability or other details?
         <a href="${detailsUrl}" style="color:#2563eb;font-weight:bold;">Update my details</a>
       </div>`
    );
  }

  return getTransporter().sendMail({
    from: { name: fromName, address: fromAddress },
    to,
    subject,
    text,
    html,
  });
}

// Checks the SMTP login works (used by the test script)
async function verifyEmailConnection() {
  return getTransporter().verify();
}

module.exports = { sendEmail, emailLayout, escapeHtml, verifyEmailConnection };