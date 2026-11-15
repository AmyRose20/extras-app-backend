const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getProfileOptions } = require('../controllers/profileOptionsController');

const router = express.Router();

// Any logged-in user (extras pick from them; coordinators filter and match by them)
router.get('/', requireAuth, getProfileOptions);

module.exports = router;