const express = require('express');
const { requireAuth, requireRole, requireProduction } = require('../middleware/auth');
const { sendSignupInvite, listSignupInvites } = require('../controllers/signupInviteController');

const router = express.Router();

// Coordinator-only, scoped to their own production
router.post('/', requireAuth, requireRole('ADMIN'), requireProduction, sendSignupInvite);
router.get('/', requireAuth, requireRole('ADMIN'), requireProduction, listSignupInvites);

module.exports = router;