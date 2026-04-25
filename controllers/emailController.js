const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.log('❌ EMAIL ERROR:', error.message);
  } else {
    console.log('📧 EMAIL LISTO');
  }
});

const sendLeadAlert = async (lead) => {
  console.log('📧 Intentando enviar email...');
  console.log('📧 USER:', process.env.EMAIL_USER);
  console.log('📧 TO:', process.env.EMAIL_ALERT_TO);
  try {
    const info = await transporter.sendMail({
      from: `"Guerrero AI" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_ALERT_TO,
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
    console.log('✅ Email enviado! ID:', info.messageId);
  } catch (err) {
    console.error('❌ Email FAILED:', err.message);
    console.error('❌ Full error:', JSON.stringify(err, null, 2));
  }
};

const testEmail = async (req, res) => {
  console.log('🧪 Test email iniciado...');
  try {
    const info = await transporter.sendMail({
      from: `"Guerrero AI" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_ALERT_TO,
      subject: '✅ Guerrero AI — Test',
      text: 'Email funcionando correctamente.'
    });
    console.log('✅ Test email enviado! ID:', info.messageId);
    res.json({ success: true, message: 'Email enviado a ' + process.env.EMAIL_ALERT_TO });
  } catch (err) {
    console.error('❌ Test FAILED:', err.message);
    res.status(500).json({ error: err.message });
  }
};

module.exports = { sendLeadAlert, testEmail };