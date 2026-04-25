const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/leads', require('./routes/leads'));
app.use('/api/scraper', require('./routes/scraper'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ system: 'Guerrero AI', status: 'ONLINE' });
});

app.listen(PORT, () => {
  console.log(`⚔️  GUERRERO AI — ONLINE — port ${PORT}`);
  console.log(`🌐 http://localhost:${PORT}`);
});