const prisma = require('../config/db');
const { newLinkToken, hashToken, appUrl, emailAddressFor } = require('../utils/notify');
const { sendEmail, emailLayout, escapeHtml } = require('../utils/email');
const { sendPage } = require('../utils/webPage');
const { decrypt } = require('../utils/crypto');
const { toProfileJpeg, uploadProfilePhoto } = require('../utils/photoStorage');
const { detailsFieldsHtml, checkDetails, toArray, MULTI_SELECT_SCRIPT } = require('./signupController');

// "Update my details" for extras without a smartphone (Phase 3 Part 11).
//   GET  /details         – ask for a link (type your email)
//   POST /details         – email the link (same reply whether or not the email matches anyone)
//   GET  /details/:token  – the form, filled in with their current details
//   POST /details/:token  – save it; the link then stops working

const LINK_MINUTES = 60;        // a link works for 1 hour
const RESEND_WAIT_SECONDS = 60; // don't send another link to the same person within a minute
const MINUTE = 60 * 1000;

const SENT_MESSAGE = `If that email belongs to an extra who gets their calls by email, we've sent it a link to update their details. The link works for ${LINK_MINUTES} minutes.`;
const BAD_LINK_HTML = '<p>This link has expired or has already been used.</p><p><a href="/details">Get a new link</a></p>';
const ERROR_HTML = '<p>Sorry, something went wrong. Please try again in a few minutes.</p>';

// ---------- Asking for a link ----------

function requestFormHtml(error = null) {
  return `
    <p>Enter the email address your call emails come to, and we'll send you a link to update your details.</p>
    ${error ? `<p class="status error">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/details">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required autocomplete="email">
      <p style="margin-top:20px;"><button type="submit" class="btn btn-primary">Email me a link</button></p>
    </form>
    <p class="muted">This is for extras who get their calls by email. If you use the Extras App, you can update your details in the app.</p>`;
}

function buildDetailsLinkEmail(name, link) {
  const button = `<a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#2563eb;color:#ffffff;font-weight:bold;text-decoration:none;">Update my details</a>`;
  return {
    subject: 'Update your Extras App details',
    text:
      `Hi ${name},\n\n` +
      `Here's your link to update your details:\n${link}\n\n` +
      `It works once, for ${LINK_MINUTES} minutes. If you didn't ask for this, you can ignore this email.`,
    html: emailLayout(
      'Update your details',
      `<p>Hi ${escapeHtml(name)},</p>
       <p>Here's your link to update your details:</p>
       <p>${button}</p>
       <p style="color:#6b7280;font-size:13px;">It works once, for ${LINK_MINUTES} minutes.
          If you didn't ask for this, you can ignore this email.</p>`
    ),
  };
}

// GET /details
function showRequestPage(req, res) {
  return sendPage(res, 200, 'Update your details', requestFormHtml());
}

// POST /details — emails a link if the address belongs to an extra without a smartphone
async function requestLink(req, res) {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
    if (!email) {
      return sendPage(res, 400, 'Update your details', requestFormHtml('Please enter your email address.'));
    }

    // Their login email OR their contact email (the one their call emails go to), ignoring capitals
    const profile = await prisma.extraProfile.findFirst({
      where: {
        hasSmartphone: false,
        user: { deletedAt: null },
        OR: [
          { user: { email: { equals: email, mode: 'insensitive' } } },
          { contactEmail: { equals: email, mode: 'insensitive' } },
        ],
      },
      include: { user: { select: { name: true, email: true } } },
    });

    if (profile) {
      // When the last link was sent = its expiry minus 1 hour
      const lastSentAt = profile.detailsLinkExpiresAt
        ? profile.detailsLinkExpiresAt.getTime() - LINK_MINUTES * MINUTE
        : 0;

      if (Date.now() - lastSentAt > RESEND_WAIT_SECONDS * 1000) {
        const { token, tokenHash } = newLinkToken();
        await prisma.extraProfile.update({
          where: { id: profile.id },
          data: { detailsLinkHash: tokenHash, detailsLinkExpiresAt: new Date(Date.now() + LINK_MINUTES * MINUTE) },
        });
        try {
          await sendEmail({ to: emailAddressFor(profile), ...buildDetailsLinkEmail(profile.user.name, appUrl(`/details/${token}`)) });
        } catch (emailErr) {
          console.error('Could not send update-details email:', emailErr.message);
        }
      }
    }

    // The same reply either way, so nobody can use this page to find out who's signed up
    return sendPage(res, 200, 'Check your email', `<p class="status">${escapeHtml(SENT_MESSAGE)}</p>`);
  } catch (err) {
    console.error(err);
    return sendPage(res, 500, 'Something went wrong', ERROR_HTML);
  }
}

// ---------- The update form ----------

// The extra a link belongs to, or null if the link is wrong, used or out of date
async function findProfileByToken(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;

  const profile = await prisma.extraProfile.findUnique({
    where: { detailsLinkHash: hashToken(token) },
    include: { user: { select: { name: true, email: true, deletedAt: true } } },
  });

  if (!profile || profile.user.deletedAt) return null;
  if (!profile.detailsLinkExpiresAt || profile.detailsLinkExpiresAt < new Date()) return null;
  return profile;
}

