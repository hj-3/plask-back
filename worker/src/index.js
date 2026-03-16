require('dotenv').config();

const Redis = require('ioredis');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');

const QUEUE_NAME = process.env.QUEUE_NAME || 'order-queue';

// Redis 2: FIFO Order Queue
const redis = new Redis({
  host: process.env.QUEUE_REDIS_HOST || 'localhost',
  port: parseInt(process.env.QUEUE_REDIS_PORT || '6380', 10),
  retryStrategy: (times) => Math.min(times * 200, 5000),
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

redis.on('error', (err) => console.error('[Redis:Queue Error]', err.message));
pool.on('error', (err) => console.error('[DB Error]', err.message));

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

async function sendOrderConfirmationEmail(email, userName, productName) {
  if (!process.env.SMTP_USER) {
    console.log(`[Email] SMTP not configured. Skipping email to ${email}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: `"Plask" <${process.env.SMTP_FROM || 'noreply@plask.com'}>`,
      to: email,
      subject: `[Plask] 주문 완료 - ${productName}`,
      html: `
        <div style="font-family: 'Apple SD Gothic Neo', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #111; font-size: 28px; font-weight: 900; letter-spacing: -1px;">PLASK</h1>
          </div>
          <div style="background: #f9fafb; border-radius: 12px; padding: 32px; margin-bottom: 24px;">
            <h2 style="color: #111; font-size: 20px; font-weight: 700; margin-bottom: 8px;">주문이 완료되었습니다!</h2>
            <p style="color: #6b7280; font-size: 15px; line-height: 1.6; margin: 0;">
              안녕하세요, <strong style="color: #111;">${userName}</strong>님.<br>
              아래 상품 주문이 성공적으로 완료되었습니다.
            </p>
          </div>
          <div style="border: 2px solid #e5e7eb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <p style="color: #6b7280; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px;">주문 상품</p>
            <p style="color: #111; font-size: 18px; font-weight: 700; margin: 0;">${productName}</p>
          </div>
          <p style="color: #9ca3af; font-size: 13px; text-align: center; line-height: 1.6;">
            이 이메일은 자동 발송되었습니다.<br>
            문의사항이 있으시면 고객센터로 연락해 주세요.
          </p>
        </div>
      `,
    });
    console.log(`[Email] Sent order confirmation to ${email}`);
  } catch (err) {
    console.error(`[Email] Failed to send to ${email}:`, err.message);
  }
}

async function setOrderStatus(db, requestId, status, message) {
  await db.query(
    `UPDATE order_history
     SET status = $1, message = $2, processed_at = NOW()
     WHERE request_id = $3`,
    [status, message, requestId]
  );
}

async function processJob(job) {
  const { requestId, userId, productId, userEmail, userName } = job;
  console.log(`[JOB] requestId=${requestId} userId=${userId} productId=${productId}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock product row
    const productResult = await client.query(
      `SELECT id, name, quantity, ordered_count
       FROM products
       WHERE id = $1
       FOR UPDATE`,
      [productId]
    );

    if (productResult.rows.length === 0) {
      await client.query('ROLLBACK');
      await setOrderStatus(pool, requestId, 'FAILED', '존재하지 않는 상품입니다.');
      return;
    }

    const product = productResult.rows[0];

    // Check duplicate order
    const dupResult = await client.query(
      'SELECT id FROM orders WHERE user_id = $1 AND product_id = $2',
      [userId, productId]
    );
    if (dupResult.rows.length > 0) {
      await client.query('ROLLBACK');
      await setOrderStatus(pool, requestId, 'FAILED', '이미 주문한 상품입니다.');
      return;
    }

    // Check stock
    if (product.ordered_count >= product.quantity) {
      await client.query('ROLLBACK');
      await setOrderStatus(pool, requestId, 'FAILED', '품절된 상품입니다.');
      console.log(`[FAILED] requestId=${requestId} - sold out`);
      return;
    }

    // Insert order
    await client.query(
      'INSERT INTO orders (user_id, product_id, status) VALUES ($1, $2, $3)',
      [userId, productId, 'SUCCESS']
    );

    // Increment ordered_count
    await client.query(
      'UPDATE products SET ordered_count = ordered_count + 1 WHERE id = $1',
      [productId]
    );

    // Update order_history
    await client.query(
      `UPDATE order_history
       SET status = 'SUCCESS', message = '주문이 완료되었습니다.', processed_at = NOW()
       WHERE request_id = $1`,
      [requestId]
    );

    await client.query('COMMIT');
    console.log(`[SUCCESS] requestId=${requestId}`);

    // Send confirmation email
    if (userEmail) {
      await sendOrderConfirmationEmail(userEmail, userName || '고객', product.name);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`[ERROR] requestId=${requestId}`, err.message);
    await setOrderStatus(pool, requestId, 'FAILED', '처리 중 오류가 발생했습니다.');
  } finally {
    client.release();
  }
}

async function run() {
  console.log(`[Worker] Started. Queue: ${QUEUE_NAME}`);

  while (true) {
    try {
      // BLPOP from left (FIFO: jobs were pushed with RPUSH to right)
      const result = await redis.blpop(QUEUE_NAME, 0);
      if (!result) continue;

      const [, raw] = result;
      let job;
      try {
        job = JSON.parse(raw);
      } catch {
        console.error('[PARSE ERROR] invalid job payload:', raw);
        continue;
      }

      await processJob(job);
    } catch (err) {
      console.error('[WORKER LOOP ERROR]', err.message);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

run().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
