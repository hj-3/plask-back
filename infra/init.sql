-- Users table (email-based auth, admin flag)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(100) NOT NULL,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Products table (limited quantity items)
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

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  status     VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

-- Order request history (queue tracking)
CREATE TABLE IF NOT EXISTS order_history (
  request_id   VARCHAR(255) PRIMARY KEY,
  user_id      INTEGER NOT NULL,
  product_id   INTEGER NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  message      TEXT,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP
);
