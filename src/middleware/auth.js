const jwt = require('jsonwebtoken');
const prisma = require('../config/db');

// Verifies the Authorization: Bearer <token> header and attaches
// the decoded payload (userId, role) to req.user.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = header.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { deletedAt: true, productionId: true, passwordChangedAt: true },
    });

    // Reject tokens belonging to an account that's since been deleted
    if (!user || user.deletedAt) {
      return res.status(401).json({ error: 'This account no longer exists' });
    }

    // Reject logins from before the password was last changed ("log out other devices").
    // payload.iat = when the token was issued, in seconds.
    if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime()) {
      return res.status(401).json({
        error: 'Your password was changed. Please log in again.',
        code: 'PASSWORD_CHANGED',
      });
    }

    // productionId is set for coordinators (ADMIN), null for extras
    req.user = { ...payload, productionId: user.productionId }; // { userId, role, productionId }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Restricts a route to specific roles, e.g. requireRole('ADMIN')
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that' });
    }
    next();
  };
}

// For coordinator routes: every coordinator must be linked to a production,
// because everything they see is scoped to it. Use after requireRole('ADMIN').
// The controller can then read req.user.productionId knowing it's set.
function requireProduction(req, res, next) {
  if (!req.user || !req.user.productionId) {
    return res.status(403).json({ error: 'Your account is not linked to a production' });
  }
  next();
}

module.exports = { requireAuth, requireRole, requireProduction };