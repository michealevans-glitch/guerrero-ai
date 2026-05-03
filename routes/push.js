// Guerrero AI — Push Notification Routes
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const webpush = require('web-push');

webpush.setVapidDetails(
  'mailto:michealevans@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Guardar suscripción del dispositivo
router.post('/subscribe', async (req, res) => {
  try {
    const { subscription, userName } = req.body;
    if (!subscription || !userName) return res.status(400).json({ error: 'Faltan datos' });
    const subStr = JSON.stringify(subscription);
    await pool.query(
      `INSERT INTO push_subscriptions (user_name, subscription, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_name, endpoint) DO UPDATE SET subscription = $2, created_at = NOW()`,
      [userName, subStr]
    );
    console.log(`✅ Push suscripción guardada para ${userName}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('❌ Push subscribe error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Mandar push a todos o a un usuario específico
async function sendPushToAll(payload, targetUser = null) {
  try {
    let query = 'SELECT * FROM push_subscriptions';
    let params = [];
    if (targetUser) {
      query += ' WHERE user_name = $1';
      params = [targetUser];
    }
    const result = await pool.query(query, params);
    const payloadStr = JSON.stringify(payload);
    for (const row of result.rows) {
      try {
        const sub = JSON.parse(row.subscription);
        await webpush.sendNotification(sub, payloadStr);
      } catch (e) {
        // Suscripción expirada — borrarla
        if (e.statusCode === 410 || e.statusCode === 404) {
          await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [row.id]);
          console.log(`🗑️ Suscripción expirada removida para ${row.user_name}`);
        } else {
          console.error(`❌ Push send error para ${row.user_name}:`, e.message);
        }
      }
    }
  } catch (e) {
    console.error('❌ sendPushToAll error:', e.message);
  }
}

module.exports = router;
module.exports.sendPushToAll = sendPushToAll;
