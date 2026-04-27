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
    const text = message.text?.body || message.type || 'Mensaje de WhatsApp';

    if (text.toUpperCase().includes('STOP')) {
      await pool.query(
        `UPDATE external_leads_pool SET excluded = true, excluded_reason = 'STOP request', status = 'excluded' WHERE phone LIKE $1`,
        [`%${phone.slice(-8)}%`]
      );
      await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: 'Ha sido removido de nuestra lista. No recibirá más mensajes.' } })
      });
      return res.sendStatus(200);
    }

    console.log(`📱 WhatsApp message from ${name} (${phone}): ${text}`);

    const existing = await pool.query(`SELECT id FROM leads WHERE phone LIKE $1 AND status = 'New' LIMIT 1`, [`%${phone.slice(-8)}%`]);
    if (existing.rows.length > 0) return res.sendStatus(200);

    const result = await pool.query(
      `INSERT INTO leads (contact_name, phone, service_type, source, notes, status)
       VALUES ($1,$2,'Consulta WhatsApp','whatsapp-api',$3,'New') RETURNING *`,
      [name, phone, text]
    );
    const lead = result.rows[0];
    await sendLeadAlert(lead);

    await pool.query(
      `INSERT INTO messages (lead_id, message_text, direction, sent_by, message_type)
       VALUES ($1,$2,'incoming',$3,'text')`,
      [lead.id, text, name]
    );

    await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: phone, type: 'text',
        text: { body: 'Gracias por contactar Albalumen. En un momento le atendemos. Para no recibir más mensajes responda STOP.' }
      })
    });

    console.log('✅ Lead creado desde WhatsApp y auto-respuesta enviada!');
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Webhook error:', err.message);
    res.sendStatus(500);
  }
});

module.exports = router;