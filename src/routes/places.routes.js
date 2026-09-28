const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { autocomplete, details } = require('../controllers/placesController');

const router = express.Router();

router.get('/autocomplete', requireAuth, requireRole('ADMIN'), autocomplete);
router.get('/details/:placeId', requireAuth, requireRole('ADMIN'), details);

module.exports = router;