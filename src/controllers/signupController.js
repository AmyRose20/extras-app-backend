const crypto = require('crypto');
const bcrypt = require('bcrypt');
const multer = require('multer');
const prisma = require('../config/db');
const { hashToken } = require('../utils/notify');
const { escapeHtml } = require('../utils/email');
const { sendPage } = require('../utils/webPage');
const { checkPassword } = require('../utils/passwordRules');
const { encrypt } = require('../utils/crypto');
const { normaliseIban, isValidIban, normaliseBic, isValidBic } = require('../utils/bankDetails');
const { MAX_PHOTO_BYTES, toProfileJpeg, uploadProfilePhoto } = require('../utils/photoStorage');
const {
  SKILL_GROUPS, LANGUAGE_GROUPS, AVAILABILITY_GROUPS, GENDER_OPTIONS,
  ALL_SKILLS, ALL_LANGUAGES, ALL_AVAILABILITY,
} = require('../utils/profileOptions');

// The sign-up page opened from a coordinator's invite email (Phase 3 Part 11).
// Whoever signs up gets an APPROVED membership of that production straight away.
//   - Smartphone: choose a password, then use the app
//   - No smartphone: fill in their details here; invites will come by email

const SALT_ROUNDS = 10;

// ---------- Photo uploads (multer) ----------

// Keeps uploaded files in memory (we convert them, then send them to Firebase Storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 2 },
  fileFilter: (req, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      req.uploadError = 'Photos must be pictures (JPG or PNG).';
      return callback(null, false); // skip this file
    }
    callback(null, true);
  },
});
const readPhotos = upload.fields([
  { name: 'facePhoto', maxCount: 1 },
  { name: 'fullBodyPhoto', maxCount: 1 },
]);

// Reads the form + photos. Upload problems become a message on the form instead of a crash.
function handlePhotoUpload(req, res, next) {
  readPhotos(req, res, (err) => {
    if (err) {
      req.uploadError = err.code === 'LIMIT_FILE_SIZE'
        ? 'Each photo must be 5MB or smaller.'
        : "Your photos couldn't be uploaded. Please try again.";
    }
    next();
  });
}

// ---------- Finding the invite ----------

async function findInvite(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  return prisma.signupInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { production: { select: { name: true } } },
  });
}

// Why a link can't be used, or null if it's fine
function inviteProblem(invite) {
  if (!invite) return "This sign-up link isn't working. It may have been copied wrongly, or a newer invite has replaced it.";
  if (invite.usedAt) return 'This sign-up link has already been used. If that was you, you can log in to the Extras App.';
  if (invite.expiresAt < new Date()) return 'This sign-up link has expired. Please ask your coordinator to send you a new one.';
  return null;
}

// ---------- Drawing the form ----------

// A form field can send one value or several; this always gives a list
function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

// Text that's safe to put inside value="..."
function attr(value) {
  return escapeHtml(value ?? '');
}

// Grouped tick boxes shown as pills (chips), e.g. for availability
function checkboxGroups(name, groups, selected) {
  return groups
    .map((group) => `
      <div class="group">
        <p class="group-title">${escapeHtml(group.title)}</p>
        <div class="chips">
          ${group.options
            .map((option) => `<label class="chip"><input type="checkbox" name="${name}" value="${attr(option)}"${selected.includes(option) ? ' checked' : ''}><span>${escapeHtml(option)}</span></label>`)
            .join('')}
        </div>
      </div>`)
    .join('');
}

// A dropdown you can tick several things in (like the app's skills/languages pickers).
// <details> opens and closes by itself when clicked; the page's script shows what's ticked in the box.
function multiSelectDropdown(name, placeholder, groups, selected) {
  const summaryText = selected.length > 0 ? selected.join(', ') : placeholder;
  return `
    <details class="multi" data-placeholder="${attr(placeholder)}">
      <summary><span class="multi-summary${selected.length > 0 ? '' : ' placeholder'}">${escapeHtml(summaryText)}</span></summary>
      <div class="multi-panel">
        ${groups
          .map((group) => `
            <p class="group-title">${escapeHtml(group.title)}</p>
            ${group.options
              .map((option) => `<label class="tick"><input type="checkbox" name="${name}" value="${attr(option)}"${selected.includes(option) ? ' checked' : ''}><span>${escapeHtml(option)}</span></label>`)
              .join('')}`)
          .join('')}
      </div>
    </details>`;
}

