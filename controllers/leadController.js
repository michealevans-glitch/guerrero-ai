const pool = require('../config/database');
const { sendLeadAlert } = require('./emailController');
const twilio = require('twilio');

const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

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

const getActiveLeads = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT *, EXTRACT(EPOCH FROM (NOW() - created_at)) as seconds_waiting
            FROM leads WHERE status = 'New' ORDER BY created_at ASC
        `);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

const getRecentLeads = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM leads ORDER BY created_at DESC LIMIT 50');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

const claimLead = async (req, res) => {
    try {
        const id = req.params.id || req.params.leadId;
        const { staff_name } = req.body;
        await pool.query(`
            UPDATE leads SET status = 'In-Progress', claimed_by = $1, updated_at = NOW()
            WHERE id = $2
        `, [staff_name, id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

const markLost = async (req, res) => {
    try {
        const id = req.params.id || req.params.leadId;
        const { reason_lost, competitor_name, closed_by } = req.body;
        await pool.query(`
            UPDATE leads SET status = 'Lost', reason_lost = $1, competitor_name = $2,
            lost_at = NOW(), closed_by = $3 WHERE id = $4
        `, [reason_lost, competitor_name || null, closed_by || null, id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

const getMyLeads = async (req, res) => {
    try {
        const { staff_name } = req.query;
        const result = await pool.query(
            'SELECT * FROM leads WHERE claimed_by = $1 ORDER BY claimed_at DESC LIMIT 50',
            [staff_name]
        );
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── SEND MESSAGE — BUG FIX: no 'business' column in messages table ──────────
const sendMessage = async (req, res) => {
    try {
        const { lead_id, message, sent_by, message_type, call_result, call_duration } = req.body;
        const type = message_type || 'outgoing';

        // 🚨 Anti-desvío
        const prohibidas = ['mi número', 'personal', 'mi cuenta', 'pago directo', 'por fuera'];
        if (prohibidas.some(p => message?.toLowerCase().includes(p))) {
            console.log(`🚨 ALERTA ROJA: Posible desvío por ${sent_by}`);
        }

        // Send via Twilio WhatsApp for real text messages only
        if (type === 'outgoing' && message) {
            try {
                const leadRes = await pool.query('SELECT phone FROM leads WHERE id = $1', [lead_id]);
                if (leadRes.rows[0]) {
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
                // Don't fail — still save to DB
            }
        }

        // ✅ FIX: INSERT without 'business' column (it doesn't exist in messages table)
        const result = await pool.query(
            `INSERT INTO messages (lead_id, message_text, direction, sent_by, message_type, call_result, call_duration, created_at)
             VALUES ($1, $2, 'outgoing', $3, $4, $5, $6, NOW()) RETURNING *`,
            [lead_id, message || null, sent_by, type, call_result || null, call_duration || null]
        );
        res.json({ success: true, message: result.rows[0] });
    } catch (err) {
        console.error('❌ sendMessage error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

module.exports = { createLead, getActiveLeads, getRecentLeads, claimLead, markLost, getMyLeads, sendMessage };