const express = require('express');
const { requireAuth, requireRole, requireProduction } = require('../middleware/auth');
const {
  getMyProfile,
  updateMyProfile,
  updateFcmToken,
  listProfiles,
  getProfileById,
  getBankDetails,
  updateMyProductions,
  removeExtraFromMyProduction,
} = require('../controllers/profileController');

const router = express.Router();

router.get('/', requireAuth, requireRole('ADMIN'), requireProduction, listProfiles);
router.get('/me', requireAuth, getMyProfile);
router.patch('/me', requireAuth, updateMyProfile);
router.patch('/me/fcm-token', requireAuth, updateFcmToken);
router.patch('/me/productions', requireAuth, requireRole('EXTRA'), updateMyProductions);
router.get('/:id/bank-details', requireAuth, requireRole('ADMIN'), requireProduction, getBankDetails);
router.get('/:id', requireAuth, requireRole('ADMIN'), requireProduction, getProfileById);
router.delete('/:id/production', requireAuth, requireRole('ADMIN'), requireProduction, removeExtraFromMyProduction);

module.exports = router;