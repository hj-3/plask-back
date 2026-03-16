const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { sessionRedis, SESSION_TTL } = require('../redis');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'plask-super-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ success: false, message: '이메일, 비밀번호, 이름을 모두 입력해주세요.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: '유효한 이메일 형식이 아닙니다.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, message: '비밀번호는 6자 이상이어야 합니다.' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: '이미 사용 중인 이메일입니다.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, is_admin',
      [email, hashedPassword, name]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    await sessionRedis.setex(
      `session:${user.id}`,
      SESSION_TTL,
      JSON.stringify({ email: user.email, name: user.name, isAdmin: user.is_admin })
    );

    res.status(201).json({
      success: true,
      message: '회원가입이 완료되었습니다.',
      token,
      user: { id: user.id, email: user.email, name: user.name, isAdmin: user.is_admin },
    });
  } catch (err) {
    console.error('[Register error]', err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: '이메일과 비밀번호를 입력해주세요.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, password_hash, name, is_admin FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ success: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    await sessionRedis.setex(
      `session:${user.id}`,
      SESSION_TTL,
      JSON.stringify({ email: user.email, name: user.name, isAdmin: user.is_admin })
    );

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, name: user.name, isAdmin: user.is_admin },
    });
  } catch (err) {
    console.error('[Login error]', err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const jwt_lib = require('jsonwebtoken');
      const payload = jwt_lib.verify(token, JWT_SECRET);
      await sessionRedis.del(`session:${payload.userId}`);
    } catch (_) {}
  }
  res.json({ success: true, message: '로그아웃되었습니다.' });
});

module.exports = router;
