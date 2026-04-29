const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/scraper', require('./routes/scraper'));
app.use('/api/outreach', require('./routes/outreach'));
app.use('/api/webhook', require('./routes/webhook'));
app.use('/api/contacts', require('./routes/outreach'));
app.use('/api/contacts', require('./routes/contacts'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));
app.get('/api/health', (req, res) => res.json({ system: 'Guerrero AI', status: 'ONLINE', domain: 'guerreroai.com' }));

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`⚔️  GUERRERO AI — ONLINE — port ${PORT}`);
  console.log(`🌐 https://guerreroai.com`);

  const pool = require('./config/database');
  const bcrypt = require('bcryptjs');

  try {
    await pool.query('SELECT 1');
    console.log('✅ Database connected');

    const passwords = {
      oscar:   'Albalumen2024#',
      micheal: 'Guerrero2024#',
      soledad: 'Soledad2024',
      manuel:  'Manuel2024'
    };
    for (const [username, password] of Object.entries(passwords)) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        `INSERT INTO users (username, password_hash, role, full_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (username) DO UPDATE SET password_hash = $2`,
        [username, hash, username === 'oscar' || username === 'micheal' ? 'admin' : 'operador',
         username === 'oscar' ? 'Oscar Evans' : username === 'micheal' ? 'Micheal Evans' : username === 'soledad' ? 'Soledad' : 'Manuel']
      );
    }
    console.log('✅ Users initialized');
  } catch(e) {
    console.error('❌ DB error:', e.message);
  }

  const { send3MinuteAlert } = require('./controllers/emailController');
  const pool2 = require('./config/database');

  setInterval(async () => {
    try {
      const now = new Date();
      const crHour = parseInt(new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Costa_Rica', hour: 'numeric', hour12: false
      }).format(now));
      if (crHour < 8 || crHour >= 19) return;
      const result = await pool2.query(`
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