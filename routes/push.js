const express = require('express');
const router = express.Router();
const pool = require('../config/database');

router.post('/subscribe', async (req, res) => {
  try {
    const { subscription, userName } = req.body;
    if (!subscription || !userName) return res.status(400).json({ error: 'Faltan datos' });
    await pool.query(
      `INSERT INTO push_subscriptions (user_name, subscription, endpoint, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_name, endpoint) DO UPDATE SET subscription = $2, created_at = NOW()`,
      [userName, JSON.stringify(subscription), subscription.endpoint]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function sendPushToAll(payload) {
  try {
    const webpush = require('web-push');
    webpush.setVapidDetails(
      'mailto:michealevans@gmail.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    const result = await pool.query('SELECT * FROM push_subscriptions');
    for (const row of result.rows) {
      try {
        await webpush.sendNotification(JSON.parse(row.subscription), JSON.stringify(payload));
      } catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [row.id]);
        }
      }
    }
  } catch (e) {
    console.error('sendPushToAll error:', e.message);
  }
}

module.exports = router;
module.exports.sendPushToAll = sendPushToAll;
