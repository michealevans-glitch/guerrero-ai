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
            INSERT INTO leads (contact_name, phone, service_type, source, notes, status)
            VALUES ($1, $2, $3, $4, $5, 'New') RETURNING *
        `, [contact_name || 'No especificado', phone, service_type || 'Consulta General', source || 'manual', notes || null]);
        const lead = result.rows[0];
        sendLeadAlert(lead);
        res.json(lead);
    } catch (err) {
        console.error('❌ createLead error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ─── GET ALL LEADS — returns ALL leads not just New ───────────────────────────
const getActiveLeads = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT *, EXTRACT(EPOCH FROM (NOW() - created_at)) as seconds_waiting
            FROM leads ORDER BY updated_at DESC NULLS LAST
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── GET RECENT LEADS ─────────────────────────────────────────────────────────
const getRecentLeads = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM leads ORDER BY updated_at DESC NULLS LAST LIMIT 50');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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
                claimed_at = NOW(),
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

// ─── MARK LOST → status = cerrado ────────────────────────────────────────────
const markLost = async (req, res) => {
    try {
        const id = req.params.id || req.params.leadId;
        const { reason_lost, closed_by } = req.body;

        const { rows } = await pool.query(`
            UPDATE leads
            SET status = 'cerrado',
                reason_lost = $1,
                updated_at = NOW()
            WHERE id = $2
            RETURNING *
        `, [reason_lost || 'Sin razón', id]);

        if (!rows.length) return res.status(404).json({ error: 'Lead no encontrado' });
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
            'SELECT * FROM leads WHERE claimed_by = $1 ORDER BY updated_at DESC NULLS LAST LIMIT 50',
            [staff_name]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── TRANSFER LEAD ────────────────────────────────────────────────────────────
// Uses claimed_by as the "assigned to" field since leads table has claimed_by
const transferLead = async (req, res) => {
    try {
        const id = req.params.id || req.params.leadId;
        const { transferred_to, transferred_by, note } = req.body;
        if (!transferred_to) return res.status(400).json({ error: 'transferred_to requerido' });

        // Update claimed_by to the new person (since assigned_to doesn't exist)
        const { rows } = await pool.query(`
            UPDATE leads
            SET claimed_by = $1,
                status = 'activo',
                updated_at = NOW()
            WHERE id = $2
            RETURNING *
        `, [transferred_to, id]);

        if (!rows.length) return res.status(404).json({ error: 'Lead no encontrado' });

        // Log in messages
        const noteText = note ? ` — ${note}` : '';
        const logMsg = `Transferido a ${transferred_to} por ${transferred_by || 'admin'}${noteText}`;
        await pool.query(
            `INSERT INTO messages (lead_id, message_text, sent_by, direction, created_at)
             VALUES ($1, $2, 'sistema', 'system', NOW())`,
            [id, logMsg]
        ).catch(() => {});

        res.json({ success: true, lead: rows[0], transferred_to });
    } catch (err) {
        console.error('❌ transferLead error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ─── ASSIGN LEAD (admin) ──────────────────────────────────────────────────────
const assignLead = async (req, res) => {
    try {
        const id = req.params.id;
        const { assigned_to, assigned_by } = req.body;
        if (!assigned_to) return res.status(400).json({ error: 'assigned_to requerido' });

        const { rows } = await pool.query(`
            UPDATE leads
            SET claimed_by = $1,
                status = 'activo',
                updated_at = NOW()
            WHERE id = $2
            RETURNING *
        `, [assigned_to, id]);

        if (!rows.length) return res.status(404).json({ error: 'Lead no encontrado' });

        await pool.query(
            `INSERT INTO messages (lead_id, message_text, sent_by, direction, created_at)
             VALUES ($1, $2, 'sistema', 'system', NOW())`,
            [id, `Asignado a ${assigned_to} por ${assigned_by || 'admin'}`]
        ).catch(() => {});

        res.json({ success: true, lead: rows[0], assigned_to });
    } catch (err) {
        console.error('❌ assignLead error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ─── VISION EN VIVO ───────────────────────────────────────────────────────────
const getVisionVivo = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, contact_name, phone, status, claimed_by, source, service_type, updated_at
            FROM leads
            WHERE status NOT IN ('cerrado', 'Lost')
            ORDER BY updated_at DESC NULLS LAST
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── SEND MESSAGE — matches exact messages table columns ──────────────────────
// Columns: id, lead_id, message_text, direction, sent_by, created_at, body
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

        // Try Twilio WhatsApp
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
        }

        // INSERT using message_text column (confirmed exists in DB)
        const result = await pool.query(
            `INSERT INTO messages (lead_id, message_text, body, sent_by, direction, created_at)
             VALUES ($1, $2, $2, $3, 'outgoing', NOW()) RETURNING *`,
            [lead_id, message, sent_by || 'sistema']
        );

        // Update lead updated_at
        await pool.query(
            `UPDATE leads SET updated_at = NOW() WHERE id = $1`,
            [lead_id]
        ).catch(() => {});

        res.json({ success: true, message: result.rows[0] });
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
    assignLead,
    getVisionVivo,
    sendMessage
};
