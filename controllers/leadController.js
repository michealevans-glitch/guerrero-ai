const pool = require('../config/database');
const { sendLeadAlert } = require('./emailController');

const createLead = async (req, res) => {
  try {
    const { contact_name, phone, service_type, source, notes, registered_by } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone is required' });
    const result = await pool.query(`
      INSERT INTO leads (contact_name, phone, service_type, source, notes, status, registered_by)
      VALUES ($1, $2, $3, $4, $5, 'New', $6) RETURNING *
    `, [contact_name || 'No especificado', phone, service_type || 'Consulta General', source || 'manual', notes || null, registered_by || null]);
    const lead = result.rows[0];
    sendLeadAlert(lead);
    res.json(lead);
  } catch (err) {
    console.error('❌ Lead error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

const getActiveLeads = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *, EXTRACT(EPOCH FROM (NOW() - created_at)) as seconds_waiting
      FROM leads WHERE status = 'New' ORDER BY created_at ASC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const getRecentLeads = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM leads ORDER BY created_at DESC LIMIT 50');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const claimLead = async (req, res) => {
  try {
    const { id } = req.params;
    const { staff_name } = req.body;
    const result = await pool.query(`
      UPDATE leads SET status = 'In-Progress', claimed_by = $1, claimed_at = NOW(),
      time_to_respond_seconds = EXTRACT(EPOCH FROM (NOW() - created_at))
      WHERE id = $2 AND status = 'New' RETURNING *
    `, [staff_name, id]);
    if (!result.rows[0]) return res.status(400).json({ error: 'Lead already claimed' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const markLost = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason_lost, competitor_name, closed_by } = req.body;
    const result = await pool.query(`
      UPDATE leads SET status = 'Lost', reason_lost = $1, competitor_name = $2, lost_at = NOW(), closed_by = $3
      WHERE id = $4 RETURNING *
    `, [reason_lost, competitor_name || null, closed_by || null, id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const getMyLeads = async (req, res) => {
  try {
    const { staff_name } = req.query;
    const result = await pool.query(
      'SELECT * FROM leads WHERE claimed_by = $1 ORDER BY claimed_at DESC LIMIT 50',
      [staff_name]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { createLead, getActiveLeads, getRecentLeads, claimLead, markLost, getMyLeads };