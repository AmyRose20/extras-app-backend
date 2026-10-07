const crypto = require('crypto');
const bcrypt = require('bcrypt');
const prisma = require('../config/db');
const { signToken } = require('./authController');
const { checkPassword } = require('../utils/passwordRules');
const { sendEmail, emailLayout, escapeHtml } = require('../utils/email');

// Forgot password (6-digit code by email) and change password (Phase 3 Part 10).

const SALT_ROUNDS = 10;
const CODE_MINUTES = 15;        // a reset code works for 15 minutes
const MAX_CODE_ATTEMPTS = 5;    // after 5 wrong guesses the code is cancelled
const RESEND_WAIT_SECONDS = 60; // don't send another code to the same person within a minute
const MINUTE = 60 * 1000;

// The same reply whether or not the email has an account, so nobody can use this
// form to find out who's signed up.
const CODE_SENT_MESSAGE = `If an account exists for that email, we've sent it a 6-digit code. It expires in ${CODE_MINUTES} minutes.`;
const BAD_CODE_MESSAGE = 'That code is wrong or has expired. Please request a new one.';

// Now, rounded down to the whole second. Login tokens record their time in whole seconds,
// so this keeps a token made straight after a password change from being rejected.
function nowToTheSecond() {
  return new Date(Math.floor(Date.now() / 1000) * 1000);
}

// "Wednesday 7 October 2026 at 14:05" (Irish time)
function formatWhen(date) {
  return new Intl.DateTimeFormat('en-IE', {
    timeZone: 'Europe/Dublin', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date).replace(',', '').replace(', ', ' at ');
}

// Finds a (not deleted) user by email, ignoring capital letters and spaces around it
async function findUserByEmail(email) {
  if (typeof email !== 'string' || !email.trim()) return null;
  const user = await prisma.user.findFirst({
    where: { email: { equals: email.trim(), mode: 'insensitive' } },
  });
  return user && !user.deletedAt ? user : null;
}

// "Your password was changed" email — a warning in case it wasn't them
async function sendPasswordChangedEmail(user) {
  const when = formatWhen(new Date());
  try {
    await sendEmail({
      to: user.email,
      subject: 'Your Extras App password was changed',
      text:
        `Hi ${user.name},\n\n` +
        `Your Extras App password was changed on ${when}. You've been logged out on any other phones.\n\n` +
        `If this wasn't you, reset your password straight away using "Forgot password?" on the login screen, ` +
        `and let your coordinator know.`,
      html: emailLayout(
        'Your password was changed',
        `<p>Hi ${escapeHtml(user.name)},</p>
         <p>Your Extras App password was changed on <strong>${escapeHtml(when)}</strong>.
            You've been logged out on any other phones.</p>
         <p>If this wasn't you, reset your password straight away using <strong>"Forgot password?"</strong>
            on the login screen, and let your coordinator know.</p>`
      ),
    });
  } catch (err) {
    // The password has already changed, so don't fail the request over the email
    console.error('Could not send password-changed email:', err.message);
  }
}

// Saves a new password and logs out every existing login (the "log out other devices" part)
async function saveNewPassword(userId, newPassword) {
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  return prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      passwordChangedAt: nowToTheSecond(),
      resetCodeHash: null,
      resetCodeExpiresAt: null,
      resetCodeAttempts: 0,
    },
  });
}

