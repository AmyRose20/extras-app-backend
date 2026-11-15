const express = require('express');
const { requireAuth, requireRole, requireProduction } = require('../middleware/auth');
const {
  requestOwnDeletion,
  cancelOwnDeletion,
  adminRequestDeletion,
  listPendingDeletionRequests,
  approveDeletionRequest,
  denyDeletionRequest,
} = require('../controllers/deletionRequestController');

const router = express.Router();

// Extra: request / cancel their own deletion
router.post('/me', requireAuth, requireRole('EXTRA'), requestOwnDeletion);
router.delete('/me', requireAuth, requireRole('EXTRA'), cancelOwnDeletion);

// Admin: view + act on deletion requests
router.get('/', requireAuth, requireRole('ADMIN'), requireProduction, listPendingDeletionRequests);
router.post('/:id', requireAuth, requireRole('ADMIN'), requireProduction, adminRequestDeletion);
router.patch('/:id/approve', requireAuth, requireRole('ADMIN'), requireProduction, approveDeletionRequest);
router.patch('/:id/deny', requireAuth, requireRole('ADMIN'), requireProduction, denyDeletionRequest);

module.exports = router;