// The details fields, shared by the sign-up page and the "Update my details" page (detailsController.js).
// forUpdate = true: the photo and bank hints say what's already saved, and empty boxes mean "keep it".
function detailsFieldsHtml(v, { forUpdate = false } = {}) {
  const today = new Date().toISOString().slice(0, 10);

  const genderOptions = GENDER_OPTIONS
    .map((g) => `<option value="${g.value}"${v.gender === g.value ? ' selected' : ''}>${g.label}</option>`)
    .join('');

  const savedPhotoHint = (hasOne) =>
    forUpdate && hasOne ? '<p class="muted">You have one saved. Choose a new one only if you want to replace it.</p>' : '';

  const bankIntro = forUpdate && v.ibanLast4
    ? `<p class="muted">Bank details saved (IBAN ending ${escapeHtml(v.ibanLast4)}). To change them, type the new ones.
         Leave the boxes empty to keep the saved ones.</p>`
    : '<p class="muted">So you can be paid. You can leave these out and give them to your coordinator later.</p>';

  return `
        <label for="dateOfBirth">Date of birth</label>
        <input type="date" id="dateOfBirth" name="dateOfBirth" min="1900-01-01" max="${today}" value="${attr(v.dateOfBirth)}">

        <label for="gender">Gender</label>
        <select id="gender" name="gender">
          <option value="">Choose…</option>
          ${genderOptions}
        </select>

        <label for="heightCm">Height in cm (optional)</label>
        <input type="number" id="heightCm" name="heightCm" min="100" max="250" value="${attr(v.heightCm)}">

        <label for="phoneNumber">Phone number</label>
        <input type="tel" id="phoneNumber" name="phoneNumber" autocomplete="tel" value="${attr(v.phoneNumber)}">

        <label>Skills (optional)</label>
        ${multiSelectDropdown('skills', 'Choose skills…', SKILL_GROUPS, v.skills)}

        <label>Languages (optional)</label>
        ${multiSelectDropdown('languages', 'Choose languages…', LANGUAGE_GROUPS, v.languages)}

        <label>Which days are you available?</label>
        ${checkboxGroups('availability', AVAILABILITY_GROUPS, v.availability)}
        <p class="muted">Pick "Everyday", or the specific days.</p>

        <h2>Photos (optional)</h2>
        <p class="muted">A face photo and a full-length photo help coordinators cast you. JPG or PNG, up to 5MB each.
           If there's a problem with the form, you'll need to choose them again.</p>
        <label for="facePhoto">Face photo</label>
        ${savedPhotoHint(v.hasFacePhoto)}
        <input type="file" id="facePhoto" name="facePhoto" accept="image/jpeg,image/png,image/webp">
        <label for="fullBodyPhoto">Full-length photo</label>
        ${savedPhotoHint(v.hasFullBodyPhoto)}
        <input type="file" id="fullBodyPhoto" name="fullBodyPhoto" accept="image/jpeg,image/png,image/webp">

        <h2>Bank details (optional)</h2>
        ${bankIntro}
        <label for="iban">IBAN</label>
        <input type="text" id="iban" name="iban" autocomplete="off" value="${attr(v.iban)}">
        <label for="bic">BIC</label>
        <input type="text" id="bic" name="bic" autocomplete="off" value="${attr(v.bic)}">
        <label for="accountHolderName">Account holder name</label>
        <input type="text" id="accountHolderName" name="accountHolderName" maxlength="70" value="${attr(v.accountHolderName)}">
        <p class="muted">Exactly as your bank has it. Leave blank if it's your own name.</p>`;
}

