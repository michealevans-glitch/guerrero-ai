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
router.post('/add', async (req, res) => {
  try {
    const { full_name, phone, email, address, source, business, notes, created_by } = req.body;
    await pool.query(
      `INSERT INTO contacts (full_name, phone, email, address, source, business, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [full_name, phone, email||null, address||null, source||null, business||'alba', notes||null, created_by||null]
    );
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});
module.exports = router;
