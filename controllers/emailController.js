const sgMail = require('@sendgrid/mail');
require('dotenv').config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendLeadAlert = async (lead) => {
  try {
    await sgMail.send({
      to: process.env.EMAIL_ALERT_TO,
      from: process.env.EMAIL_USER,
      subject: `⚔️ NUEVO LEAD — ${lead.service_type}`,
      html: `
        <div style="background:#0a0a0f;color:white;padding:20px;border-radius:10px;border:1px solid #00ff88;font-family:sans-serif;">
          <h1 style="color:#00ff88;">⚔️ GUERRERO AI — Nuevo Lead</h1>
          <p><strong>Nombre:</strong> ${lead.contact_name}</p>
          <p><strong>Teléfono:</strong> ${lead.phone}</p>
          <p><strong>Servicio:</strong> ${lead.service_type}</p>
          <p><strong>Fuente:</strong> ${lead.source}</p>
          <p style="color:#888;font-size:12px;">guerreroai.com</p>
        </div>`
    });
    console.log('✅ Email enviado via SendGrid!');
  } catch (err) {
    console.error('❌ SendGrid error:', err.message);
  }
};

const testEmail = async (req, res) => {
  try {
    await sgMail.send({
      to: process.env.EMAIL_ALERT_TO,
      from: process.env.EMAIL_USER,
      subject: '✅ Guerrero AI — Test SendGrid',
      text: 'Email funcionando via SendGrid!'
    });
    res.json({ success: true, message: 'Email enviado a ' + process.env.EMAIL_ALERT_TO });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { sendLeadAlert, testEmail };