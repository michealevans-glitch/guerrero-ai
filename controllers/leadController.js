const pool = require('../config/database');
const twilio = require('twilio');
const twilioClient = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// --- FUNCIONES CORE ---

const getActiveLeads = async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM leads WHERE status = 'nuevo' OR status = 'New' OR status = 'In-Progress' ORDER BY created_at DESC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const getRecentLeads = async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM leads ORDER BY created_at DESC LIMIT 15");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const createLead = async (req, res) => {
    const { contact_name, phone, service_type, source, notes, business, registered_by } = req.body;
    try {
        const result = await pool.query(
            "INSERT INTO leads (name, phone, service_type, source, notes, business, status, registered_by) VALUES ($1, $2, $3, $4, $5, $6, 'nuevo', $7) RETURNING *",
            [contact_name, phone, service_type, source, notes, business, registered_by]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- ENVÍO DE WHATSAPP REAL (TWILIO) ---

const sendMessage = async (req, res) => {
    try {
        const { lead_id, message, sent_by, business } = req.body;

        // 1. Obtener datos del cliente
        const leadRes = await pool.query('SELECT phone FROM leads WHERE id = $1', [lead_id]);
        if (leadRes.rows.length === 0) return res.status(404).json({ error: 'Lead no encontrado' });
        
        let clientPhone = leadRes.rows[0].phone;
        // Limpieza de número para Twilio
        const cleanPhone = clientPhone.replace(/\D/g, '');
        const finalPhone = cleanPhone.length === 8 ? `506${cleanPhone}` : cleanPhone;

        // 2. Disparar WhatsApp vía Twilio
        await twilioClient.messages.create({
            from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`, 
            body: message,
            to: `whatsapp:+${finalPhone}`
        });

        // 3. Guardar en DB para el historial del chat
        const result = await pool.query(
            'INSERT INTO messages (lead_id, message_text, direction, sent_by, message_type) VALUES ($1, $2, \'outgoing\', $3, \'text\') RETURNING *',
            [lead_id, message, sent_by]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error('❌ Error enviando WhatsApp:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// --- GESTIÓN DE ESTADOS ---

const claimLead = async (req, res) => {
    try {
        const { staff_name } = req.body;
        const result = await pool.query(
            "UPDATE leads SET status = 'In-Progress', claimed_by = $1, claimed_at = NOW() WHERE id = $2 RETURNING *",
            [staff_name, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

const markLost = async (req, res) => {
    try {
        const { reason_lost, competitor_name, closed_by } = req.body;
        const result = await pool.query(
            "UPDATE leads SET status = 'Lost', reason_lost = $1, competitor_name = $2, closed_by = $3, closed_at = NOW() WHERE id = $4 RETURNING *",
            [reason_lost, competitor_name, closed_by, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// --- ALERTAS DE VOZ ---

const checkUnattendedLeads = async () => {
    try {
        const query = "SELECT * FROM leads WHERE (status = 'nuevo' OR status = 'New') AND created_at < NOW() - INTERVAL '3 minutes' AND alert_sent = false";
        const { rows } = await pool.query(query);
        for (let lead of rows) {
            const alertNumbers = [process.env.TWILIO_PHONE_ALERT, process.env.TWILIO_ALERT_OSCAR].filter(Boolean);
            for (let num of alertNumbers) {
                await twilioClient.calls.create({
                    twiml: `<Response><Say voice="Polly.Lupe" language="es-US">Atención Guerrero. Cliente ${lead.name || 'nuevo'} esperando.</Say></Response>`,
                    to: num,
                    from: process.env.TWILIO_PHONE
                });
            }
            await pool.query('UPDATE leads SET alert_sent = true WHERE id = $1', [lead.id]);
        }
    } catch (e) { console.error('❌ Error Alerta Voz:', e.message); }
};

module.exports = { 
    getActiveLeads, 
    getRecentLeads, 
    createLead, 
    checkUnattendedLeads,
    sendMessage,
    claimLead,
    markLost,
    getMyLeads: async (req,res) => res.json([]) 
};