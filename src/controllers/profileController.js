const prisma = require('../config/db');
require('../config/firebase'); // initializes the Firebase app
const { getMessaging } = require('firebase-admin/messaging');
const { ageFromDob, dobFilterForAgeRange } = require('../utils/age');
const { encrypt, decrypt } = require('../utils/crypto');
const { normaliseIban, isValidIban, normaliseBic, isValidBic, maskIban } = require('../utils/bankDetails');

// After a request is denied (or a coordinator removes them), an extra must wait
// this many days before asking to join that production again.
const REQUEST_AGAIN_AFTER_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

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

// When a DENIED extra may ask to join that production again.
function canRequestAgainAt(membership) {
  const from = membership.reviewedAt ?? membership.requestedAt;
  return new Date(from.getTime() + REQUEST_AGAIN_AFTER_DAYS * DAY_MS);
}

// Splits an extra's memberships into three lists for the app:
//   productions        → APPROVED (same shape as before: [{ id, name }])
//   pendingProductions → waiting for the coordinator
//   deniedProductions  → not approved, with the date they can ask again
function splitMemberships(memberships) {
  const productions = [];
  const pendingProductions = [];
  const deniedProductions = [];

  for (const m of memberships) {
    const production = { id: m.production.id, name: m.production.name };
    if (m.status === 'APPROVED') {
      productions.push(production);
    } else if (m.status === 'PENDING') {
      pendingProductions.push({ ...production, requestedAt: m.requestedAt });
    } else {
      deniedProductions.push({ ...production, canRequestAgainAt: canRequestAgainAt(m) });
    }
  }
  return { productions, pendingProductions, deniedProductions };
}

// Used in includes: each membership plus its production's id + name
const MEMBERSHIP_WITH_PRODUCTION = {
  include: { production: { select: { id: true, name: true } } },
};

