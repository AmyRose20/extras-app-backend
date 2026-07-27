const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getMyProfile, updateMyProfile } = require('../controllers/profileController');

const router = express.Router();

router.get('/me', requireAuth, getMyProfile);
router.patch('/me', requireAuth, updateMyProfile);

module.exports = router;
