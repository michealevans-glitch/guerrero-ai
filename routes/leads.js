const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const leadController = require('../controllers/leadController');

// Usamos esta forma para evitar el error de "Undefined"
router.get('/', leadController.getActiveLeads || ((req,res) => res.json([])));
router.get('/recent', leadController.getRecentLeads || ((req,res) => res.json([])));
router.post('/new', leadController.createLead || ((req,res) => res.status(500).send("Error")));

// --- RUTAS DE RESPUESTAS RÁPIDAS ---
router.get('/quick-replies/:business/:user', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM quick_replies WHERE business = $1 AND (user_name = $2 OR user_name = 'system') ORDER BY id ASC",
      [req.params.business, decodeURIComponent(req.params.user)]
    );
    res.json(result.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.post('/quick-replies', async (req, res) => {
  try {
    const { business, user_name, reply_text } = req.body;
    await pool.query(
      'INSERT INTO quick_replies (business, user_name, reply_text) VALUES ($1,$2,$3)',
      [business, user_name, reply_text]
    );
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;