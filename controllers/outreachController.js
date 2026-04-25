const sgMail = require('@sendgrid/mail');
const pool = require('../config/database');
require('dotenv').config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendOutreachEmails = async (req, res) => {
  try {
    const prospects = await pool.query(`
      SELECT * FROM external_leads_pool
      WHERE status = 'new' 
      AND email IS NOT NULL
      AND outreach_attempts = 0
      ORDER BY google_rating DESC NULLS LAST
      LIMIT 50
    `);

    if (!prospects.rows.length) {
      return res.json({ message: 'No prospects with email available. Use phone outreach instead.' });
    }

    let sent = 0;
    for (const prospect of prospects.rows) {
      try {
        await sgMail.send({
          to: prospect.email,
          from: process.env.EMAIL_USER,
          subject: `Alianza Estratégica — Huellitas al Cielo + ${prospect.business_name}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;padding:30px;background:#fff;">
              <h2 style="color:#333;">Estimado equipo de ${prospect.business_name},</h2>
              <p>Mi nombre es Oscar Evans, director de <strong>Huellitas al Cielo</strong>, 
              crematorio certificado de mascotas en San José, Costa Rica.</p>
              <p>Nos gustaría proponerles una <strong>alianza estratégica</strong> que beneficie 
              a sus clientes en los momentos más difíciles.</p>
              <div style="background:#f5f5f5;padding:20px;border-radius:8px;margin:20px 0;">
                <h3 style="color:#333;margin:0 0 15px 0;">¿Qué ofrecemos?</h3>
                <p>✅ Cremación individual certificada</p>
                <p>✅ Recogida a domicilio o en su clínica</p>
                <p>✅ Urna y certificado incluidos</p>
                <p>✅ Video conmemorativo opcional</p>
                <p>✅ <strong>10% de comisión por cada referido</strong></p>
              </div>
              <p>Sus clientes merecen una despedida digna para sus mascotas. 
              Nosotros nos encargamos de todo con el mayor respeto y cariño.</p>
              <p><strong>¿Le interesa conversar?</strong></p>
              <p>📞 WhatsApp: +506 7046 9290<br>
              📧 info@huellitasalcielo.com<br>
              🌐 San José, Costa Rica</p>
              <p style="color:#888;font-size:12px;margin-top:30px;">
              Si no desea recibir más comunicaciones de nuestra parte, 
              por favor responda este email indicándolo.</p>
            </div>`
        });

        await pool.query(`
          UPDATE external_leads_pool 
          SET status = 'contacted', outreach_attempts = 1, last_contact_at = NOW()
          WHERE id = $1
        `, [prospect.id]);

        sent++;
        console.log(`✅ Email sent to ${prospect.business_name}`);
      } catch(emailErr) {
        console.log(`❌ Failed ${prospect.business_name}:`, emailErr.message);
      }
    }

    res.json({ success: true, sent, message: `Emails enviados: ${sent}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getProspectsList = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, business_name, phone, email, website, 
             google_rating, google_reviews, status, 
             outreach_attempts, city, niche
      FROM external_leads_pool
      ORDER BY google_rating DESC NULLS LAST
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const markProspectContacted = async (req, res) => {
  try {
    const { id, channel, notes } = req.body;
    await pool.query(`
      UPDATE external_leads_pool
      SET status = 'contacted',
          outreach_attempts = outreach_attempts + 1,
          last_contact_at = NOW(),
          notes = $1
      WHERE id = $2
    `, [notes || `Contacted via ${channel}`, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { sendOutreachEmails, getProspectsList, markProspectContacted };