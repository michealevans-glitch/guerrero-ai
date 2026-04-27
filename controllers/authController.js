const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'guerreroai_secret_2024';

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

    const result = await pool.query('SELECT * FROM users WHERE username = $1 AND active = true', [username.toLowerCase().trim()]);
    
    if (!result.rows[0]) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    
    const user = result.rows[0];
    const validPass = await bcrypt.compare(password, user.password_hash);
    if (!validPass) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({ success: true, token, user: { username: user.username, role: user.role, full_name: user.full_name } });
  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

const verifyToken = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requerido' });
  try {
    const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    req.user = decoded;
    next();
  } catch(e) {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Acceso denegado — Solo administradores' });
  next();
};

const getUsers = async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, role, full_name, active, last_login, created_at FROM users ORDER BY id');
    res.json(result.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
};

const createUser = async (req, res) => {
  try {
    const { username, password, role, full_name } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, role, full_name) VALUES ($1,$2,$3,$4) RETURNING id, username, role, full_name',
      [username.toLowerCase().trim(), hash, role || 'operador', full_name]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch(err) { res.status(500).json({ error: err.message }); }
};

const changePassword = async (req, res) => {
  try {
    const { username, new_password } = req.body;
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE username = $2', [hash, username]);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
};

const deactivateUser = async (req, res) => {
  try {
    await pool.query('UPDATE users SET active = false WHERE username = $1', [req.params.username]);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
};

module.exports = { login, verifyToken, requireAdmin, getUsers, createUser, changePassword, deactivateUser };