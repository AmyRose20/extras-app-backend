const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getBadgeCounts, markBadgeSeen } = require('../controllers/badgeController');

const router = express.Router();

// Any logged-in user; the controller checks which badges their role can use
router.get('/', requireAuth, getBadgeCounts);
router.patch('/seen/:type', requireAuth, markBadgeSeen);

module.exports = router;