// The dropdown script, shared by both pages (it runs in the browser, so it's written the old-fashioned way)
const MULTI_SELECT_SCRIPT = `
    <script>
      // Dropdown multi-selects: show what's ticked in the box (e.g. "Archery, Horse riding")
      document.querySelectorAll('details.multi').forEach(function (box) {
        var summary = box.querySelector('.multi-summary');
        function update() {
          var picked = Array.prototype.map.call(box.querySelectorAll('input:checked'), function (input) { return input.value; });
          summary.textContent = picked.length ? picked.join(', ') : box.dataset.placeholder;
          summary.classList.toggle('placeholder', picked.length === 0);
        }
        box.addEventListener('change', update);
      });

      // Close an open dropdown when clicking anywhere outside it
      document.addEventListener('click', function (event) {
        document.querySelectorAll('details.multi[open]').forEach(function (box) {
          if (!box.contains(event.target)) box.removeAttribute('open');
        });
      });
    </script>`;

// The whole sign-up form. values = what they typed (kept if there's an error), error = message to show.
function renderForm(res, statusCode, invite, token, values = {}, error = null) {
  const v = { skills: [], languages: [], availability: [], ...values };

  const html = `
    <p>You've been invited to join <strong>${escapeHtml(invite.production.name)}</strong> as an extra.</p>
    ${error ? `<p class="status error">${escapeHtml(error)}</p>` : ''}

    <form method="post" action="/signup/${token}" enctype="multipart/form-data">
      <label for="name">Full name</label>
      <input type="text" id="name" name="name" maxlength="100" required autocomplete="name" value="${attr(v.name)}">

      <label for="email">Email</label>
      <input type="email" id="email" value="${attr(invite.email)}" disabled>
      <p class="muted">This is the email your invite was sent to.</p>

      <label>Do you have a smartphone?</label>
      <div class="chips">
        <label class="chip"><input type="radio" name="hasSmartphone" value="yes"${v.hasSmartphone === 'yes' ? ' checked' : ''}><span>Yes</span></label>
        <label class="chip"><input type="radio" name="hasSmartphone" value="no"${v.hasSmartphone === 'no' ? ' checked' : ''}><span>No</span></label>
      </div>

      <div id="smartphone-yes">
        <h2>Choose a password</h2>
        <p class="muted">You'll use this to log in to the Extras App. At least 10 characters, with at least one letter
           and one number. Don't use your name or email address.</p>
        <label for="password">Password</label>
        <input type="password" id="password" name="password" autocomplete="new-password">
        <label for="confirmPassword">Type it again</label>
        <input type="password" id="confirmPassword" name="confirmPassword" autocomplete="new-password">
      </div>

      <div id="smartphone-no">
        <h2>Your details</h2>
        <p class="muted">Fill these in and we'll email you whenever there's a call for you.</p>

        ${detailsFieldsHtml(v)}
      </div>

      <p style="margin-top:24px;"><button type="submit" class="btn btn-primary">Sign up</button></p>
    </form>

    <script>
      // Shows only the section that matches the Yes/No answer
      (function () {
        var yes = document.getElementById('smartphone-yes');
        var no = document.getElementById('smartphone-no');
        function update() {
          var picked = document.querySelector('input[name="hasSmartphone"]:checked');
          yes.hidden = !picked || picked.value !== 'yes';
          no.hidden = !picked || picked.value !== 'no';
        }
        document.querySelectorAll('input[name="hasSmartphone"]').forEach(function (radio) {
          radio.addEventListener('change', update);
        });
        update();
      })();
    </script>
    ${MULTI_SELECT_SCRIPT}`;

  sendPage(res, statusCode, 'Sign up', html);
}

// ---------- Checking the details (no-smartphone extras) ----------

