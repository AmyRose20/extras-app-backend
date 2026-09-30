const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
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

router.get('/', requireAuth, requireRole('ADMIN'), listProfiles);
router.get('/me', requireAuth, getMyProfile);
router.patch('/me', requireAuth, updateMyProfile);
router.patch('/me/fcm-token', requireAuth, updateFcmToken);
router.patch('/me/productions', requireAuth, requireRole('EXTRA'), updateMyProductions);
router.get('/:id/bank-details', requireAuth, requireRole('ADMIN'), getBankDetails);
router.get('/:id', requireAuth, requireRole('ADMIN'), getProfileById);
router.delete('/:id/production', requireAuth, requireRole('ADMIN'), removeExtraFromMyProduction);

module.exports = router;