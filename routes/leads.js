const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const lc = require('../controllers/leadController');

// ─── LEADS BASE ───────────────────────────────────────────────────────────────
router.get('/', lc.getActiveLeads);
router.get('/recent', lc.getRecentLeads);
router.post('/new', lc.createLead);

// ─── UNREAD COUNT ─────────────────────────────────────────────────────────────
router.get('/unread-count', async (req, res) => {
  try {
    let alba, huellitas;
    try {
      alba = await pool.query("SELECT COUNT(*) FROM leads WHERE status = 'New' AND (business = 'albalumen' OR business IS NULL)");
      huellitas = await pool.query("SELECT COUNT(*) FROM leads WHERE status = 'New' AND business = 'huellitas'");
    } catch(e) {
      // fallback si no hay columna business
      alba = await pool.query("SELECT COUNT(*) FROM leads WHERE status = 'New'");
      huellitas = { rows: [{ count: '0' }] };
    }
    res.json({ alba: parseInt(alba.rows[0].count), huellitas: parseInt(huellitas.rows[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── MESSAGES ─────────────────────────────────────────────────────────────────
router.get('/messages/:leadId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM messages WHERE lead_id = $1 ORDER BY created_at ASC',
      [req.params.leadId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/send-message', lc.sendMessage);

// ─── CLAIM — todas las variantes de ruta que usa el frontend ─────────────────
router.post('/claim/:id',    lc.claimLead);
router.put('/claim/:leadId', lc.claimLead);
router.post('/:id/claim',   lc.claimLead);
router.put('/:id/claim',    lc.claimLead);

// ─── LOST — todas las variantes ───────────────────────────────────────────────
router.post('/:id/lost',      lc.markLost);
router.put('/lost/:leadId',   lc.markLost);
router.put('/:id/lost',       lc.markLost);

// ─── TRANSFER ────────────────────────────────────────────────────────────────
router.post('/:id/transfer',    lc.transferLead);
router.post('/transfer/:id',    lc.transferLead);

// ─── VISION EN VIVO (admins) ──────────────────────────────────────────────────
router.get('/vision-vivo', lc.getVisionVivo);

// ─── MY LEADS ─────────────────────────────────────────────────────────────────
router.get('/my-leads', lc.getMyLeads);

// ─── QUICK REPLIES ────────────────────────────────────────────────────────────
router.get('/quick-replies/:business/:user', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM quick_replies WHERE business = $1 AND (user_name = $2 OR user_name = 'system') ORDER BY id ASC",
      [req.params.business, decodeURIComponent(req.params.user)]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/quick-replies', async (req, res) => {
  try {
    const { business, user_name, reply_text } = req.body;
    const result = await pool.query(
      'INSERT INTO quick_replies (business, user_name, reply_text) VALUES ($1,$2,$3) RETURNING *',
      [business, user_name, reply_text]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/quick-replies/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM quick_replies WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;