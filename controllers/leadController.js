const pool = require('../config/database');
const twilio = require('twilio');
const twilioClient = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// --- OBTENER TODOS LOS LEADS (Sin filtros que los escondan) ---
const getActiveLeads = async (req, res) => {
    try {
        // Traemos todo lo que sea Nuevo o En Proceso para que no desaparezcan
        const result = await pool.query("SELECT * FROM leads WHERE status IN ('nuevo', 'New', 'In-Progress') ORDER BY created_at DESC");
        res.json(result.rows);
    } catch (err) {
        console.error('Error en getActiveLeads:', err.message);
        res.status(500).json({ error: err.message });
    }
};

const getRecentLeads = async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM leads ORDER BY created_at DESC LIMIT 50");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- CREAR LEAD (Con categorías para el análisis de IA) ---
const createLead = async (req, res) => {
    const { contact_name, phone, service_type, source, business, category, registered_by } = req.body;
    try {
        const result = await pool.query(
            "INSERT INTO leads (name, phone, service_type, source, business, category, status, registered_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, 'nuevo', $7, NOW()) RETURNING *",
            [contact_name, phone, service_type, source, business, category, registered_by]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error creando lead:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// --- ENVIAR MENSAJE Y ALERTA ANTI-ROBO ---
const sendMessage = async (req, res) => {
    try {
        const { lead_id, message, sent_by, business } = req.body;

        // Alerta Roja: Palabras de desvío
        const prohibidas = ["mi número", "personal", "mi cuenta", "pago directo", "por fuera"];
        const detectado = prohibidas.some(p => message.toLowerCase().includes(p));
        if (detectado) { console.log(`🚨 ALERTA ROJA: Posible desvío de cliente por ${sent_by}`); }

        const leadRes = await pool.query('SELECT phone FROM leads WHERE id = $1', [lead_id]);
        let clientPhone = leadRes.rows[0].phone.replace(/\D/g, '');
        const finalPhone = clientPhone.length === 8 ? `506${clientPhone}` : clientPhone;

        // WhatsApp Real
        await twilioClient.messages.create({
            from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`, 
            body: message,
            to: `whatsapp:+${finalPhone}`
        });

        const result = await pool.query(
            'INSERT INTO messages (lead_id, message_text, direction, sent_by, message_type, created_at) VALUES ($1, $2, \'outgoing\', $3, \'text\', NOW()) RETURNING *',
            [lead_id, message, sent_by]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { 
    getActiveLeads, 
    getRecentLeads, 
    createLead, 
    sendMessage,
    claimLead: async (req,res) => {
        await pool.query("UPDATE leads SET status = 'In-Progress', claimed_by = $1 WHERE id = $2", [req.body.staff_name, req.params.id]);
        res.json({success: true});
    },
    markLost: async (req,res) => {
        await pool.query("UPDATE leads SET status = 'Lost', reason_lost = $1 WHERE id = $2", [req.body.reason_lost, req.params.id]);
        res.json({success: true});
    }
};