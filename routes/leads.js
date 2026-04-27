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

// Mensajes del chat
router.get('/messages/:leadId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM messages WHERE lead_id = $1 ORDER BY created_at ASC`,
      [req.params.leadId]
    );
    res.json(result.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.post('/send-message', async (req, res) => {
  try {
    const { lead_id, message, sent_by, business } = req.body;
    const result = await pool.query(
      `INSERT INTO messages (lead_id, message_text, direction, sent_by) VALUES ($1, $2, 'outgoing', $3) RETURNING *`,
      [lead_id, message, sent_by]
    );
    res.json(result.rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Quick replies personalizadas
router.get('/quick-replies/:business/:user', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM quick_replies WHERE business = $1 AND user_name = $2 ORDER BY id ASC`,
      [req.params.business, req.params.user]
    );
    res.json(result.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.post('/quick-replies', async (req, res) => {
  try {
    const { business, user_name, reply_text } = req.body;
    const result = await pool.query(
      `INSERT INTO quick_replies (business, user_name, reply_text) VALUES ($1, $2, $3) RETURNING *`,
      [business, user_name, reply_text]
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

// Contador de no leídos
router.get('/unread-count', async (req, res) => {
  try {
    const alba = await pool.query(`SELECT COUNT(*) FROM leads WHERE status = 'New' AND source NOT LIKE '%huellitas%'`);
    const huellitas = await pool.query(`SELECT COUNT(*) FROM leads WHERE status = 'New' AND source LIKE '%huellitas%'`);
    res.json({
      alba: parseInt(alba.rows[0].count),
      huellitas: parseInt(huellitas.rows[0].count)
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;