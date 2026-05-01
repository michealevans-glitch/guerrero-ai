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
      alba = await pool.query("SELECT COUNT(*) FROM leads WHERE status = 'New'");
      huellitas = { rows: [{ count: '0' }] };
    }
    res.json({ alba: parseInt(alba.rows[0].count), huellitas: parseInt(huellitas.rows[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── MESSAGES ─────────────────────────────────────────────────────────────────
// Frontend calls: GET /api/leads/:id/messages
// OLD route was: GET /api/leads/messages/:leadId  ← this caused 404
router.get('/:id/messages', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, lead_id,
              COALESCE(body, message, text, '') AS body,
              COALESCE(body, message, text, '') AS message,
              COALESCE(sent_by, sender, 'sistema') AS sent_by,
              COALESCE(direction, 'in') AS direction,
              created_at
       FROM messages
       WHERE lead_id = $1
       ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[messages GET]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Keep old route as fallback (warroom, etc.)
router.get('/messages/:leadId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, lead_id,
              COALESCE(body, message, text, '') AS body,
              COALESCE(sent_by, sender, 'sistema') AS sent_by,
              COALESCE(direction, 'in') AS direction,
              created_at
       FROM messages
       WHERE lead_id = $1
       ORDER BY created_at ASC`,
      [req.params.leadId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SEND MESSAGE ─────────────────────────────────────────────────────────────
// Uses lc.sendMessage from leadController
// If lc.sendMessage inserts message_type and fails, override it here:
router.post('/send-message', async (req, res) => {
  try {
    const { lead_id, message, sent_by } = req.body;
    if (!lead_id || !message) {
      return res.status(400).json({ error: 'lead_id y message son requeridos' });
    }

    // Safe insert — only columns that definitely exist
    // Try with body column first, fall back to message column
    let msgRow;
    try {
      const r = await pool.query(
        `INSERT INTO messages (lead_id, body, sent_by, direction, created_at)
         VALUES ($1, $2, $3, 'outgoing', NOW()) RETURNING *`,
        [lead_id, message, sent_by || 'sistema']
      );
      msgRow = r.rows[0];
    } catch(e1) {
      // If body column doesn't exist, try message column
      try {
        const r = await pool.query(
          `INSERT INTO messages (lead_id, message, sent_by, direction, created_at)
           VALUES ($1, $2, $3, 'outgoing', NOW()) RETURNING *`,
          [lead_id, message, sent_by || 'sistema']
        );
        msgRow = r.rows[0];
      } catch(e2) {
        // Last resort — minimal insert
        const r = await pool.query(
          `INSERT INTO messages (lead_id, sent_by, direction, created_at)
           VALUES ($1, $2, 'outgoing', NOW()) RETURNING *`,
          [lead_id, sent_by || 'sistema']
        );
        msgRow = r.rows[0];
      }
    }

    // Update lead status to activo if it was nuevo
    await pool.query(
      `UPDATE leads SET last_message = $1, updated_at = NOW()
       WHERE id = $2`,
      [message.substring(0, 255), lead_id]
    ).catch(() => {});

    res.json({ success: true, message: msgRow });
  } catch (err) {
    console.error('[send-message]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── CLAIM — all variants ─────────────────────────────────────────────────────
router.post('/claim/:id',    lc.claimLead);
router.put('/claim/:leadId', lc.claimLead);
router.post('/:id/claim',   lc.claimLead);
router.put('/:id/claim',    lc.claimLead);

// ─── ASSIGN — NEW: frontend calls POST /api/leads/:id/assign ─────────────────
router.post('/:id/assign', async (req, res) => {
  try {
    const { assigned_to, assigned_by } = req.body;
    if (!assigned_to) return res.status(400).json({ error: 'assigned_to requerido' });
    const { rows } = await pool.query(
      `UPDATE leads SET assigned_to = $1, status = 'activo', updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [assigned_to, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Lead no encontrado' });
    // Log
    await pool.query(
      `INSERT INTO messages (lead_id, body, sent_by, direction, created_at)
       VALUES ($1, $2, 'sistema', 'system', NOW())`,
      [req.params.id, `Asignado a ${assigned_to} por ${assigned_by || 'admin'}`]
    ).catch(() => {});
    res.json({ success: true, lead: rows[0], assigned_to });
  } catch (err) {
    console.error('[assign]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── LOST — all variants ──────────────────────────────────────────────────────
router.post('/:id/lost',      lc.markLost);
router.put('/lost/:leadId',   lc.markLost);
router.put('/:id/lost',       lc.markLost);

// ─── TRANSFER — all variants ──────────────────────────────────────────────────
// Frontend calls POST /api/leads/:id/transfer
router.post('/:id/transfer', async (req, res) => {
  try {
    const { transferred_to, transferred_by, note, assigned_to } = req.body;
    if (!transferred_to) return res.status(400).json({ error: 'transferred_to requerido' });
    const { rows } = await pool.query(
      `UPDATE leads
       SET transferred_to = $1, assigned_to = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [transferred_to, assigned_to || transferred_to, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Lead no encontrado' });
    // Log transfer in messages
    const noteText = note ? ` — Nota: ${note}` : '';
    await pool.query(
      `INSERT INTO messages (lead_id, body, sent_by, direction, created_at)
       VALUES ($1, $2, 'sistema', 'system', NOW())`,
      [req.params.id, `Transferido a ${transferred_to} por ${transferred_by || 'admin'}${noteText}`]
    ).catch(() => {});
    res.json({ success: true, lead: rows[0], transferred_to });
  } catch (err) {
    console.error('[transfer]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/transfer/:id', async (req, res) => {
  // Alias — same logic, different param name
  req.params.id = req.params.id;
  // Re-use above logic
  try {
    const { transferred_to, transferred_by, note, assigned_to } = req.body;
    if (!transferred_to) return res.status(400).json({ error: 'transferred_to requerido' });
    const { rows } = await pool.query(
      `UPDATE leads SET transferred_to = $1, assigned_to = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [transferred_to, assigned_to || transferred_to, req.params.id]
    );
    res.json({ success: true, lead: rows[0] || {}, transferred_to });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── VISION EN VIVO (admins) ──────────────────────────────────────────────────
router.get('/vision-vivo', lc.getVisionVivo);

// ─── MY LEADS ─────────────────────────────────────────────────────────────────
router.get('/my-leads', lc.getMyLeads);

// ─── QUICK REPLIES ─────────────────────────────────────────────────────────────
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

// ─── FACEBOOK MESSAGES (placeholder) ─────────────────────────────────────────
router.get('/facebook/messages', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM facebook_messages ORDER BY timestamp DESC LIMIT 50'
    ).catch(() => ({ rows: [] }));
    res.json(rows);
  } catch(e) { res.json([]); }
});

module.exports = router;