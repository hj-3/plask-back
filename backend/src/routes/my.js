const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET /api/my/orders - user's completed orders
router.get('/orders', async (req, res) => {
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      `SELECT o.id, o.status, o.created_at,
              p.id as product_id, p.name as product_name,
              p.image_url, p.product_url
       FROM orders o
       JOIN products p ON p.id = o.product_id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC`,
      [userId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// GET /api/my/history - order request history (PENDING, SUCCESS, FAILED)
router.get('/history', async (req, res) => {
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      `SELECT oh.request_id, oh.status, oh.message, oh.created_at, oh.processed_at,
              p.id as product_id, p.name as product_name, p.image_url
       FROM order_history oh
       LEFT JOIN products p ON p.id = oh.product_id
       WHERE oh.user_id = $1
       ORDER BY oh.created_at DESC`,
      [userId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
