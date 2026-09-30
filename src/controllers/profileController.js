const prisma = require('../config/db');
require('../config/firebase'); // initializes the Firebase app
const { getMessaging } = require('firebase-admin/messaging');
const { ageFromDob, dobFilterForAgeRange } = require('../utils/age');
const { encrypt, decrypt } = require('../utils/crypto');
const { normaliseIban, isValidIban, normaliseBic, isValidBic, maskIban } = require('../utils/bankDetails');

// Every coordinator must be linked to a production. Returns the
// productionId, or sends a 403 and returns null if they aren't linked.
function requireProduction(req, res) {
  if (!req.user.productionId) {
    res.status(403).json({ error: 'Your account is not linked to a production' });
    return null;
  }
  return req.user.productionId;
}

// Removes the encrypted bank fields before a profile is sent anywhere,
// and adds a safe summary instead.
//   showMasked = true  → the extra's own view: masked IBAN + BIC
//   showMasked = false → coordinator view: just whether bank details exist
function toSafeProfile(profile, { showMasked = false } = {}) {
  const { ibanEncrypted, bicEncrypted, ...rest } = profile;
  const hasBankDetails = !!ibanEncrypted;

  const safe = { ...rest, age: ageFromDob(rest.dateOfBirth), hasBankDetails };

  if (showMasked && hasBankDetails) {
    safe.bankDetails = {
      ibanMasked: maskIban(decrypt(ibanEncrypted)),
      bic: decrypt(bicEncrypted),
    };
  }
  return safe;
}

// GET /profiles/me — an EXTRA viewing their own profile
async function getMyProfile(req, res) {
  const profile = await prisma.extraProfile.findUnique({
    where: { userId: req.user.userId },
    include: {
      user: {
        select: { deletionRequestStatus: true, deletionRequestedAt: true, deletionReason: true },
      },
      productions: { select: { id: true, name: true } },
    },
  });

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  const { user, ...rest } = profile;
  return res.json({
    ...toSafeProfile(rest, { showMasked: true }),
    deletionRequestStatus: user.deletionRequestStatus,
    deletionRequestedAt: user.deletionRequestedAt,
    deletionReason: user.deletionReason,
  });
}

// PATCH /profiles/me — an EXTRA updating their own profile
// Bank details: send "iban" and "bic" together to set them, or both as "" to remove them.
// Leave both out to keep the existing ones.
async function updateMyProfile(req, res) {
  try {
    const {
      dateOfBirth, gender, heightCm, skills, languages, phoneNumber, contactEmail,
      availability, facePhotoUrl, fullBodyPhotoUrl, hasSmartphone, iban, bic,
    } = req.body;

    // ----- Date of birth -----
    // undefined = leave as is, null/'' = clear it, otherwise a date like "1997-03-14"
    let dob;
    if (dateOfBirth === null || dateOfBirth === '') {
      dob = null;
    } else if (dateOfBirth !== undefined) {
      dob = new Date(dateOfBirth);
      if (isNaN(dob.getTime()) || dob > new Date() || dob.getFullYear() < 1900) {
        return res.status(400).json({ error: 'Please enter a valid date of birth' });
      }
    }

    // ----- Smartphone -----
    if (hasSmartphone !== undefined && typeof hasSmartphone !== 'boolean') {
      return res.status(400).json({ error: 'hasSmartphone must be true or false' });
    }

    // ----- Bank details -----
    const bankData = {};
    if (iban !== undefined || bic !== undefined) {
      const ibanText = (iban ?? '').trim();
      const bicText = (bic ?? '').trim();

      if (!ibanText && !bicText) {
        // Both empty → remove bank details
        bankData.ibanEncrypted = null;
        bankData.bicEncrypted = null;
      } else {
        if (!ibanText || !bicText) {
          return res.status(400).json({ error: 'Please enter both your IBAN and BIC' });
        }
        if (!isValidIban(ibanText)) {
          return res.status(400).json({ error: "That IBAN doesn't look right. Please check it." });
        }
        if (!isValidBic(bicText)) {
          return res.status(400).json({ error: "That BIC doesn't look right. It should be 8 or 11 letters/numbers." });
        }
        bankData.ibanEncrypted = encrypt(normaliseIban(ibanText));
        bankData.bicEncrypted = encrypt(normaliseBic(bicText));
      }
    }

    const updated = await prisma.extraProfile.update({
      where: { userId: req.user.userId },
      data: {
        dateOfBirth: dob,
        gender,
        heightCm,
        skills,
        languages,
        phoneNumber,
        contactEmail,
        availability,
        facePhotoUrl,
        fullBodyPhotoUrl,
        hasSmartphone,
        ...bankData,
      },
    });

    return res.json(toSafeProfile(updated, { showMasked: true }));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong saving your profile' });
  }
}

