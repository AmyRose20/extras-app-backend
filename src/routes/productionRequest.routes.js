const express = require('express');
const { requireAuth, requireRole, requireProduction } = require('../middleware/auth');
const {
  listProductionRequests,
  approveProductionRequest,
  denyProductionRequest,
} = require('../controllers/productionRequestController');

const router = express.Router();

// All coordinator-only, scoped to their own production
router.get('/', requireAuth, requireRole('ADMIN'), requireProduction, listProductionRequests);
router.patch('/:id/approve', requireAuth, requireRole('ADMIN'), requireProduction, approveProductionRequest);
router.patch('/:id/deny', requireAuth, requireRole('ADMIN'), requireProduction, denyProductionRequest);

module.exports = router;