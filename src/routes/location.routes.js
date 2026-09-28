const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { listMyLocations, createLocation } = require('../controllers/locationController');
const router = express.Router();

router.get('/', requireAuth, requireRole('ADMIN'), listMyLocations);
router.post('/', requireAuth, requireRole('ADMIN'), createLocation);

module.exports = router;