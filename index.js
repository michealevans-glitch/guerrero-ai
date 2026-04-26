// Monitor de leads sin atender — cada minuto
const { send3MinuteAlert } = require('./controllers/emailController');
setInterval(async () => {
  try {
    const { Pool } = require('pg');
    const pool = require('./config/database');
    const now = new Date();
    const crHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Costa_Rica', hour: 'numeric', hour12: false }).format(now));
    if (crHour < 8 || crHour >= 19) return;

    const result = await pool.query(`
      SELECT * FROM leads 
      WHERE status = 'New' 
      AND EXTRACT(EPOCH FROM (NOW() - created_at)) > 180
      AND EXTRACT(EPOCH FROM (NOW() - created_at)) < 240
    `);

    for (const lead of result.rows) {
      await send3MinuteAlert(lead);
      console.log(`🚨 3min alert sent for lead ${lead.id}`);
    }
  } catch (err) {
    console.error('❌ Monitor error:', err.message);
  }
}, 60000);