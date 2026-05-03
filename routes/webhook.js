const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { sendLeadAlert } = require('../controllers/emailController');

async function llamarEquipo(clienteName) {
  try {
    const hora = parseInt(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Costa_Rica', hour: 'numeric', hour12: false
    }).format(new Date()));
  // Alertar siempre — día y noche
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const numeros = ['+50685281312', '+50670147700'];
    const mensaje = `<Response><Say language="es-MX">Tienes un cliente nuevo en Guerrero AI. Por favor revisa la aplicación.</Say></Response>`;
    for (const numero of numeros) {
      await client.calls.create({
        twiml: mensaje,
        to: numero,
        from: process.env.TWILIO_PHONE
      });
    }
    console.log('📞 Llamadas enviadas al equipo');
  } catch (e) {
    console.error('llamarEquipo error:', e.message);
  }
}

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
let text = message.text?.body || '';
if (!text && message.type === 'audio') {
  text = await transcribirAudio(message.audio?.id);
}
if (!text) text = message.type || 'Mensaje de WhatsApp';
    if (text.toUpperCase().includes('STOP')) {
      await pool.query(`UPDATE external_leads_pool SET excluded = true, excluded_reason = 'STOP request', status = 'excluded' WHERE phone LIKE $1`, [`%${phone.slice(-8)}%`]);
      await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: 'Ha sido removido de nuestra lista. No recibirá más mensajes.' } })
      });
      return res.sendStatus(200);
    }
    console.log(`📱 WhatsApp message from ${name} (${phone}): ${text}`);
    const existing = await pool.query(`SELECT id FROM leads WHERE phone LIKE $1 AND status = 'New' LIMIT 1`, [`%${phone.slice(-8)}%`]);
    if (existing.rows.length > 0) {
      await pool.query(
        `INSERT INTO messages (lead_id, message_text, body, direction, sent_by, message_type) VALUES ($1,$2,$2,'incoming',$3,'text')`,
        [existing.rows[0].id, text, name]
      );
      await pool.query(`UPDATE leads SET updated_at = NOW() WHERE id = $1`, [existing.rows[0].id]);
      try { const { sendPushToAll } = require('./push'); await sendPushToAll({ title: '⚔️ ' + name, body: text, leadId: existing.rows[0].id, tag: 'lead-' + existing.rows[0].id }); } catch(e) {}
await llamarEquipo(name);
      await detectarPeticionLlamada(phone, text);
      return res.sendStatus(200);
    }
    const result = await pool.query(`INSERT INTO leads (contact_name, phone, service_type, source, notes, status) VALUES ($1,$2,'Consulta WhatsApp','whatsapp-api',$3,'New') RETURNING *`, [name, phone, text]);
    const lead = result.rows[0];
    await sendLeadAlert(lead);
    try { const { sendPushToAll } = require('./push'); await sendPushToAll({ title: '⚔️ NUEVO — ' + name, body: text, leadId: lead.id, tag: 'lead-' + lead.id }); } catch(e) {}
    await llamarEquipo(name);
    await detectarPeticionLlamada(phone, text);
    await pool.query(
      `INSERT INTO messages (lead_id, message_text, body, direction, sent_by, message_type) VALUES ($1,$2,$2,'incoming',$3,'text')`,
      [lead.id, text, name]
    );
    await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: 'Gracias por contactar Albalumen. En un momento le atendemos. Para no recibir más mensajes responda STOP.' } })
    });
    console.log('✅ Lead creado desde WhatsApp y auto-respuesta enviada!');
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Webhook error:', err.message);
    res.sendStatus(500);
  }
});
async function detectarPeticionLlamada(phone, text) {
  try {
    const palabrasSi = ['sí', 'si', 'yes', 'claro', 'ok', 'okay', 'adelante', 'puede', 'ahora'];
    const palabrasLlamar = ['llamar', 'llamada', 'hablar', 'teléfono', 'telefono', 'call', 'comunicarme', 'contactar'];
    
    // Si el cliente dice "sí" después de que le ofrecimos llamarle
    const quiereSi = palabrasSi.some(p => text.toLowerCase().trim() === p || text.toLowerCase().includes(p));
    const existing = await pool.query(
      `SELECT notes FROM leads WHERE phone LIKE $1 ORDER BY created_at DESC LIMIT 1`,
      [`%${phone.slice(-8)}%`]
    );
    const notes = existing.rows[0]?.notes || '';
    
    if (quiereSi && notes.includes('LLAMADA_OFRECIDA')) {
      // Llamar al cliente
      const twilio = require('twilio');
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.calls.create({
        twiml: `<Response><Say language="es-MX">Hola, le llamamos de Guerrero AI. Un agente le atenderá en un momento. Por favor espere.</Say></Response>`,
        to: '+' + phone,
        from: process.env.TWILIO_PHONE
      });
      await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: 'Estamos llamándole ahora. Por favor conteste su teléfono.' } })
      });
      await pool.query(`UPDATE leads SET notes = notes || ' LLAMADA_REALIZADA' WHERE phone LIKE $1`, [`%${phone.slice(-8)}%`]);
      console.log(`📞 Llamada realizada al cliente ${phone}`);
      return;
    }

    // Detectar si pide llamada
    const quiereLlamar = palabrasLlamar.some(p => text.toLowerCase().includes(p));
    if (!quiereLlamar) return;
    
    const respuesta = 'Entendemos que prefiere hablar con alguien. Un agente le llamará en los próximos minutos. ¿Es conveniente que le llamemos ahora?';
    await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: respuesta } })
    });
    await pool.query(`UPDATE leads SET notes = notes || ' LLAMADA_OFRECIDA' WHERE phone LIKE $1`, [`%${phone.slice(-8)}%`]);
    console.log(`📞 Cliente ${phone} pidió llamada — respuesta automática enviada`);
  } catch (e) {
    console.error('detectarPeticionLlamada error:', e.message);
  }
}
const https = require('https');
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', audioBlob, { 
      filename: 'audio.ogg', 
      contentType: 'audio/ogg',
      knownLength: audioBlob.length
    });
    form.append('model', 'whisper-1');
    
    const transcription = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.openai.com',
        path: '/v1/audio/transcriptions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          ...form.getHeaders()
        }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } 
          catch(e) { reject(e); }
        });
      });
      req.on('error', reject);
      form.pipe(req);
    });
    console.log(`🎤 Transcripción: ${transcription.text}`);
    return transcription.text || '[Mensaje de voz]';

module.exports = router;