// What's already saved, for the hints on the form (never the bank details themselves)
function savedInfo(profile) {
  return {
    hasFacePhoto: !!profile.facePhotoUrl,
    hasFullBodyPhoto: !!profile.fullBodyPhotoUrl,
    ibanLast4: profile.ibanEncrypted ? decrypt(profile.ibanEncrypted).slice(-4) : null,
  };
}

// Their current details, to fill the form in
function valuesFromProfile(profile) {
  return {
    name: profile.user.name,
    dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.toISOString().slice(0, 10) : '',
    gender: profile.gender || '',
    heightCm: profile.heightCm != null ? String(profile.heightCm) : '',
    phoneNumber: profile.phoneNumber || '',
    skills: profile.skills,
    languages: profile.languages,
    availability: profile.availability,
    iban: '',
    bic: '',
    accountHolderName: '',
    ...savedInfo(profile),
  };
}

function renderUpdateForm(res, statusCode, profile, token, values, error = null) {
  const html = `
    <p>Hi ${escapeHtml(profile.user.name)}, change anything that's out of date, then press <strong>Save my details</strong>.</p>
    ${error ? `<p class="status error">${escapeHtml(error)}</p>` : ''}

    <form method="post" action="/details/${token}" enctype="multipart/form-data">
      <label for="name">Full name</label>
      <input type="text" id="name" name="name" maxlength="100" required autocomplete="name" value="${escapeHtml(values.name ?? '')}">

      ${detailsFieldsHtml(values, { forUpdate: true })}

      <h2>Got a smartphone now?</h2>
      <div class="chips">
        <label class="chip"><input type="checkbox" name="nowHasSmartphone" value="yes"${values.nowHasSmartphone === 'yes' ? ' checked' : ''}><span>I have a smartphone now</span></label>
      </div>
      <p class="muted">Tick this to use the Extras App instead. Your calls will then come as alerts in the app, not by email.</p>

      <p style="margin-top:24px;"><button type="submit" class="btn btn-primary">Save my details</button></p>
    </form>
    ${MULTI_SELECT_SCRIPT}`;

  sendPage(res, statusCode, 'Update your details', html);
}

// ---------- "Your details were changed" email ----------

// Works out which details changed, as a list of names for the email, e.g. ['Phone number', 'Skills']
function listChanges(profile, newName, data, savedPhotos, nowHasSmartphone) {
  const changes = [];
  const sameList = (a = [], b = []) => [...a].sort().join('|') === [...b].sort().join('|');
  const dayOf = (date) => (date ? new Date(date).toISOString().slice(0, 10) : '');

  if (newName !== profile.user.name) changes.push('Name');
  if (dayOf(data.dateOfBirth) !== dayOf(profile.dateOfBirth)) changes.push('Date of birth');
  if (data.gender !== profile.gender) changes.push('Gender');
  if ((data.heightCm ?? null) !== (profile.heightCm ?? null)) changes.push('Height');
  if (data.phoneNumber !== (profile.phoneNumber || '')) changes.push('Phone number');
  if (!sameList(data.skills, profile.skills)) changes.push('Skills');
  if (!sameList(data.languages, profile.languages)) changes.push('Languages');
  if (!sameList(data.availability, profile.availability)) changes.push('Availability');
  if (savedPhotos.face) changes.push('Face photo');
  if (savedPhotos.fullbody) changes.push('Full-length photo');
  if (data.ibanEncrypted) changes.push('Bank details'); // only set when new bank details were typed in
  if (nowHasSmartphone) changes.push('Switched to the Extras App (calls will now come as app alerts)');
  return changes;
}

