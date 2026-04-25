const express = require('express');
const router = express.Router();
const { createLead, getActiveLeads, getRecentLeads, claimLead, markLost } = require('../controllers/leadController');
const { testEmail } = require('../controllers/emailController');

router.post('/new', createLead);
router.get('/active', getActiveLeads);
router.get('/recent', getRecentLeads);
router.put('/claim/:id', claimLead);
router.put('/lost/:id', markLost);
router.get('/test-email', testEmail);

module.exports = router;