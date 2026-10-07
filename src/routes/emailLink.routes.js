const express = require('express');
const { showInvitePage, answerInvite } = require('../controllers/emailLinkController');

const router = express.Router();

// Public web pages opened from links in emails (no login — the code in the link is the proof)
router.get('/invite/:token', showInvitePage);
router.post('/invite/:token', answerInvite);

module.exports = router;