const sgMail = require('@sendgrid/mail');
const twilio = require('twilio');
require('dotenv').config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TWILIO_PHONE = process.env.TWILIO_PHONE;
const ALBALUMEN_PHONE = '+50685281312';
const HUELLITAS_PHONE = '+50670469290';

const sendWhatsAppAlert = async (message) => {
  try {
    await twilioClient.messages.create({
      from: `whatsapp:${TWILIO_PHONE}`,
      to: `whatsapp:${ALBALUMEN_PHONE}`,
      body: message
    });
    await twilioClient.messages.create({
      from: `whatsapp:${TWILIO_PHONE}`,
      to: `whatsapp:${HUELLITAS_PHONE}`,
      body: message
    });
    console.log('📱 WhatsApp alerts sent to both!');
  } catch (err) {
    console.error('❌ WhatsApp error:', err.message);
  }
};

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
    console.log('📧 Email alert sent!');
  } catch (err) {
    console.error('❌ SendGrid error:', err.message);
  }

  const waMsg = `⚔️ GUERRERO AI — NUEVO LEAD\n👤 ${lead.contact_name || 'Sin nombre'}\n📞 ${lead.phone}\n🎯 ${lead.service_type}\n📍 ${lead.source || 'manual'}\n⏰ ${new Date().toLocaleString('es-CR', {timeZone:'America/Costa_Rica'})}`;
  await sendWhatsAppAlert(waMsg);
};

const send3MinuteAlert = async (lead) => {
  const mins = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 60000);
  const msg = `🚨 ALERTA GUERRERO AI\nLead SIN ATENDER hace ${mins} minutos!\n👤 ${lead.contact_name || 'Sin nombre'}\n🎯 ${lead.service_type}\n📍 ${lead.source}\n⚠️ RESPONDER INMEDIATAMENTE`;

  try {
    await sgMail.send({
      to: process.env.EMAIL_ALERT_TO,
      from: process.env.EMAIL_USER,
      subject: `🚨 URGENTE — Lead sin atender ${mins} minutos`,
      html: `<div style="background:#ff0000;color:white;padding:20px;border-radius:10px;font-family:sans-serif;"><h1>🚨 LEAD SIN ATENDER</h1><p><strong>${mins} MINUTOS SIN RESPUESTA</strong></p><p>Cliente: ${lead.contact_name || 'Sin nombre'}</p><p>Servicio: ${lead.service_type}</p><p>Teléfono: ${lead.phone}</p></div>`
    });
    console.log('🚨 3min alert email sent!');
  } catch (err) {
    console.error('❌ 3min email error:', err.message);
  }

  await sendWhatsAppAlert(msg);
};

const testEmail = async (req, res) => {
  try {
    await sgMail.send({
      to: process.env.EMAIL_ALERT_TO,
      from: process.env.EMAIL_USER,
      subject: '✅ Guerrero AI — Test',
      text: 'Email funcionando correctamente.'
    });
    res.json({ success: true, message: 'Email enviado!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { sendLeadAlert, send3MinuteAlert, testEmail };