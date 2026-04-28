const express = require('express');
const router = express.Router();
const { createLead, getActiveLeads, getRecentLeads, claimLead, markLost, getMyLeads } = require('../controllers/leadController');
const { testEmail } = require('../controllers/emailController');
const pool = require('../config/database');

router.post('/new', createLead);
router.get('/active', getActiveLeads);
router.get('/recent', getRecentLeads);
router.put('/claim/:id', claimLead);
router.put('/lost/:id', markLost);
router.get('/my-leads', getMyLeads);
router.get('/test-email', testEmail);

router.get('/messages/:leadId', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM messages WHERE lead_id = $1 ORDER BY created_at ASC`, [req.params.leadId]);
    res.json(result.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.post('/send-message', async (req, res) => {
  try {
    const { lead_id, message, sent_by, business, message_type, call_result, call_duration } = req.body;
    const result = await pool.query(
      `INSERT INTO messages (lead_id, message_text, direction, sent_by, message_type, call_result, call_duration)
       VALUES ($1,$2,'outgoing',$3,$4,$5,$6) RETURNING *`,
      [lead_id, message, sent_by, message_type||'text', call_result||null, call_duration||null]
    );
    res.json(result.rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.get('/quick-replies/:business/:user', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM quick_replies WHERE business = $1 AND (user_name = $2 OR user_name = 'system') ORDER BY user_name DESC, id ASC`,
      [req.params.business, decodeURIComponent(req.params.user)]
    );
    res.json(result.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.post('/quick-replies', async (req, res) => {
  try {
    const { business, user_name, reply_text } = req.body;
    const result = await pool.query(
      `INSERT INTO quick_replies (business, user_name, reply_text) VALUES ($1,$2,$3) RETURNING *`,
      [business, user_name, reply_text]
    );
    res.json(result.rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.put('/quick-replies/:id', async (req, res) => {
  try {
    const { reply_text } = req.body;
    const result = await pool.query(
      `UPDATE quick_replies SET reply_text = $1 WHERE id = $2 RETURNING *`,
      [reply_text, req.params.id]
    );
    res.json(result.rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.delete('/quick-replies/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM quick_replies WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.get('/unread-count', async (req, res) => {
  try {
    const alba = await pool.query(`SELECT COUNT(*) FROM leads WHERE status = 'New' AND (source NOT LIKE '%huellitas%' OR source IS NULL)`);
    const huellitas = await pool.query(`SELECT COUNT(*) FROM leads WHERE status = 'New' AND source LIKE '%huellitas%'`);
    res.json({ alba: parseInt(alba.rows[0].count), huellitas: parseInt(huellitas.rows[0].count) });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.post('/transfer', async (req, res) => {
  try {
    const { lead_id, to_user, from_user } = req.body;
    const result = await pool.query(
      `UPDATE leads SET claimed_by = $1, transferred_from = $2, transferred_at = NOW() WHERE id = $3 RETURNING *`,
      [to_user, from_user, lead_id]
    );
    res.json(result.rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;