const express = require('express');
const router = express.Router();
const pool = require('../config/database');

router.post('/add', async (req, res) => {
  try {
    const { full_name, phone, email, address, source, business, notes, created_by } = req.body;
    if (!full_name || !phone) return res.status(400).json({ error: 'Nombre y teléfono requeridos' });
    await pool.query(
      `INSERT INTO contacts (full_name, phone, email, address, source, business, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [full_name, phone, email||null, address||null, source||null, business||'alba', notes||null, created_by||null]
    );
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.get('/list', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contacts ORDER BY full_name ASC');
    res.json(result.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;