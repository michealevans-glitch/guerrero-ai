const pool = require('../config/database');
require('dotenv').config();

const markContacted = async (req, res) => {
  try {
    const { id, channel } = req.body;
    await pool.query(`
      UPDATE external_leads_pool 
      SET status = 'contacted',
          outreach_attempts = outreach_attempts + 1,
          last_contact_at = NOW()
      WHERE id = $1
    `, [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getOutreachStats = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        niche,
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'contacted' THEN 1 END) as contacted,
        COUNT(CASE WHEN status = 'new' THEN 1 END) as pending
      FROM external_leads_pool
      GROUP BY niche
      ORDER BY niche
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const sendWhatsAppOutreach = async (req, res) => {
  try {
    const { niche, city, business } = req.body;
    
    let query = `SELECT * FROM external_leads_pool WHERE status = 'new'`;
    const params = [];
    
    if (niche) { params.push(niche); query += ` AND niche = $${params.length}`; }
    if (city) { params.push(city); query += ` AND city = $${params.length}`; }
    query += ` AND phone IS NOT NULL LIMIT 50`;
    
    const prospects = await pool.query(query, params);
    
    const messages = {
      huellitas_vet: `Estimados colegas, somos Huellitas al Cielo, crematorio certificado de mascotas en San José. Cuando llega ese momento difícil con sus pacientes, nosotros estamos aquí para apoyarles. 🐾 Cremación 0-15kg: ₡40,000 | 16-30kg: ₡59,000. WhatsApp: +506 7046 9290. Para no recibir más mensajes responda STOP.`,
      alba_funeraria: `Estimados colegas, somos Albalumen, crematorio y funeraria en San José, atención 24/7. Nos gustaría presentarles nuestros servicios para posibles alianzas. ⚰️ Paquete Emergencias: ₡350,000+IVA. WhatsApp: +506 8528 1312. Para no recibir más mensajes responda STOP.`,
      alba_hospital: `Estimados profesionales de la salud, somos Albalumen, crematorio y funeraria en San José, atención 24/7. Estamos disponibles para apoyarles cuando sus pacientes y familias lo necesiten. WhatsApp: +506 8528 1312. Para no recibir más mensajes responda STOP.`
    };

    const messageKey = business === 'huellitas' ? 'huellitas_vet' : 
                       niche === 'funeraria' ? 'alba_funeraria' : 'alba_hospital';
    const messageText = messages[messageKey];

    let sent = 0;
    let failed = 0;

    for (const prospect of prospects.rows) {
      try {
        const cleanPhone = prospect.phone.replace(/\D/g, '');
        const fullPhone = cleanPhone.length === 8 ? `506${cleanPhone}` : cleanPhone;
        
        const response = await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: fullPhone,
            type: 'text',
            text: { body: messageText }
          })
        });

        if (response.ok) {
          await pool.query(`
            UPDATE external_leads_pool 
            SET status = 'contacted', outreach_attempts = outreach_attempts + 1, last_contact_at = NOW()
            WHERE id = $1
          `, [prospect.id]);
          sent++;
        } else {
          failed++;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch(e) {
        failed++;
      }
    }

    res.json({ success: true, sent, failed, total: prospects.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const sendEmailOutreach = async (req, res) => {
  try {
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    const { niche, business } = req.body;
    const result = await pool.query(`
      SELECT * FROM external_leads_pool 
      WHERE status = 'new' AND email IS NOT NULL
      ${niche ? `AND niche = '${niche}'` : ''}
      LIMIT 50
    `);

    let sent = 0;
    for (const prospect of result.rows) {
      try {
        const isHuellitas = business === 'huellitas';
        await sgMail.send({
          to: prospect.email,
          from: process.env.EMAIL_USER,
          subject: isHuellitas 
            ? `Alianza de Servicio — Crematorio Huellitas al Cielo 🐾`
            : `Servicios Funerarios y de Cremación — Albalumen ⚰️`,
          html: isHuellitas ? `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <h2 style="color:#C9184A;">🐾 Huellitas al Cielo</h2>
              <p>Estimados colegas de <strong>${prospect.business_name}</strong>,</p>
              <p>Somos <strong>Huellitas al Cielo</strong>, crematorio certificado de mascotas en San José, Costa Rica.</p>
              <p>Nos gustaría proponerles una alianza de servicio para apoyar a sus clientes en los momentos más difíciles.</p>
              <h3>Nuestros servicios:</h3>
              <ul>
                <li>🐱 Cremación Peluditos (0-15kg): ₡40,000</li>
                <li>🐕 Cremación Huellita (16-30kg): ₡59,000</li>
                <li>📋 Plan Preventivo: 18 cuotas de ₡4,900</li>
              </ul>
              <p><strong>WhatsApp: +506 7046 9290</strong></p>
              <p style="font-size:12px;color:#888;">Para no recibir más mensajes, responda STOP a este correo.</p>
            </div>` : `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <h2 style="color:#2D6A4F;">⚰️ Albalumen</h2>
              <p>Estimados de <strong>${prospect.business_name}</strong>,</p>
              <p>Somos <strong>Albalumen</strong>, crematorio y funeraria en San José, Costa Rica. Atención 24/7, 365 días.</p>
              <h3>Nuestros servicios:</h3>
              <ul>
                <li>🕊️ Paquete Emergencias: ₡350,000+IVA</li>
                <li>🕊️ Paquete Completo: ₡650,000+IVA (cuotas ₡13,000 quincenal)</li>
                <li>⚰️ Sepultura: ₡400,000+IVA</li>
                <li>🏛️ Columbarios: ₡910,000 pago único</li>
              </ul>
              <p><strong>Email: info@albalumen.com | WhatsApp: +506 8528 1312</strong></p>
              <p style="font-size:12px;color:#888;">Para no recibir más mensajes, responda STOP a este correo.</p>
            </div>`
        });
        
        await pool.query(`UPDATE external_leads_pool SET status = 'contacted', outreach_attempts = outreach_attempts + 1, last_contact_at = NOW() WHERE id = $1`, [prospect.id]);
        sent++;
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch(e) { console.log('Email failed:', e.message); }
    }
    
    res.json({ success: true, sent, total: result.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { markContacted, getOutreachStats, sendWhatsAppOutreach, sendEmailOutreach };