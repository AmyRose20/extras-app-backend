const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { listProductions } = require('../controllers/productionController');

const router = express.Router();

router.get('/', requireAuth, listProductions);

module.exports = router;