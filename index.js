const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/leads', require('./routes/leads'));
app.use('/api/scraper', require('./routes/scraper'));
app.use('/api/outreach', require('./routes/outreach'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ system: 'Guerrero AI', status: 'ONLINE' });
});

app.listen(PORT, () => {
  console.log(`⚔️  GUERRERO AI — ONLINE — port ${PORT}`);
  console.log(`🌐 http://localhost:${PORT}`);

  const { send3MinuteAlert } = require('./controllers/emailController');
  const pool = require('./config/database');

  setInterval(async () => {
    try {
      const now = new Date();
      const crHour = parseInt(new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Costa_Rica',
        hour: 'numeric',
        hour12: false
      }).format(now));
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
});