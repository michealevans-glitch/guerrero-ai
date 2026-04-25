const express = require('express');
const router = express.Router();
const { sendOutreachEmails, getProspectsList, markProspectContacted } = require('../controllers/outreachController');

router.post('/send-emails', sendOutreachEmails);
router.get('/prospects', getProspectsList);
router.post('/mark-contacted', markProspectContacted);

module.exports = router;