// POST /auth/forgot-password — body: { "email": "..." }
// Emails a 6-digit code (if the account exists). Always gives the same reply.
async function requestPasswordReset(req, res) {
  try {
    const user = await findUserByEmail(req.body.email);

    if (user) {
      // A code sent less than a minute ago? Don't send another one yet.
      const sentAt = user.resetCodeExpiresAt
        ? new Date(user.resetCodeExpiresAt.getTime() - CODE_MINUTES * MINUTE)
        : null;
      const tooSoon = sentAt && Date.now() - sentAt.getTime() < RESEND_WAIT_SECONDS * 1000;

      if (!tooSoon) {
        const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0'); // e.g. "048213"

        await prisma.user.update({
          where: { id: user.id },
          data: {
            resetCodeHash: await bcrypt.hash(code, SALT_ROUNDS),
            resetCodeExpiresAt: new Date(Date.now() + CODE_MINUTES * MINUTE),
            resetCodeAttempts: 0,
          },
        });

        try {
          await sendEmail({
            to: user.email,
            subject: 'Your Extras App password reset code',
            text:
              `Hi ${user.name},\n\n` +
              `Your code to reset your Extras App password is: ${code}\n\n` +
              `It expires in ${CODE_MINUTES} minutes. If you didn't ask to reset your password, ` +
              `you can ignore this email — your password won't change.`,
            html: emailLayout(
              'Reset your password',
              `<p>Hi ${escapeHtml(user.name)},</p>
               <p>Enter this code in the Extras App to reset your password:</p>
               <p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:20px 0;">${code}</p>
               <p>It expires in ${CODE_MINUTES} minutes.</p>
               <p style="color:#6b7280;">If you didn't ask to reset your password, you can ignore this email —
                  your password won't change.</p>`
            ),
          });
        } catch (err) {
          console.error('Could not send reset code email:', err.message);
        }
      }
    }

    return res.json({ message: CODE_SENT_MESSAGE });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

// POST /auth/reset-password — body: { "email": "...", "code": "123456", "newPassword": "..." }
async function resetPassword(req, res) {
  try {
    const { code, newPassword } = req.body;
    const user = await findUserByEmail(req.body.email);

    // No account, no code, or the code has expired
    if (!user || !user.resetCodeHash || !user.resetCodeExpiresAt || user.resetCodeExpiresAt < new Date()) {
      return res.status(400).json({ error: BAD_CODE_MESSAGE });
    }

    // Too many wrong guesses already
    if (user.resetCodeAttempts >= MAX_CODE_ATTEMPTS) {
      await prisma.user.update({
        where: { id: user.id },
        data: { resetCodeHash: null, resetCodeExpiresAt: null, resetCodeAttempts: 0 },
      });
      return res.status(400).json({ error: BAD_CODE_MESSAGE });
    }

    // Check the new password first, so a weak password doesn't use up a guess
    const passwordError = checkPassword(newPassword, { name: user.name, email: user.email });
    if (passwordError) {
      return res.status(400).json({ error: passwordError, field: 'newPassword' });
    }

    const codeText = String(code ?? '').trim();
    const codeOk = /^\d{6}$/.test(codeText) && (await bcrypt.compare(codeText, user.resetCodeHash));
    if (!codeOk) {
      const attempts = user.resetCodeAttempts + 1;
      await prisma.user.update({ where: { id: user.id }, data: { resetCodeAttempts: attempts } });
      const left = MAX_CODE_ATTEMPTS - attempts;
      return res.status(400).json({
        error: left > 0
          ? `That code isn't right. You have ${left} ${left === 1 ? 'try' : 'tries'} left.`
          : BAD_CODE_MESSAGE,
        field: 'code',
      });
    }

    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return res.status(400).json({ error: "That's your current password. Please choose a new one.", field: 'newPassword' });
    }

    await saveNewPassword(user.id, newPassword);
    await sendPasswordChangedEmail(user);

    return res.json({ message: 'Your password has been reset. You can now log in.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong resetting your password' });
  }
}

// POST /auth/change-password — logged in. body: { "currentPassword": "...", "newPassword": "..." }
// Logs out every OTHER device; returns a fresh token so this phone stays logged in.
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (!currentPassword || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(400).json({ error: 'Your current password is not right', field: 'currentPassword' });
    }

    const passwordError = checkPassword(newPassword, { name: user.name, email: user.email });
    if (passwordError) {
      return res.status(400).json({ error: passwordError, field: 'newPassword' });
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({ error: 'Your new password must be different', field: 'newPassword' });
    }

    const updated = await saveNewPassword(user.id, newPassword);
    await sendPasswordChangedEmail(user);

    return res.json({ message: 'Password changed', token: signToken(updated) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong changing your password' });
  }
}

module.exports = { requestPasswordReset, resetPassword, changePassword };