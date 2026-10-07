const express = require('express');
const { register, login } = require('../controllers/authController');
const { requestPasswordReset, resetPassword, changePassword } = require('../controllers/passwordController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);

// Forgot password (no login needed) + change password (logged in) — Phase 3 Part 10
router.post('/forgot-password', requestPasswordReset);
router.post('/reset-password', resetPassword);
router.post('/change-password', requireAuth, changePassword);

module.exports = router;