// Returns { data } ready for the database, or { error } to show on the form
function checkDetails(values) {
  // Date of birth (needed for age matching)
  const dob = new Date(values.dateOfBirth);
  if (!values.dateOfBirth || isNaN(dob.getTime()) || dob > new Date() || dob.getFullYear() < 1900) {
    return { error: 'Please enter a valid date of birth.' };
  }

  // Gender (needed for matching)
  if (!GENDER_OPTIONS.some((g) => g.value === values.gender)) {
    return { error: 'Please choose your gender.' };
  }

  // Height (optional)
  let heightCm = null;
  if (values.heightCm !== '') {
    heightCm = Number(values.heightCm);
    if (!Number.isInteger(heightCm) || heightCm < 100 || heightCm > 250) {
      return { error: 'Height should be a whole number of centimetres, between 100 and 250.' };
    }
  }

  // Phone (they can't use the app, so the coordinator needs a way to reach them)
  if (!values.phoneNumber) {
    return { error: 'Please enter a phone number, so your coordinator can reach you.' };
  }
  if (!/^[0-9+()\s-]{7,20}$/.test(values.phoneNumber)) {
    return { error: "That phone number doesn't look right." };
  }

  // Tick boxes: only keep real options
  const skills = values.skills.filter((s) => ALL_SKILLS.includes(s));
  const languages = values.languages.filter((l) => ALL_LANGUAGES.includes(l));
  const availability = values.availability.filter((a) => ALL_AVAILABILITY.includes(a));
  if (availability.length === 0) {
    return { error: "Please choose which days you're available." };
  }
  if (availability.includes('Everyday') && availability.length > 1) {
    return { error: '"Everyday" can\'t be combined with specific days.' };
  }

  // Bank details (optional, but IBAN and BIC go together). Same checks as the app.
  const bank = {};
  if (values.iban || values.bic) {
    if (!values.iban || !values.bic) return { error: 'Please enter both your IBAN and BIC, or leave both empty.' };
    if (!isValidIban(values.iban)) return { error: "That IBAN doesn't look right. Please check it." };
    if (!isValidBic(values.bic)) return { error: "That BIC doesn't look right. It should be 8 or 11 letters/numbers." };
    bank.ibanEncrypted = encrypt(normaliseIban(values.iban));
    bank.bicEncrypted = encrypt(normaliseBic(values.bic));
    bank.accountHolderName = values.accountHolderName || values.name; // defaults to their own name, like the app
  }

  return {
    data: { dateOfBirth: dob, gender: values.gender, heightCm, phoneNumber: values.phoneNumber, skills, languages, availability, ...bank },
  };
}

// ---------- The pages ----------

// GET /signup/:token — shows the form (or why the link can't be used)
async function showSignupPage(req, res) {
  try {
    const { token } = req.params;
    const invite = await findInvite(token);
    const problem = inviteProblem(invite);
    if (problem) return sendPage(res, 400, 'Sign-up link not working', `<p>${escapeHtml(problem)}</p>`);

    return renderForm(res, 200, invite, token);
  } catch (err) {
    console.error(err);
    return sendPage(res, 500, 'Something went wrong', '<p>Sorry, something went wrong. Please try again in a few minutes.</p>');
  }
}

