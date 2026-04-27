const express = require('express');
const router = express.Router();
const { markContacted, getOutreachStats, sendWhatsAppOutreach, sendEmailOutreach } = require('../controllers/outreachController');

router.post('/mark-contacted', markContacted);
router.get('/stats', getOutreachStats);
router.post('/send-whatsapp', sendWhatsAppOutreach);
router.post('/send-email', sendEmailOutreach);

module.exports = router;