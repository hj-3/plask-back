const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected client error', err);
});

const initDB = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name          VARCHAR(100) NOT NULL,
      is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id             SERIAL PRIMARY KEY,
      name           VARCHAR(255) NOT NULL,
      description    TEXT,
      image_url      VARCHAR(500),
      product_url    VARCHAR(500),
      quantity       INTEGER NOT NULL DEFAULT 0,
      ordered_count  INTEGER NOT NULL DEFAULT 0,
      open_time      TIMESTAMP NOT NULL,
      is_active      BOOLEAN NOT NULL DEFAULT TRUE,
      created_at     TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS orders (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      status     VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS order_history (
      request_id   VARCHAR(255) PRIMARY KEY,
      user_id      INTEGER NOT NULL,
      product_id   INTEGER NOT NULL,
      status       VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      message      TEXT,
      created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMP
    );
  `);

  // Create admin account
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@plask.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin1234';
  const adminName = process.env.ADMIN_NAME || '관리자';

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await pool.query(
      'INSERT INTO users (email, password_hash, name, is_admin) VALUES ($1, $2, $3, TRUE)',
      [adminEmail, hash, adminName]
    );
    console.log(`[DB] Admin account created: ${adminEmail}`);
  }

  console.log('[DB] 초기화 완료');
};

module.exports = { pool, initDB };
