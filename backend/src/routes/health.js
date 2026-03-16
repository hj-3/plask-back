const { Router } = require('express');
const { pool } = require('../db');
const { sessionRedis, queueRedis } = require('../redis');

const router = Router();

router.get('/', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    await sessionRedis.ping();
    await queueRedis.ping();
    res.json({ status: 'ok', db: 'ok', session_redis: 'ok', queue_redis: 'ok' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
