const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  createCallRequest,
  getCallRequestStatus,
} = require('../controllers/callRequestController');

const router = express.Router();

// Coordinator-only
router.post('/', requireAuth, requireRole('ADMIN'), createCallRequest);
router.get('/:id', requireAuth, requireRole('ADMIN'), getCallRequestStatus);

module.exports = router;
