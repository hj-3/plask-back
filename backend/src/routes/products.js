const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET /api/products - list all active products
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, image_url, product_url,
              quantity, ordered_count, open_time, is_active, created_at
       FROM products
       WHERE is_active = TRUE
       ORDER BY open_time ASC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// GET /api/products/:id - get single product
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, image_url, product_url,
              quantity, ordered_count, open_time, is_active, created_at
       FROM products
       WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
