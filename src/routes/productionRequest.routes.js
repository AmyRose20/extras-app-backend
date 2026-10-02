const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  listProductionRequests,
  approveProductionRequest,
  denyProductionRequest,
} = require('../controllers/productionRequestController');

const router = express.Router();

// All coordinator-only, scoped to their own production
router.get('/', requireAuth, requireRole('ADMIN'), listProductionRequests);
router.patch('/:id/approve', requireAuth, requireRole('ADMIN'), approveProductionRequest);
router.patch('/:id/deny', requireAuth, requireRole('ADMIN'), denyProductionRequest);

module.exports = router;