// A security email, like the "password changed" one: in case it wasn't them
function buildDetailsChangedEmail(name, changes) {
  const when = new Intl.DateTimeFormat('en-IE', {
    timeZone: 'Europe/Dublin', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date());

  const bankChanged = changes.includes('Bank details');
  const bankWarningText = bankChanged
    ? '\n\nYour BANK DETAILS were changed. This is where your pay goes. If you did not change them, contact your coordinator straight away.'
    : '';
  const bankWarningHtml = bankChanged
    ? `<p style="background:#fef2f2;border-left:4px solid #dc2626;padding:10px 14px;border-radius:6px;color:#991b1b;">
         <strong>Your bank details were changed.</strong> This is where your pay goes.
         If you didn't change them, contact your coordinator straight away.</p>`
    : '';

  return {
    subject: 'Your Extras App details were changed',
    text:
      `Hi ${name},\n\n` +
      `Your Extras App details were updated on ${when}. What changed:\n` +
      changes.map((change) => `- ${change}`).join('\n') +
      bankWarningText +
      `\n\nIf this wasn't you, contact your coordinator straight away.`,
    html: emailLayout(
      'Your details were changed',
      `<p>Hi ${escapeHtml(name)},</p>
       <p>Your Extras App details were updated on <strong>${escapeHtml(when)}</strong>. What changed:</p>
       <ul>${changes.map((change) => `<li>${escapeHtml(change)}</li>`).join('')}</ul>
       ${bankWarningHtml}
       <p>If this wasn't you, contact your coordinator straight away.</p>`
    ),
  };
}

// GET /details/:token
async function showUpdatePage(req, res) {
  try {
    const { token } = req.params;
    const profile = await findProfileByToken(token);
    if (!profile) return sendPage(res, 400, 'Link not working', BAD_LINK_HTML);

    return renderUpdateForm(res, 200, profile, token, valuesFromProfile(profile));
  } catch (err) {
    console.error(err);
    return sendPage(res, 500, 'Something went wrong', ERROR_HTML);
  }
}

// POST /details/:token — saves the changes, then the link stops working
async function saveDetails(req, res) {
  try {
    const { token } = req.params;
    const profile = await findProfileByToken(token);
    if (!profile) return sendPage(res, 400, 'Link not working', BAD_LINK_HTML);

    const body = req.body || {};
    const values = {
      name: (body.name || '').trim(),
      dateOfBirth: body.dateOfBirth || '',
      gender: body.gender || '',
      heightCm: (body.heightCm || '').trim(),
      phoneNumber: (body.phoneNumber || '').trim(),
      skills: toArray(body.skills),
      languages: toArray(body.languages),
      availability: toArray(body.availability),
      iban: (body.iban || '').trim(),
      bic: (body.bic || '').trim(),
      accountHolderName: (body.accountHolderName || '').trim(),
      nowHasSmartphone: body.nowHasSmartphone,
      ...savedInfo(profile),
    };
    const fail = (message) => renderUpdateForm(res, 400, profile, token, values, message);

    if (req.uploadError) return fail(req.uploadError);
    if (!values.name) return fail('Please enter your full name.');
    if (values.name.length > 100) return fail('Your name can be at most 100 characters.');

    // Same checks as sign-up. Empty bank boxes come back with no bank fields, so the saved ones are kept.
    const details = checkDetails(values);
    if (details.error) return fail(details.error);

    // Convert any new photos first, so a broken file is caught before anything is saved
    const photos = {};
    try {
      const faceFile = req.files?.facePhoto?.[0];
      const fullBodyFile = req.files?.fullBodyPhoto?.[0];
      if (faceFile) photos.face = await toProfileJpeg(faceFile.buffer);
      if (fullBodyFile) photos.fullbody = await toProfileJpeg(fullBodyFile.buffer);
    } catch {
      return fail("One of the photos couldn't be read. Please choose a JPG or PNG picture.");
    }

    const nowHasSmartphone = values.nowHasSmartphone === 'yes';

    // Save the details and clear the link (so it only works once), together
    await prisma.$transaction([
      prisma.extraProfile.update({
        where: { id: profile.id },
        data: { ...details.data, hasSmartphone: nowHasSmartphone, detailsLinkHash: null, detailsLinkExpiresAt: null },
      }),
      prisma.user.update({ where: { id: profile.userId }, data: { name: values.name } }),
    ]);

    // New photos replace the old ones (same file names in Firebase Storage)
    let photoNote = '';
    if (photos.face || photos.fullbody) {
      try {
        const data = {};
        if (photos.face) data.facePhotoUrl = await uploadProfilePhoto(profile.userId, 'face', photos.face);
        if (photos.fullbody) data.fullBodyPhotoUrl = await uploadProfilePhoto(profile.userId, 'fullbody', photos.fullbody);
        await prisma.extraProfile.update({ where: { id: profile.id }, data });
      } catch (photoErr) {
        console.error('Could not upload updated photos:', photoErr.message);
        photoNote = "<p class=\"muted\">Your details are saved, but your new photos couldn't be. Please try again with a new link.</p>";
      }
    }

    // Tell them what changed, in case it wasn't them (photos only count if they uploaded OK)
    const savedPhotos = photoNote ? {} : photos;
    const changes = listChanges(profile, values.name, details.data, savedPhotos, nowHasSmartphone);
    if (changes.length > 0) {
      try {
        await sendEmail({ to: emailAddressFor(profile), ...buildDetailsChangedEmail(values.name, changes) });
      } catch (emailErr) {
        // The details are saved either way, so don't fail over the email
        console.error("Could not send 'details changed' email:", emailErr.message);
      }
    }

    const nextSteps = nowHasSmartphone
      ? `<p>You're now set up to use the <strong>Extras App</strong>. Download it, tap <strong>"Forgot password?"</strong>
           and enter <strong>${escapeHtml(profile.user.email)}</strong> to set a password.
           From now on, your calls will come as alerts in the app.</p>`
      : "<p>Thanks! We'll keep emailing you whenever there's a call for you.</p>";

    return sendPage(
      res,
      200,
      'Details saved',
      `<p class="status">Your details have been saved.</p>
       ${nextSteps}
       ${photoNote}
       <p class="muted">This link has now been used. To make more changes later, <a href="/details">get a new link</a>.</p>`
    );
  } catch (err) {
    console.error(err);
    return sendPage(res, 500, 'Something went wrong', ERROR_HTML);
  }
}

module.exports = { showRequestPage, requestLink, showUpdatePage, saveDetails };