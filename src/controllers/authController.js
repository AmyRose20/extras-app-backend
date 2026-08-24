const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const { getAuth } = require('firebase-admin/auth');
const firebaseApp = require('../config/firebase');

const SALT_ROUNDS = 10;

async function register(req, res) {
  try {
    const { email, password, name, role, phone } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'email, password, name and role are required' });
    }
    if (!['ADMIN', 'EXTRA'].includes(role)) {
      return res.status(400).json({ error: 'role must be ADMIN or EXTRA' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role,
        phone,
        // Give every EXTRA an empty profile right away so they can fill it in
        extraProfile: role === 'EXTRA' ? { create: {} } : undefined,
      },
    });

    const token = signToken(user);
    return res.status(201).json({ token, user: toPublicUser(user) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong registering the user' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);
    const firebaseToken = await getAuth(firebaseApp).createCustomToken(user.id);

    return res.json({ token, firebaseToken, user: toPublicUser(user) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong logging in' });
  }
}

function signToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// Never send the password hash back to the client
function toPublicUser(user) {
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

module.exports = { register, login };
