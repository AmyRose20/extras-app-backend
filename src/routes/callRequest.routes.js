const express = require('express');
const { requireAuth, requireRole, requireProduction } = require('../middleware/auth');
const { createCallRequest, 
  getCallRequestStatus, 
  updateCallRequest, 
  copyCallRequest } = require('../controllers/callRequestController');

const router = express.Router();

// Coordinator-only
router.post('/', requireAuth, requireRole('ADMIN'), requireProduction, createCallRequest);
router.get('/:id', requireAuth, requireRole('ADMIN'), requireProduction, getCallRequestStatus);
router.patch('/:id', requireAuth, requireRole('ADMIN'), requireProduction, updateCallRequest);
router.post('/:id/copy', requireAuth, requireRole('ADMIN'), requireProduction, copyCallRequest);

module.exports = router;