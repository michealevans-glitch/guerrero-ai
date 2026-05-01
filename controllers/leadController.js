const pool = require('../config/database');
const { sendLeadAlert } = require('./emailController');
const twilio = require('twilio');

const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

// ─── CREATE LEAD ──────────────────────────────────────────────────────────────
const createLead = async (req, res) => {
    try {
        const { contact_name, phone, service_type, source, notes, registered_by, business } = req.body;
        if (!phone) return res.status(400).json({ error: 'Phone is required' });
        const result = await pool.query(`
            INSERT INTO leads (contact_name, phone, service_type, source, notes, status, registered_by, business)
            VALUES ($1, $2, $3, $4, $5, 'New', $6, $7) RETURNING *
        `, [contact_name || 'No especificado', phone, service_type || 'Consulta General', source || 'manual', notes || null, registered_by || null, business || 'albalumen']);
        const lead = result.rows[0];
        sendLeadAlert(lead);
        res.json(lead);
    } catch (err) {
        console.error('❌ Lead error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ─── GET ALL LEADS ────────────────────────────────────────────────────────────
const getActiveLeads = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT *, EXTRACT(EPOCH FROM (NOW() - created_at)) as seconds_waiting
            FROM leads ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── GET RECENT LEADS ─────────────────────────────────────────────────────────
const getRecentLeads = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM leads ORDER BY created_at DESC LIMIT 50');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── CLAIM LEAD ───────────────────────────────────────────────────────────────
const claimLead = async (req, res) => {
    try {
        const id = req.params.id || req.params.leadId;
        const { staff_name } = req.body;
        if (!staff_name) return res.status(400).json({ error: 'staff_name requerido' });
        const { rows } = await pool.query(`
            UPDATE leads
            SET status = 'activo',
                claimed_by = $1,
                assigned_to = $1,
                updated_at = NOW()
            WHERE id = $2
            RETURNING *
        `, [staff_name, id]);
        if (!rows.length) return res.status(404).json({ error: 'Lead no encontrado' });
        res.json({ success: true, lead: rows[0] });
    } catch (err) {
        console.error('❌ claimLead error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ─── MARK LOST → goes to Cerrados list ───────────────────────────────────────
const markLost = async (req, res) => {
    try {
        const id = req.params.id || req.params.leadId;
        const { reason_lost, competitor_name, closed_by } = req.body;
        const { rows } = await pool.query(`
            UPDATE leads
            SET status = 'cerrado',
                reason_lost = $1,
                competitor_name = $2,
                lost_at = NOW(),
                closed_by = $3,
                updated_at = NOW()
            WHERE id = $4
            RETURNING *
        `, [reason_lost || 'Sin razón', competitor_name || null, closed_by || null, id]);
        if (!rows.length) return res.status(404).json({ error: 'Lead no encontrado' });

        // Log in messages (silent fail if body column doesn't exist)
        await pool.query(
            `INSERT INTO messages (lead_id, body, sent_by, direction, created_at)
             VALUES ($1, $2, 'sistema', 'system', NOW())`,
            [id, `Marcado como perdido — Razón: ${reason_lost || 'Sin razón'}. Por: ${closed_by || 'sistema'}`]
        ).catch(() => {});

        res.json({ success: true, lead: rows[0] });
    } catch (err) {
        console.error('❌ markLost error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ─── GET MY LEADS ─────────────────────────────────────────────────────────────
const getMyLeads = async (req, res) => {
    try {
        const { staff_name } = req.query;
        const result = await pool.query(
            'SELECT * FROM leads WHERE claimed_by = $1 OR assigned_to = $1 ORDER BY updated_at DESC LIMIT 50',
            [staff_name]
        );
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── TRANSFER LEAD ────────────────────────────────────────────────────────────
const transferLead = async (req, res) => {
    try {
        const id = req.params.id || req.params.leadId;
        const { transferred_to, transferred_by, note, assigned_to } = req.body;
        if (!transferred_to) return res.status(400).json({ error: 'transferred_to requerido' });

        const { rows } = await pool.query(`
            UPDATE leads
            SET transferred_to = $1,
                assigned_to = $2,
                updated_at = NOW()
            WHERE id = $3
            RETURNING *
        `, [transferred_to, assigned_to || transferred_to, id]);

        if (!rows.length) return res.status(404).json({ error: 'Lead no encontrado' });

        const noteText = note ? ` — ${note}` : '';
        await pool.query(
            `INSERT INTO messages (lead_id, body, sent_by, direction, created_at)
             VALUES ($1, $2, 'sistema', 'system', NOW())`,
            [id, `Transferido a ${transferred_to} por ${transferred_by || 'admin'}${noteText}`]
        ).catch(() => {});

        res.json({ success: true, lead: rows[0], transferred_to });
    } catch (err) {
        console.error('❌ transferLead error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ─── VISION EN VIVO ───────────────────────────────────────────────────────────
const getVisionVivo = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, contact_name, phone, status, assigned_to, claimed_by,
                   business, source, service_type, updated_at
            FROM leads
            WHERE status NOT IN ('cerrado', 'Lost')
            ORDER BY updated_at DESC
        `);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── SEND MESSAGE — FIXED: no message_type, no business column ───────────────
const sendMessage = async (req, res) => {
    try {
        const { lead_id, message, sent_by } = req.body;

        if (!lead_id || !message) {
            return res.status(400).json({ error: 'lead_id y message son requeridos' });
        }

        // 🚨 Anti-desvío check
        const prohibidas = ['mi número', 'personal', 'mi cuenta', 'pago directo', 'por fuera'];
        if (prohibidas.some(p => message.toLowerCase().includes(p))) {
            console.log(`🚨 ALERTA ROJA: Posible desvío por ${sent_by}`);
        }

        // Try to send via Twilio WhatsApp
        try {
            const leadRes = await pool.query('SELECT phone FROM leads WHERE id = $1', [lead_id]);
            if (leadRes.rows[0]?.phone) {
                let clientPhone = leadRes.rows[0].phone.replace(/\D/g, '');
                const finalPhone = clientPhone.length === 8 ? `506${clientPhone}` : clientPhone;
                await twilioClient.messages.create({
                    from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
                    body: message,
                    to: `whatsapp:+${finalPhone}`
                });
                console.log(`✅ WhatsApp sent to +${finalPhone}`);
            }
        } catch (twilioErr) {
            console.error(`❌ Twilio error (non-fatal): ${twilioErr.message}`);
            // Non-fatal — still save to DB
        }

        // ✅ FIXED INSERT — tries body column first, then falls back
        let msgRow;
        try {
            const r = await pool.query(
                `INSERT INTO messages (lead_id, body, sent_by, direction, created_at)
                 VALUES ($1, $2, $3, 'outgoing', NOW()) RETURNING *`,
                [lead_id, message, sent_by || 'sistema']
            );
            msgRow = r.rows[0];
        } catch (e1) {
            // If body column doesn't exist, try message_text
            try {
                const r = await pool.query(
                    `INSERT INTO messages (lead_id, message_text, sent_by, direction, created_at)
                     VALUES ($1, $2, $3, 'outgoing', NOW()) RETURNING *`,
                    [lead_id, message, sent_by || 'sistema']
                );
                msgRow = r.rows[0];
            } catch (e2) {
                throw new Error(`DB insert failed: ${e2.message}`);
            }
        }

        // Update lead last_message
        await pool.query(
            `UPDATE leads SET last_message = $1, updated_at = NOW() WHERE id = $2`,
            [message.substring(0, 255), lead_id]
        ).catch(() => {});

        res.json({ success: true, message: msgRow });
    } catch (err) {
        console.error('❌ sendMessage error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    createLead,
    getActiveLeads,
    getRecentLeads,
    claimLead,
    markLost,
    getMyLeads,
    transferLead,
    getVisionVivo,
    sendMessage
};