// PATCH /profiles/me/fcm-token — an EXTRA's device registering its push token
async function updateFcmToken(req, res) {
  const { fcmToken } = req.body;

  if (!fcmToken) {
    return res.status(400).json({ error: 'fcmToken is required' });
  }

  const profile = await prisma.extraProfile.findUnique({
    where: { userId: req.user.userId },
  });

  if (!profile) {
    // Admins/coordinators don't have an ExtraProfile — nothing to save the token to.
    return res.status(404).json({ error: 'No extra profile found for this user' });
  }

  await prisma.extraProfile.update({
    where: { userId: req.user.userId },
    data: { fcmToken },
  });

  return res.json({ success: true });
}

// GET /profiles — an ADMIN listing extras on THEIR production (with optional filters)
async function listProfiles(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { skill, gender, minAge, maxAge, availability } = req.query;

    const where = {
      productions: { some: { id: productionId } }, // only extras on my production
      user: { deletedAt: null },                    // hide soft-deleted extras
    };

    if (skill) {
      const skillList = skill.split(',').map((s) => s.trim()).filter(Boolean);
      where.skills = { hasSome: skillList };
    }

    if (gender) {
      where.gender = gender;
    }

    if (availability) {
      const availabilityList = availability.split(',').map((a) => a.trim()).filter(Boolean);
      where.availability = { hasSome: availabilityList };
    }

    if (minAge || maxAge) {
      where.dateOfBirth = dobFilterForAgeRange(
        minAge ? parseInt(minAge, 10) : null,
        maxAge ? parseInt(maxAge, 10) : null
      );
    }

    const profiles = await prisma.extraProfile.findMany({
      where,
      include: { user: { select: { name: true } } },
    });

    // Only the summary fields the list needs (no bank details)
    const result = profiles.map((p) => ({
      id: p.id,
      name: p.user.name,
      skills: p.skills,
      availability: p.availability,
    }));

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong loading extras' });
  }
}

