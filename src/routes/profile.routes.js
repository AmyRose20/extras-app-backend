const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getMyProfile, updateMyProfile, updateFcmToken, listProfiles, getProfileById } = require('../controllers/profileController');

const router = express.Router();

router.get('/', requireAuth, requireRole('ADMIN'), listProfiles);
router.get('/me', requireAuth, getMyProfile);
router.patch('/me', requireAuth, updateMyProfile);
router.patch('/me/fcm-token', requireAuth, updateFcmToken);
router.get('/:id', requireAuth, requireRole('ADMIN'), getProfileById);

module.exports = router;