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

    // Reject tokens belonging to an account that's since been deleted
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { deletedAt: true },
    });
    if (!user || user.deletedAt) {
      return res.status(401).json({ error: 'This account no longer exists' });
    }

    req.user = payload; // { userId, role }
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

module.exports = { requireAuth, requireRole };