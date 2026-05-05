const express = require('express');
const router = express.Router();
const pool = require('../config/database');

router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === 'guerrero_ai_2024') {
    console.log('✅ Facebook Webhook verificado!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object !== 'page') return res.sendStatus(404);
    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        if (!event.message) continue;
        const isEcho = event.message.is_echo;
        const senderId = isEcho ? event.recipient.id : event.sender.id;
        const text = event.message.text || '';
        if (!text) continue;
        const direction = isEcho ? 'outgoing' : 'incoming';
        console.log(`📘 Facebook ${isEcho ? 'echo' : 'message'} from ${senderId}: ${text}`);
        const existing = await pool.query(
          `SELECT id FROM leads WHERE phone = $1 LIMIT 1`, [senderId]
        );
        if (existing.rows.length > 0) {
          await pool.query(
            `INSERT INTO messages (lead_id, message_text, body, direction, sent_by, message_type) VALUES ($1,$2,$2,$3,'Facebook','text')`,
            [existing.rows[0].id, text, direction]
          );
          await pool.query(`UPDATE leads SET updated_at = NOW() WHERE id = $1`, [existing.rows[0].id]);
        } else {
          if (isEcho) continue;
          const newLead = await pool.query(
            `INSERT INTO leads (contact_name, phone, service_type, source, notes, status) VALUES ($1,$2,'Consulta Facebook','facebook',$3,'New') RETURNING *`,
            ['Cliente Facebook', senderId, text]
          );
          await pool.query(
            `INSERT INTO messages (lead_id, message_text, body, direction, sent_by, message_type) VALUES ($1,$2,$2,'incoming','Facebook','text')`,
            [newLead.rows[0].id, text]
          );
        }
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Facebook webhook error:', err.message);
    res.sendStatus(500);
  }
});

module.exports = router;
