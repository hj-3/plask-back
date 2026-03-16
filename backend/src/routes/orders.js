const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');
const { queueRedis, QUEUE_NAME } = require('../redis');

const router = express.Router();

// POST /api/orders - place order (pushed to FIFO queue)
router.post('/', async (req, res) => {
  const userId = req.user.userId;
  const { product_id } = req.body;

  if (!product_id) {
    return res.status(400).json({ success: false, message: 'product_id는 필수입니다.' });
  }

  try {
    // Check product exists and is open
    const productResult = await pool.query(
      'SELECT id, name, quantity, ordered_count, open_time, is_active FROM products WHERE id = $1',
      [product_id]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
    }

    const product = productResult.rows[0];

    if (!product.is_active) {
      return res.status(400).json({ success: false, message: '비활성화된 상품입니다.' });
    }

    const now = new Date();
    const openTime = new Date(product.open_time);
    if (now < openTime) {
      return res.status(400).json({
        success: false,
        message: '아직 주문 오픈 시간이 아닙니다.',
        open_time: product.open_time,
      });
    }

    if (product.ordered_count >= product.quantity) {
      return res.status(400).json({ success: false, message: '품절된 상품입니다.' });
    }

    // Check already ordered
    const existingOrder = await pool.query(
      'SELECT id FROM orders WHERE user_id = $1 AND product_id = $2',
      [userId, product_id]
    );
    if (existingOrder.rows.length > 0) {
      return res.status(409).json({ success: false, message: '이미 주문한 상품입니다.' });
    }

    // Check already in queue
    const pendingResult = await pool.query(
      `SELECT request_id FROM order_history
       WHERE user_id = $1 AND product_id = $2 AND status = 'PENDING'`,
      [userId, product_id]
    );
    if (pendingResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: '이미 처리 중인 주문이 있습니다.',
        request_id: pendingResult.rows[0].request_id,
      });
    }

    const requestId = uuidv4();

    // Save PENDING record
    await pool.query(
      `INSERT INTO order_history (request_id, user_id, product_id, status)
       VALUES ($1, $2, $3, 'PENDING')`,
      [requestId, userId, product_id]
    );

    // Push to FIFO queue (RPUSH = add to right, worker uses BLPOP from left)
    await queueRedis.rpush(QUEUE_NAME, JSON.stringify({
      requestId,
      userId,
      productId: product_id,
      userEmail: req.user.email,
      userName: req.user.name,
    }));

    const queueLength = await queueRedis.llen(QUEUE_NAME);

    res.status(202).json({
      success: true,
      message: '주문이 대기열에 등록되었습니다.',
      request_id: requestId,
      queue_position: queueLength,
    });
  } catch (err) {
    console.error('[Order error]', err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// GET /api/orders/status/:requestId - poll order status
router.get('/status/:requestId', async (req, res) => {
  const { requestId } = req.params;
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      `SELECT oh.request_id, oh.user_id, oh.product_id, oh.status, oh.message,
              oh.created_at, oh.processed_at, p.name as product_name
       FROM order_history oh
       LEFT JOIN products p ON p.id = oh.product_id
       WHERE oh.request_id = $1`,
      [requestId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '요청을 찾을 수 없습니다.' });
    }

    const row = result.rows[0];

    if (row.user_id !== userId) {
      return res.status(403).json({ success: false, message: '권한이 없습니다.' });
    }

    let queue_position = null;
    if (row.status === 'PENDING') {
      const queueLen = await queueRedis.llen(QUEUE_NAME);
      queue_position = queueLen;
    }

    res.json({ success: true, data: { ...row, queue_position } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
