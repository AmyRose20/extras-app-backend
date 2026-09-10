const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { createShootDay, getShootDays, getShootDay, updateShootDay } = require('../controllers/shootDayController');

const router = express.Router();

router.post('/', requireAuth, requireRole('ADMIN'), createShootDay);
router.get('/', requireAuth, requireRole('ADMIN'), getShootDays);
router.get('/:id', requireAuth, requireRole('ADMIN'), getShootDay);
router.patch('/:id', requireAuth, requireRole('ADMIN'), updateShootDay);

module.exports = router;