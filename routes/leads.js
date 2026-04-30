const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const leadController = require('../controllers/leadController');

// ─── LEADS BASE ───────────────────────────────────────────────────────────────
router.get('/', leadController.getActiveLeads || ((req, res) => res.json([])));
router.get('/recent', leadController.getRecentLeads || ((req, res) => res.json([])));
router.post('/new', leadController.createLead || ((req, res) => res.status(500).send('Error')));

// ─── UNREAD COUNT ─────────────────────────────────────────────────────────────
router.get('/unread-count', async (req, res) => {
  try {
    const alba = await pool.query(
      "SELECT COUNT(*) FROM leads WHERE status = 'New' AND (source NOT LIKE '%huellitas%' OR source IS NULL)"
    );
    const huellitas = await pool.query(
      "SELECT COUNT(*) FROM leads WHERE status = 'New' AND source LIKE '%huellitas%'"
    );
    res.json({
      alba: parseInt(alba.rows[0].count),
      huellitas: parseInt(huellitas.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MESSAGES ─────────────────────────────────────────────────────────────────
router.get('/messages/:leadId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM messages WHERE lead_id = $1 ORDER BY created_at ASC`,
      [req.params.leadId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/send-message', async (req, res) => {
  try {
    const { lead_id, message, sent_by, business, message_type, call_result, call_duration } = req.body;
    const type = message_type || 'outgoing';
    const result = await pool.query(
      `INSERT INTO messages (lead_id, message_text, direction, sent_by, business, message_type, call_result, call_duration, created_at)
       VALUES ($1, $2, 'outgoing', $3, $4, $5, $6, $7, NOW()) RETURNING *`,
      [lead_id, message, sent_by, business, type, call_result || null, call_duration || null]
    );
    res.json({ success: true, message: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CLAIM LEAD ───────────────────────────────────────────────────────────────
router.put('/claim/:leadId', async (req, res) => {
  try {
    const { staff_name } = req.body;
    await pool.query(
      `UPDATE leads SET status = 'In-Progress', claimed_by = $1, updated_at = NOW() WHERE id = $2`,
      [staff_name, req.params.leadId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MARK LOST ────────────────────────────────────────────────────────────────
router.put('/lost/:leadId', async (req, res) => {
  try {
    const { reason_lost, competitor_name, closed_by } = req.body;
    await pool.query(
      `UPDATE leads SET status = 'Lost', reason_lost = $1, competitor_name = $2, closed_by = $3, updated_at = NOW() WHERE id = $4`,
      [reason_lost, competitor_name || null, closed_by, req.params.leadId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── QUICK REPLIES ────────────────────────────────────────────────────────────
router.get('/quick-replies/:business/:user', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM quick_replies WHERE business = $1 AND (user_name = $2 OR user_name = 'system') ORDER BY id ASC",
      [req.params.business, decodeURIComponent(req.params.user)]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/quick-replies', async (req, res) => {
  try {
    const { business, user_name, reply_text } = req.body;
    const result = await pool.query(
      'INSERT INTO quick_replies (business, user_name, reply_text) VALUES ($1,$2,$3) RETURNING *',
      [business, user_name, reply_text]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/quick-replies/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM quick_replies WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
