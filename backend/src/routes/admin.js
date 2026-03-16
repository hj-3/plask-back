const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET /api/admin/products - list all products (including inactive)
router.get('/products', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, image_url, product_url,
              quantity, ordered_count, open_time, is_active, created_at
       FROM products
       ORDER BY created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// POST /api/admin/products - create product
router.post('/products', async (req, res) => {
  const { name, description, image_url, product_url, quantity, open_time } = req.body;

  if (!name || !quantity || !open_time) {
    return res.status(400).json({ success: false, message: '상품명, 수량, 오픈 시간은 필수입니다.' });
  }

  if (quantity < 1) {
    return res.status(400).json({ success: false, message: '수량은 1개 이상이어야 합니다.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO products (name, description, image_url, product_url, quantity, open_time)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, description || null, image_url || null, product_url || null, quantity, open_time]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// PUT /api/admin/products/:id - update product
router.put('/products/:id', async (req, res) => {
  const { name, description, image_url, product_url, quantity, open_time, is_active } = req.body;

  try {
    const existing = await pool.query('SELECT id FROM products WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
    }

    const result = await pool.query(
      `UPDATE products SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         image_url = COALESCE($3, image_url),
         product_url = COALESCE($4, product_url),
         quantity = COALESCE($5, quantity),
         open_time = COALESCE($6, open_time),
         is_active = COALESCE($7, is_active)
       WHERE id = $8
       RETURNING *`,
      [name, description, image_url, product_url, quantity, open_time, is_active, req.params.id]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// DELETE /api/admin/products/:id - delete product
router.delete('/products/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
    }
    res.json({ success: true, message: '상품이 삭제되었습니다.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// GET /api/admin/orders - list all orders
router.get('/orders', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.status, o.created_at,
              u.email, u.name as user_name,
              p.name as product_name
       FROM orders o
       JOIN users u ON u.id = o.user_id
       JOIN products p ON p.id = o.product_id
       ORDER BY o.created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
