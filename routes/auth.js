const express = require('express');
const router = express.Router();
const { login, verifyToken, requireAdmin, getUsers, createUser, changePassword, deactivateUser } = require('../controllers/authController');

router.post('/login', login);
router.get('/users', verifyToken, requireAdmin, getUsers);
router.post('/users', verifyToken, requireAdmin, createUser);
router.post('/change-password', verifyToken, requireAdmin, changePassword);
router.delete('/users/:username', verifyToken, requireAdmin, deactivateUser);

module.exports = router;