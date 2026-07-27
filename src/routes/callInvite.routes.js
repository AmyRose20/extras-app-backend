const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getMyInvites, respondToInvite } = require('../controllers/callInviteController');

const router = express.Router();

router.get('/me', requireAuth, requireRole('EXTRA'), getMyInvites);
router.patch('/:id', requireAuth, requireRole('EXTRA'), respondToInvite);

module.exports = router;
