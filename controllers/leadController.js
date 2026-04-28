const pool = require('../config/database');
const twilio = require('twilio');
const twilioClient = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// --- FUNCIONES CORE (Para que vuelvan los botones y leads) ---

const getActiveLeads = async (req, res) => {
    try {
        // Ajustamos los nombres de columnas según tu DB
        const result = await pool.query("SELECT * FROM leads WHERE status = 'nuevo' OR status = 'New' ORDER BY created_at DESC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const getRecentLeads = async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM leads ORDER BY created_at DESC LIMIT 10");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const createLead = async (req, res) => {
    const { name, phone, source, category } = req.body;
    try {
        const result = await pool.query(
            "INSERT INTO leads (name, phone, source, category, status) VALUES ($1, $2, $3, $4, 'nuevo') RETURNING *",
            [name, phone, source, category]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- LOGICA DE ALERTA DE VOZ (Twilio) ---

const checkUnattendedLeads = async () => {
    try {
        const query = `
            SELECT * FROM leads 
            WHERE (status = 'nuevo' OR status = 'New')
            AND created_at < NOW() - INTERVAL '3 minutes'
            AND alert_sent = false
        `;
        const { rows } = await pool.query(query);

        for (let lead of rows) {
            const contactName = lead.name || 'Cliente Nuevo';
            const alertNumbers = [process.env.TWILIO_PHONE_ALERT, process.env.TWILIO_ALERT_OSCAR].filter(Boolean);

            for (let alertNumber of alertNumbers) {
                await twilioClient.calls.create({
                    twiml: `<Response><Say voice="Polly.Lupe" language="es-US">Atención Guerrero. Lead pendiente de ${contactName}. Revisa el sistema.</Say></Response>`,
                    to: alertNumber,
                    from: process.env.TWILIO_PHONE
                });
            }
            await pool.query('UPDATE leads SET alert_sent = true WHERE id = $1', [lead.id]);
        }
    } catch (error) {
        console.error('❌ Error en Alerta Twilio:', error.message);
    }
};

// --- EXPORTAR TODO (Para que Routes los vea) ---
module.exports = { 
    getActiveLeads, 
    getRecentLeads, 
    createLead, 
    checkUnattendedLeads,
    claimLead: async (req,res) => res.json({msg: "OK"}), // Placeholder para que no de error
    markLost: async (req,res) => res.json({msg: "OK"}),  // Placeholder
    getMyLeads: async (req,res) => res.json([])         // Placeholder
};