const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { sendLeadAlert } = require('../controllers/emailController');

router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('✅ WhatsApp Webhook verificado!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

router.post('/whatsapp', async (req, res) => {
  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return res.sendStatus(404);

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
    const contact = change?.value?.contacts?.[0];

    if (!message) return res.sendStatus(200);

    const phone = message.from;
    const name = contact?.profile?.name || 'Cliente WhatsApp';
    const text = message.text?.body || 'Mensaje de WhatsApp';

    console.log(`📱 WhatsApp message from ${name}: ${text}`);

    const result = await pool.query(`
      INSERT INTO leads (contact_name, phone, service_type, source, notes, status)
      VALUES ($1, $2, $3, $4, $5, 'New')
      RETURNING *
    `, [name, phone, 'Consulta WhatsApp', 'whatsapp-api', text]);

    const lead = result.rows[0];
    await sendLeadAlert(lead);

    // Auto-respuesta al cliente
    await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: 'Gracias por contactar Albalumen. En un momento le atendemos. Para no recibir más mensajes responda STOP.' }
      })
    });

    console.log('✅ Lead creado y auto-respuesta enviada!');
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Webhook error:', err.message);
    res.sendStatus(500);
  }
});

module.exports = router;