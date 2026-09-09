const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getMyInvites, respondToInvite, getMyTally, getExtraTally } = require('../controllers/callInviteController');

const router = express.Router();

router.get('/me', requireAuth, requireRole('EXTRA'), getMyInvites);
router.get('/tally/me', requireAuth, requireRole('EXTRA'), getMyTally);
router.get('/tally/:extraProfileId', requireAuth, requireRole('ADMIN'), getExtraTally);
router.patch('/:id', requireAuth, requireRole('EXTRA'), respondToInvite);

module.exports = router;