// GET /profiles/me — an EXTRA viewing their own profile
async function getMyProfile(req, res) {
  const profile = await prisma.extraProfile.findUnique({
    where: { userId: req.user.userId },
    include: {
      user: {
        select: { deletionRequestStatus: true, deletionRequestedAt: true, deletionReason: true },
      },
      memberships: MEMBERSHIP_WITH_PRODUCTION,
    },
  });

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  const { user, memberships, ...rest } = profile;
  return res.json({
    ...toSafeProfile(rest, { showMasked: true }),
    ...splitMemberships(memberships),
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

    const { skill, gender, minAge, maxAge, availability, name } = req.query;

    const where = {
      memberships: { some: { productionId, status: 'APPROVED' } }, // only APPROVED extras on my production
      user: { deletedAt: null },                                     // hide soft-deleted extras
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

    if (name && name.trim()) {
      where.user = {
        ...where.user, // keep the "hide deleted extras" check
        name: { contains: name.trim(), mode: 'insensitive' },
      };
    }

    const profiles = await prisma.extraProfile.findMany({
      where,
      orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
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
// Only works if that extra is APPROVED on the coordinator's production.
// Bank details are NOT included — only whether they exist (see getBankDetails).
async function getProfileById(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { id } = req.params;

    const profile = await prisma.extraProfile.findFirst({
      where: { id, memberships: { some: { productionId, status: 'APPROVED' } } },
      include: {
        user: { select: { name: true, deletionRequestStatus: true } },
        // coordinators only see the productions the extra is APPROVED on
        memberships: { where: { status: 'APPROVED' }, ...MEMBERSHIP_WITH_PRODUCTION },
      },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { user, memberships, ...rest } = profile;
    return res.json({
      ...toSafeProfile(rest), // no masked details for coordinators — they use "Show bank details"
      productions: memberships.map((m) => m.production),
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
      where: { id, memberships: { some: { productionId, status: 'APPROVED' } } },
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

// PATCH /profiles/me/productions — an EXTRA sets which productions they WANT to be on.
// body: { "productionIds": ["...", "..."] }  (the FULL list they want, not just changes)
// Compared with what they have now:
//  - APPROVED but not in the list → they LEAVE it (instant, no approval needed)
//  - PENDING but not in the list  → their request is CANCELLED
//  - in the list but not approved/pending → a new REQUEST (PENDING) for that coordinator
// Rules:
//  - must stay on at least one APPROVED production
//  - can't leave a production they have upcoming ACCEPTED shoot days on
//  - can't re-request a DENIED production until REQUEST_AGAIN_AFTER_DAYS have passed
//  - pending invites on upcoming shoot days of a production they leave become EXPIRED
async function updateMyProductions(req, res) {
  try {
    const { productionIds } = req.body;

    if (!Array.isArray(productionIds) || productionIds.length === 0) {
      return res.status(400).json({ error: 'You must be on at least one production' });
    }
    const wantedIds = [...new Set(productionIds)]; // ignore duplicates

    const validProductions = await prisma.production.findMany({
      where: { id: { in: wantedIds } },
    });
    if (validProductions.length !== wantedIds.length) {
      return res.status(400).json({ error: 'One or more productions were not found' });
    }

    const profile = await prisma.extraProfile.findUnique({
      where: { userId: req.user.userId },
      include: { memberships: true },
    });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const membershipByProduction = new Map(profile.memberships.map((m) => [m.productionId, m]));
    const idsWithStatus = (status) =>
      profile.memberships.filter((m) => m.status === status).map((m) => m.productionId);

    const approvedIds = idsWithStatus('APPROVED');
    const pendingIds = idsWithStatus('PENDING');

    const leavingIds = approvedIds.filter((id) => !wantedIds.includes(id));
    const cancelIds = pendingIds.filter((id) => !wantedIds.includes(id));
    const requestIds = wantedIds.filter((id) => !approvedIds.includes(id) && !pendingIds.includes(id));

    if (!approvedIds.some((id) => wantedIds.includes(id))) {
      return res.status(400).json({ error: 'You must stay on at least one approved production' });
    }

    const now = new Date();

    // Denied recently? Not allowed to ask again yet.
    for (const id of requestIds) {
      const membership = membershipByProduction.get(id);
      if (membership && membership.status === 'DENIED') {
        const againAt = canRequestAgainAt(membership);
        if (againAt > now) {
          const productionName = validProductions.find((p) => p.id === id).name;
          return res.status(400).json({
            error: `You can ask to join ${productionName} again from ${againAt.toLocaleDateString('en-IE')}.`,
          });
        }
      }
    }

    // Booked on an upcoming shoot day for a production they're leaving? Cancel those first.
    if (leavingIds.length > 0) {
      const bookedInvites = await prisma.callInvite.findMany({
        where: {
          extraProfileId: profile.id,
          status: 'ACCEPTED',
          callRequest: { shootDay: { productionId: { in: leavingIds }, date: { gt: now } } },
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

    await prisma.$transaction([
      // Leave approved productions + cancel pending requests
      prisma.extraProduction.deleteMany({
        where: { extraProfileId: profile.id, productionId: { in: [...leavingIds, ...cancelIds] } },
      }),
      // New requests (or a fresh request after a denial has expired)
      ...requestIds.map((productionId) =>
        prisma.extraProduction.upsert({
          where: { extraProfileId_productionId: { extraProfileId: profile.id, productionId } },
          create: { extraProfileId: profile.id, productionId }, // status defaults to PENDING
          update: { status: 'PENDING', requestedAt: now, reviewedAt: null, reviewedByAdminId: null },
        })
      ),
      // Pending invites for productions they've left can no longer be answered
      prisma.callInvite.updateMany({
        where: {
          extraProfileId: profile.id,
          status: 'PENDING',
          callRequest: { shootDay: { productionId: { in: leavingIds }, date: { gt: now } } },
        },
        data: { status: 'EXPIRED' },
      }),
    ]);

    const memberships = await prisma.extraProduction.findMany({
      where: { extraProfileId: profile.id },
      ...MEMBERSHIP_WITH_PRODUCTION,
    });

    return res.json(splitMemberships(memberships));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong updating your productions' });
  }
}

// DELETE /profiles/:id/production — an ADMIN removes an extra from THEIR production.
// The extra's account and other productions are untouched.
// Their membership becomes DENIED (so they can't instantly re-request; the 30-day wait applies).
// Their pending + accepted invites on upcoming shoot days for this production become EXPIRED.
async function removeExtraFromMyProduction(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const { id } = req.params;

    const profile = await prisma.extraProfile.findFirst({
      where: { id, memberships: { some: { productionId, status: 'APPROVED' } } },
      include: { memberships: { where: { status: 'APPROVED' }, ...MEMBERSHIP_WITH_PRODUCTION } },
    });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    if (profile.memberships.length === 1) {
      return res.status(400).json({
        error: "This is the extra's only production. Use a deletion request instead.",
      });
    }

    const production = profile.memberships.find((m) => m.productionId === productionId).production;
    const now = new Date();

    await prisma.$transaction([
      prisma.extraProduction.update({
        where: { extraProfileId_productionId: { extraProfileId: profile.id, productionId } },
        data: { status: 'DENIED', reviewedAt: now, reviewedByAdminId: req.user.userId },
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