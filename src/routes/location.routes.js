const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { listMyLocations } = require('../controllers/locationController');

const router = express.Router();

router.get('/', requireAuth, requireRole('ADMIN'), listMyLocations);

module.exports = router;