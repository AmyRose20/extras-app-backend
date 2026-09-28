const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { reverseGeocode } = require('../controllers/geocodeController');

const router = express.Router();

router.get('/reverse', requireAuth, requireRole('ADMIN'), reverseGeocode);

module.exports = router;