// POST /signup/:token — checks the form and creates the account
async function submitSignup(req, res) {
  try {
    const { token } = req.params;
    const invite = await findInvite(token);
    const problem = inviteProblem(invite);
    if (problem) return sendPage(res, 400, 'Sign-up link not working', `<p>${escapeHtml(problem)}</p>`);

    const body = req.body || {};
    const values = {
      name: (body.name || '').trim(),
      hasSmartphone: body.hasSmartphone,
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
    };
    // Shows the form again with the message, keeping what they typed (never the passwords)
    const fail = (message) => renderForm(res, 400, invite, token, values, message);

    if (req.uploadError) return fail(req.uploadError);
    if (!values.name) return fail('Please enter your full name.');
    if (values.name.length > 100) return fail('Your name can be at most 100 characters.');
    if (!['yes', 'no'].includes(values.hasSmartphone)) return fail('Please say whether you have a smartphone.');

    const email = invite.email;
    const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (existing) return fail('An account with this email already exists. Please log in to the Extras App instead.');

    const profileData = { hasSmartphone: values.hasSmartphone === 'yes' };
    const photos = {};
    let password;

    if (values.hasSmartphone === 'yes') {
      password = body.password || '';
      if (password !== (body.confirmPassword || '')) return fail("The two passwords don't match.");
      const passwordError = checkPassword(password, { name: values.name, email });
      if (passwordError) return fail(passwordError);
    } else {
      const details = checkDetails(values);
      if (details.error) return fail(details.error);
      Object.assign(profileData, details.data);

      // Convert any photos now, so a broken file is caught before the account is made
      try {
        const faceFile = req.files?.facePhoto?.[0];
        const fullBodyFile = req.files?.fullBodyPhoto?.[0];
        if (faceFile) photos.face = await toProfileJpeg(faceFile.buffer);
        if (fullBodyFile) photos.fullbody = await toProfileJpeg(fullBodyFile.buffer);
      } catch {
        return fail("One of the photos couldn't be read. Please choose a JPG or PNG picture.");
      }

      // No password needed without a smartphone: a long random one that nobody knows.
      // If they get a smartphone later, "Forgot password?" in the app lets them set a real one.
      password = crypto.randomBytes(32).toString('hex');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const now = new Date();

    // Create the account, profile and APPROVED membership together, and mark the link as used
    let user;
    try {
      user = await prisma.$transaction(async (tx) => {
        // Claim the invite first, so pressing "Sign up" twice can't make two accounts
        const claimed = await tx.signupInvite.updateMany({
          where: { id: invite.id, usedAt: null },
          data: { usedAt: now },
        });
        if (claimed.count === 0) throw new Error('INVITE_ALREADY_USED');

        const created = await tx.user.create({
          data: {
            email,
            passwordHash,
            name: values.name,
            role: 'EXTRA',
            extraProfile: {
              create: {
                ...profileData,
                memberships: {
                  create: {
                    productionId: invite.productionId,
                    status: 'APPROVED',
                    reviewedAt: now,
                    reviewedByAdminId: invite.invitedById, // approved by the coordinator who invited them
                  },
                },
              },
            },
          },
          include: { extraProfile: true },
        });

        await tx.signupInvite.update({ where: { id: invite.id }, data: { usedByUserId: created.id } });
        return created;
      });
    } catch (err) {
      if (err.message === 'INVITE_ALREADY_USED') {
        return sendPage(res, 409, 'Already signed up', "<p>This sign-up link has just been used. If that was you, you're all set.</p>");
      }
      if (err.code === 'P2002') { // Prisma's "already exists" error (the email is taken)
        return fail('An account with this email already exists. Please log in to the Extras App instead.');
      }
      throw err;
    }

    // Photos go up after the account exists, because they're stored under the user's id
    let photoNote = '';
    if (photos.face || photos.fullbody) {
      try {
        const data = {};
        if (photos.face) data.facePhotoUrl = await uploadProfilePhoto(user.id, 'face', photos.face);
        if (photos.fullbody) data.fullBodyPhotoUrl = await uploadProfilePhoto(user.id, 'fullbody', photos.fullbody);
        await prisma.extraProfile.update({ where: { id: user.extraProfile.id }, data });
      } catch (photoErr) {
        console.error('Could not upload sign-up photos:', photoErr.message);
        photoNote = "<p class=\"muted\">Your account is set up, but your photos couldn't be saved. Your coordinator can help with this.</p>";
      }
    }

    const productionName = escapeHtml(invite.production.name);
    const nextSteps = values.hasSmartphone === 'yes'
      ? `<p>Download the <strong>Extras App</strong> and log in with <strong>${escapeHtml(email)}</strong>
           and the password you just chose. You can add your photos and details there.</p>`
      : `<p>We'll email you at <strong>${escapeHtml(email)}</strong> whenever there's a call for you,
           and you can accept or decline straight from the email.</p>
         <p class="muted">To change your details later, go to <a href="/details">Update my details</a>. If you get a smartphone later,
           download the Extras App and use "Forgot password?" to set a password.</p>`;

    return sendPage(
      res,
      201,
      "You're signed up!",
      `<p class="status">Welcome, ${escapeHtml(values.name)}! You're now an extra on <strong>${productionName}</strong>.</p>
       ${nextSteps}
       ${photoNote}`
    );
  } catch (err) {
    console.error(err);
    return sendPage(res, 500, 'Something went wrong', '<p>Sorry, something went wrong. Please try again in a few minutes.</p>');
  }
}

module.exports = {
  handlePhotoUpload, showSignupPage, submitSignup,
  detailsFieldsHtml, checkDetails, toArray, MULTI_SELECT_SCRIPT, // shared with detailsController.js
};