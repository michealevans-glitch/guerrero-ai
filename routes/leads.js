const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const leadController = require('../controllers/leadController');

// ─── LEADS BASE ───────────────────────────────────────────────────────────────
router.get('/', leadController.getActiveLeads);
router.get('/recent', leadController.getRecentLeads);
router.post('/new', leadController.createLead);

// ─── UNREAD COUNT ─────────────────────────────────────────────────────────────
router.get('/unread-count', async (req, res) => {
  try {
    const alba = await pool.query(
      "SELECT COUNT(*) FROM leads WHERE status = 'New' AND (business = 'albalumen' OR business IS NULL)"
    );
    const huellitas = await pool.query(
      "SELECT COUNT(*) FROM leads WHERE status = 'New' AND business = 'huellitas'"
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
      'SELECT * FROM messages WHERE lead_id = $1 ORDER BY created_at ASC',
      [req.params.leadId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/send-message', leadController.sendMessage);

// ─── CLAIM LEAD — supports both /claim/:id and /claim/:leadId ─────────────────
router.post('/claim/:id', leadController.claimLead);
router.put('/claim/:leadId', leadController.claimLead);

// ─── MARK LOST — supports both POST and PUT ───────────────────────────────────
router.post('/:id/lost', leadController.markLost);
router.put('/lost/:leadId', leadController.markLost);

// ─── MARK LOST (alt route used by v4.5 frontend) ─────────────────────────────
router.post('/:id/claim', leadController.claimLead);

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