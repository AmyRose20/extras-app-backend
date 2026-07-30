const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { createShootDay } = require('../controllers/shootDayController');

const router = express.Router();

router.post('/', requireAuth, requireRole('ADMIN'), createShootDay);

module.exports = router;