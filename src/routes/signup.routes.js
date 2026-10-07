const express = require('express');
const { handlePhotoUpload, showSignupPage, submitSignup } = require('../controllers/signupController');

const router = express.Router();

// Public sign-up page opened from a coordinator's invite email (the code in the link is the proof)
router.get('/:token', showSignupPage);
router.post('/:token', handlePhotoUpload, submitSignup);

module.exports = router;