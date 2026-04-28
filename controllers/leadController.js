// ============================================
// GUERRERO AI III — ALERTA DE VOZ TWILIO
// leadController.js — Bloque de Alerta
// ============================================

const twilio = require('twilio');
const twilioClient = new twilio(
    process.env.TWILIO_ACCOUNT_SID, 
    process.env.TWILIO_AUTH_TOKEN
);

const checkUnattendedLeads = async () => {
    try {
        const query = `
            SELECT * FROM leads 
            WHERE status = 'nuevo' 
            AND created_at < NOW() - INTERVAL '3 minutes'
            AND alert_sent = false
        `;
        
        const { rows } = await pool.query(query);

        for (let lead of rows) {
            const contactName = lead.contact_name || 'Sin nombre';
            
            // LLAMADA DE VOZ A MICHEAL Y OSCAR
            const alertNumbers = [
                process.env.TWILIO_ALERT_MICHEAL,
                process.env.TWILIO_ALERT_OSCAR
            ].filter(Boolean); // Solo llama a los que estén configurados

            for (let alertNumber of alertNumbers) {
                await twilioClient.calls.create({
                    twiml: `<Response>
                        <Say voice="Polly.Lupe" language="es-US">
                            Atención Guerrero. Hay un cliente nuevo esperando en el War Room.
                            El cliente se llama ${contactName}.
                            Ingresa al sistema ahora para atenderlo.
                            Repito. Cliente pendiente: ${contactName}.
                        </Say>
                    </Response>`,
                    to: alertNumber,
                    from: process.env.TWILIO_PHONE
                });

                console.log(`📞 Alerta de voz enviada a ${alertNumber} — Lead: ${contactName}`);
            }

            // Marcar como alertado para no llamar infinitamente
            await pool.query(
                'UPDATE leads SET alert_sent = true WHERE id = $1', 
                [lead.id]
            );
        }

    } catch (error) {
        console.error('❌ Error en checkUnattendedLeads:', error.message);
    }
};

// SMS DE RESPALDO (si WhatsApp falla)
const sendBackupSMS = async (to, message) => {
    try {
        // Validar que el número destino sea +1 USA (Twilio trial/paid limitation)
        if (!to.startsWith('+1')) {
            console.log(`⚠️ SMS omitido — número CR no soportado sin A2P: ${to}`);
            return;
        }

        await twilioClient.messages.create({
            body: `[ALBALUMEN] ${message}`,
            from: process.env.TWILIO_PHONE,
            to: to
        });

        console.log(`✅ SMS de respaldo enviado a ${to}`);

    } catch (error) {
        console.error('❌ Error enviando SMS de respaldo:', error.message);
    }
};

module.exports = { checkUnattendedLeads, sendBackupSMS };