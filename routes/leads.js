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
        const alba = await pool.query("SELECT COUNT(*) FROM leads WHERE status = 'New'");
        res.json({ alba: parseInt(alba.rows[0].count), huellitas: 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET MESSAGES ─────────────────────────────────────────────────────────────
// Frontend calls: GET /api/leads/:id/messages
// DB columns: id, lead_id, message_text, direction, sent_by, created_at, body
router.get('/:id/messages', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, lead_id,
                    COALESCE(body, message_text, '') AS body,
                    COALESCE(body, message_text, '') AS message,
                    COALESCE(sent_by, 'sistema') AS sent_by,
                    COALESCE(direction, 'in') AS direction,
                    created_at
             FROM messages
             WHERE lead_id = $1
             ORDER BY created_at ASC`,
            [req.params.id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('[GET messages]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Keep old route as fallback
router.get('/messages/:leadId', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, lead_id,
                    COALESCE(body, message_text, '') AS body,
                    COALESCE(sent_by, 'sistema') AS sent_by,
                    COALESCE(direction, 'in') AS direction,
                    created_at
             FROM messages WHERE lead_id = $1 ORDER BY created_at ASC`,
            [req.params.leadId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── SEND MESSAGE ─────────────────────────────────────────────────────────────
router.post('/send-message', lc.sendMessage);

// ─── CLAIM ────────────────────────────────────────────────────────────────────
router.post('/claim/:id',    lc.claimLead);
router.put('/claim/:leadId', lc.claimLead);
router.post('/:id/claim',   lc.claimLead);
router.put('/:id/claim',    lc.claimLead);

// ─── ASSIGN ───────────────────────────────────────────────────────────────────
router.post('/:id/assign', lc.assignLead);

// ─── LOST ─────────────────────────────────────────────────────────────────────
router.post('/:id/lost',    lc.markLost);
router.put('/:id/lost',     lc.markLost);
router.put('/lost/:leadId', lc.markLost);

// ─── TRANSFER ─────────────────────────────────────────────────────────────────
router.post('/:id/transfer',  lc.transferLead);
router.post('/transfer/:id',  lc.transferLead);

// ─── VISION EN VIVO ───────────────────────────────────────────────────────────
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

// ─── FACEBOOK ─────────────────────────────────────────────────────────────────
router.get('/facebook/messages', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM facebook_messages ORDER BY timestamp DESC LIMIT 50'
        ).catch(() => ({ rows: [] }));
        res.json(rows);
    } catch(e) {
        res.json([]);
    }
});

// ─── SINGLE LEAD ──────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM leads WHERE id = $1', [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Lead no encontrado' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
