const express = require('express');
const { requireAuth, requireRole, requireProduction } = require('../middleware/auth');
const { listMyLocations, createLocation } = require('../controllers/locationController');
const router = express.Router();

router.get('/', requireAuth, requireRole('ADMIN'), requireProduction, listMyLocations);
router.post('/', requireAuth, requireRole('ADMIN'), requireProduction, createLocation);

module.exports = router;