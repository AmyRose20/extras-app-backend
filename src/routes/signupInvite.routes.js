const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSignupInvite, listSignupInvites } = require('../controllers/signupInviteController');

const router = express.Router();

// Coordinator-only, scoped to their own production
router.post('/', requireAuth, requireRole('ADMIN'), sendSignupInvite);
router.get('/', requireAuth, requireRole('ADMIN'), listSignupInvites);

module.exports = router;