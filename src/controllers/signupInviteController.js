const prisma = require('../config/db');
const { newLinkToken, appUrl } = require('../utils/notify');
const { sendEmail, emailLayout, escapeHtml } = require('../utils/email');

// Coordinators email sign-up links to new extras (Phase 3 Part 11).
// Whoever signs up through a link gets an APPROVED membership of that production straight away.
// If the email already has an extra account, the production is just added (no link needed).

const INVITE_DAYS = 7; // links work for 7 days
const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // something@something.something

// Every coordinator must be linked to a production. Returns the
// productionId, or sends a 403 and returns null if they aren't linked.
function requireProduction(req, res) {
  if (!req.user.productionId) {
    res.status(403).json({ error: 'Your account is not linked to a production' });
    return null;
  }
  return req.user.productionId;
}

// SENT (waiting) / SIGNED_UP / ADDED (already had an account) / EXPIRED
function inviteStatus(invite) {
  if (invite.existingAccount) return 'ADDED';
  if (invite.usedAt) return 'SIGNED_UP';
  if (invite.expiresAt < new Date()) return 'EXPIRED';
  return 'SENT';
}

// What the app gets for each invite (never the token hash)
function toListItem(invite, name = null) {
  return {
    id: invite.id,
    email: invite.email,
    status: inviteStatus(invite),
    sentAt: invite.createdAt,
    expiresAt: invite.expiresAt,
    usedAt: invite.usedAt,
    name, // who signed up / was added, if known
  };
}

function buildSignupInviteEmail(productionName, coordinatorName, link) {
  const button = `<a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#2563eb;color:#ffffff;font-weight:bold;text-decoration:none;">Sign up</a>`;
  return {
    subject: `You're invited to join ${productionName} as an extra`,
    text:
      `Hi,\n\n` +
      `${coordinatorName} has invited you to sign up as an extra for ${productionName} on the Extras App.\n\n` +
      `Sign up here: ${link}\n\n` +
      `The link works once and expires in ${INVITE_DAYS} days.\n\n` +
      `You don't need a smartphone. If you don't have one, you can fill in your details on the sign-up page ` +
      `and we'll email you whenever there's a call for you.`,
    html: emailLayout(
      `You're invited to join ${productionName}`,
      `<p>Hi,</p>
       <p><strong>${escapeHtml(coordinatorName)}</strong> has invited you to sign up as an extra for
          <strong>${escapeHtml(productionName)}</strong> on the Extras App.</p>
       <p>${button}</p>
       <p style="color:#6b7280;font-size:13px;">The link works once and expires in ${INVITE_DAYS} days.</p>
       <p>You don't need a smartphone. If you don't have one, you can fill in your details on the sign-up page
          and we'll email you whenever there's a call for you.</p>`
    ),
  };
}

function buildAddedEmail(name, productionName, coordinatorName) {
  return {
    subject: `You've been added to ${productionName}`,
    text:
      `Hi ${name},\n\n` +
      `${coordinatorName} has added you to ${productionName} on the Extras App. ` +
      `You'll now get calls for it. There's nothing you need to do.`,
    html: emailLayout(
      `You've been added to ${productionName}`,
      `<p>Hi ${escapeHtml(name)},</p>
       <p><strong>${escapeHtml(coordinatorName)}</strong> has added you to <strong>${escapeHtml(productionName)}</strong>
          on the Extras App. You'll now get calls for it. There's nothing you need to do.</p>`
    ),
  };
}

// The email already has an account: add the production straight away (no link)
async function addExistingAccount(req, res, { user, email, productionId, production, coordinator }) {
  if (user.deletedAt) {
    return res.status(400).json({ error: 'That email belongs to an account that has been deleted.' });
  }
  if (user.role !== 'EXTRA' || !user.extraProfile) {
    return res.status(400).json({ error: 'That email belongs to a coordinator account.' });
  }

  const membership = user.extraProfile.memberships[0]; // filtered to this production in the query
  if (membership && membership.status === 'APPROVED') {
    return res.status(409).json({ error: `${user.name} is already on ${production.name}.` });
  }

  const now = new Date();
  const [, invite] = await prisma.$transaction([
    // APPROVED, whether they had no membership, a pending request or an old denial
    prisma.extraProduction.upsert({
      where: { extraProfileId_productionId: { extraProfileId: user.extraProfile.id, productionId } },
      update: { status: 'APPROVED', reviewedAt: now, reviewedByAdminId: req.user.userId },
      create: {
        extraProfileId: user.extraProfile.id,
        productionId,
        status: 'APPROVED',
        reviewedAt: now,
        reviewedByAdminId: req.user.userId,
      },
    }),
    // A record for the coordinator's list ("Added – already had an account")
    prisma.signupInvite.create({
      data: {
        email,
        productionId,
        invitedById: req.user.userId,
        expiresAt: now,
        usedAt: now,
        usedByUserId: user.id,
        existingAccount: true,
      },
    }),
  ]);

  try {
    await sendEmail({ to: email, ...buildAddedEmail(user.name, production.name, coordinator.name) });
  } catch (emailErr) {
    // They're added either way, so don't fail over the email
    console.error("Could not send 'added to production' email:", emailErr.message);
  }

  return res.json({
    message: `${user.name} already had an account, so they've been added to ${production.name} straight away.`,
    invite: toListItem(invite, user.name),
  });
}

// POST /signup-invites — an ADMIN invites someone to sign up for THEIR production
// body: { "email": "someone@example.com" }
async function sendSignupInvite(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    const [production, coordinator] = await Promise.all([
      prisma.production.findUnique({ where: { id: productionId }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: req.user.userId }, select: { name: true } }),
    ]);

    // Already has an account? (ignoring capital letters)
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      include: { extraProfile: { include: { memberships: { where: { productionId } } } } },
    });
    if (user) {
      return addExistingAccount(req, res, { user, email, productionId, production, coordinator });
    }

    // New person. Only one working link per email per production, so sending again replaces the old one.
    await prisma.signupInvite.deleteMany({ where: { email, productionId, usedAt: null } });

    const { token, tokenHash } = newLinkToken();
    const invite = await prisma.signupInvite.create({
      data: {
        email,
        productionId,
        invitedById: req.user.userId,
        tokenHash,
        expiresAt: new Date(Date.now() + INVITE_DAYS * DAY_MS),
      },
    });

    try {
      const link = appUrl(`/signup/${token}`);
      await sendEmail({ to: email, ...buildSignupInviteEmail(production.name, coordinator.name, link) });
    } catch (emailErr) {
      // No point keeping an invite nobody received
      console.error('Could not send sign-up invite email:', emailErr.message);
      await prisma.signupInvite.delete({ where: { id: invite.id } });
      return res.status(502).json({ error: "The invite couldn't be emailed. Please check the address and try again." });
    }

    return res.status(201).json({ message: `Invite sent to ${email}`, invite: toListItem(invite) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong sending that invite' });
  }
}

// GET /signup-invites — an ADMIN lists the invites sent for THEIR production (newest first)
async function listSignupInvites(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const invites = await prisma.signupInvite.findMany({
      where: { productionId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Names of the people who signed up / were added
    const userIds = invites.map((invite) => invite.usedByUserId).filter(Boolean);
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    return res.json(invites.map((invite) => toListItem(invite, nameById.get(invite.usedByUserId) ?? null)));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong loading invites' });
  }
}

module.exports = { sendSignupInvite, listSignupInvites, INVITE_DAYS };