// GET /profiles/:id — an ADMIN viewing one extra's full profile.
// Only works if that extra is on the coordinator's production.
// Bank details are NOT included — only whether they exist (see getBankDetails).
async function getProfileById(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { id } = req.params;

    const profile = await prisma.extraProfile.findFirst({
      where: { id, productions: { some: { id: productionId } } },
      include: {
        user: { select: { name: true, deletionRequestStatus: true } },
        productions: { select: { id: true, name: true } },
      },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { user, ...rest } = profile;
    return res.json({
      ...toSafeProfile(rest), // no masked details for coordinators — they use "Show bank details"
      name: user.name,
      deletionRequestStatus: user.deletionRequestStatus,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong loading that profile' });
  }
}

// GET /profiles/:id/bank-details — an ADMIN reveals one extra's full bank details.
// The ONLY place full bank details ever leave the server. Each access is logged.
async function getBankDetails(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { id } = req.params;

    const profile = await prisma.extraProfile.findFirst({
      where: { id, productions: { some: { id: productionId } } },
      select: { id: true, ibanEncrypted: true, bicEncrypted: true },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    if (!profile.ibanEncrypted) {
      return res.status(404).json({ error: 'This extra has not added bank details yet' });
    }

    console.log(`Bank details viewed: extra ${profile.id} by coordinator ${req.user.userId} at ${new Date().toISOString()}`);

    const iban = decrypt(profile.ibanEncrypted);
    return res.json({
      iban: iban.replace(/(.{4})/g, '$1 ').trim(), // "IE29 AIBK 9311 5212 3456 78" (easier to read)
      bic: decrypt(profile.bicEncrypted),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong loading bank details' });
  }
}

// PATCH /profiles/me/productions — an EXTRA sets which productions they're on.
// body: { "productionIds": ["...", "..."] }  (the FULL list they want, not just changes)
// Rules:
//  - must keep at least one production
//  - can't leave a production they have upcoming ACCEPTED shoot days on
//  - pending invites on upcoming shoot days of a removed production become EXPIRED
async function updateMyProductions(req, res) {
  try {
    const { productionIds } = req.body;

    if (!Array.isArray(productionIds) || productionIds.length === 0) {
      return res.status(400).json({ error: 'You must be on at least one production' });
    }

    const validProductions = await prisma.production.findMany({
      where: { id: { in: productionIds } },
    });
    if (validProductions.length !== productionIds.length) {
      return res.status(400).json({ error: 'One or more productions were not found' });
    }

    const profile = await prisma.extraProfile.findUnique({
      where: { userId: req.user.userId },
      include: { productions: true },
    });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const removedIds = profile.productions
      .map((p) => p.id)
      .filter((id) => !productionIds.includes(id));

    const now = new Date();

    if (removedIds.length > 0) {
      const bookedInvites = await prisma.callInvite.findMany({
        where: {
          extraProfileId: profile.id,
          status: 'ACCEPTED',
          callRequest: { shootDay: { productionId: { in: removedIds }, date: { gt: now } } },
        },
        include: { callRequest: { include: { shootDay: { include: { production: true } } } } },
      });

      if (bookedInvites.length > 0) {
        const productionName = bookedInvites[0].callRequest.shootDay.production.name;
        return res.status(400).json({
          error: `You're booked on ${bookedInvites.length} upcoming shoot day(s) for ${productionName}. Cancel those first.`,
        });
      }
    }

    const [updated] = await prisma.$transaction([
      prisma.extraProfile.update({
        where: { id: profile.id },
        data: { productions: { set: productionIds.map((id) => ({ id })) } },
        include: { productions: { select: { id: true, name: true } } },
      }),
      prisma.callInvite.updateMany({
        where: {
          extraProfileId: profile.id,
          status: 'PENDING',
          callRequest: { shootDay: { productionId: { in: removedIds }, date: { gt: now } } },
        },
        data: { status: 'EXPIRED' },
      }),
    ]);

    return res.json(updated.productions);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong updating your productions' });
  }
}

// DELETE /profiles/:id/production — an ADMIN removes an extra from THEIR production.
// The extra's account and other productions are untouched.
// Their pending + accepted invites on upcoming shoot days for this production become EXPIRED.
async function removeExtraFromMyProduction(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { id } = req.params;

    const profile = await prisma.extraProfile.findFirst({
      where: { id, productions: { some: { id: productionId } } },
      include: { productions: true },
    });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    if (profile.productions.length === 1) {
      return res.status(400).json({
        error: "This is the extra's only production. Use a deletion request instead.",
      });
    }

    const production = profile.productions.find((p) => p.id === productionId);
    const now = new Date();

    await prisma.$transaction([
      prisma.extraProfile.update({
        where: { id: profile.id },
        data: { productions: { disconnect: { id: productionId } } },
      }),
      prisma.callInvite.updateMany({
        where: {
          extraProfileId: profile.id,
          status: { in: ['PENDING', 'ACCEPTED'] },
          callRequest: { shootDay: { productionId, date: { gt: now } } },
        },
        data: { status: 'EXPIRED' },
      }),
    ]);

    if (profile.fcmToken) {
      try {
        await getMessaging().send({
          token: profile.fcmToken,
          notification: {
            title: 'Production update',
            body: `You've been removed from ${production.name}.`,
          },
        });
      } catch (pushErr) {
        console.error('Error sending removal notification:', pushErr);
      }
    }

    return res.json({ message: `Removed from ${production.name}` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong removing that extra' });
  }
}

module.exports = {
  getMyProfile,
  updateMyProfile,
  updateFcmToken,
  listProfiles,
  getProfileById,
  getBankDetails,
  updateMyProductions,
  removeExtraFromMyProduction,
};