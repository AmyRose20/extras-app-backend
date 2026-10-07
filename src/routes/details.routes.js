const express = require('express');
const { handlePhotoUpload } = require('../controllers/signupController');
const { showRequestPage, requestLink, showUpdatePage, saveDetails } = require('../controllers/detailsController');

const router = express.Router();

// Public "Update my details" pages for extras without a smartphone (the code in the link is the proof)
router.get('/', showRequestPage);
router.post('/', requestLink);
router.get('/:token', showUpdatePage);
router.post('/:token', handlePhotoUpload, saveDetails);

module.exports = router;