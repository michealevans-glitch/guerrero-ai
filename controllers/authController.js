const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database'); 
require('dotenv').config();

// 1. LOGIN LOGIC
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Wrong password' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ success: true, token, user: { name: user.name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// 2. GET ME (Current User Info)
const getMe = async (req, res) => {
    res.json({ success: true, user: req.user });
};

// 3. GET ALL USERS (Admin Only)
const getAllUsers = async (req, res) => {
    res.json({ message: "User list logic coming soon" });
};

// 4. CREATE USER
const createUser = async (req, res) => {
    res.json({ message: "Create user logic coming soon" });
};

// 5. DEACTIVATE USER
const deactivateUser = async (req, res) => {
    res.json({ message: "User deactivated" });
};

// EXPORT ALL FUNCTIONS
module.exports = { 
    login, 
    getMe, 
    getAllUsers, 
    createUser, 
    deactivateUser 
};