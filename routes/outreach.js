const express = require('express');
const router = express.Router();
const {
  markContacted, handleStop, getOutreachStats,
  getSettingsAPI, updateSetting,
  sendWhatsAppOutreach, sendSMSOutreach,
  sendEmailOutreach, importCSV
} = require('../controllers/outreachController');

router.post('/mark-contacted', markContacted);
router.post('/handle-stop', handleStop);
router.get('/stats', getOutreachStats);
router.get('/settings', getSettingsAPI);
router.post('/settings', updateSetting);
router.post('/send-whatsapp', sendWhatsAppOutreach);
router.post('/send-sms', sendSMSOutreach);
router.post('/send-email', sendEmailOutreach);
router.post('/import-csv', importCSV);

module.exports = router;