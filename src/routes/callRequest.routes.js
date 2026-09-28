const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { createCallRequest, 
  getCallRequestStatus, 
  updateCallRequest, 
  copyCallRequest } = require('../controllers/callRequestController');

const router = express.Router();

// Coordinator-only
router.post('/', requireAuth, requireRole('ADMIN'), createCallRequest);
router.get('/:id', requireAuth, requireRole('ADMIN'), getCallRequestStatus);
router.patch('/:id', requireAuth, requireRole('ADMIN'), updateCallRequest);
router.post('/:id/copy', requireAuth, requireRole('ADMIN'), copyCallRequest);

module.exports = router;