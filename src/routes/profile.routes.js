const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getMyProfile, updateMyProfile, updateFcmToken } = require('../controllers/profileController');

const router = express.Router();

router.get('/me', requireAuth, getMyProfile);
router.patch('/me', requireAuth, updateMyProfile);
router.patch('/me/fcm-token', requireAuth, updateFcmToken);

module.exports = router;
