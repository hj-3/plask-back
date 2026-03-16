const Redis = require('ioredis');

// Redis 1: Session & Cache
const sessionRedis = new Redis({
  host: process.env.SESSION_REDIS_HOST || 'localhost',
  port: parseInt(process.env.SESSION_REDIS_PORT) || 6379,
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

sessionRedis.on('connect', () => console.log('[Redis:Session] 연결됨'));
sessionRedis.on('error', (err) => console.error('[Redis:Session] 오류:', err.message));

// Redis 2: FIFO Order Queue
const queueRedis = new Redis({
  host: process.env.QUEUE_REDIS_HOST || 'localhost',
  port: parseInt(process.env.QUEUE_REDIS_PORT) || 6380,
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

queueRedis.on('connect', () => console.log('[Redis:Queue] 연결됨'));
queueRedis.on('error', (err) => console.error('[Redis:Queue] 오류:', err.message));

const QUEUE_NAME = process.env.QUEUE_NAME || 'order-queue';
const SESSION_TTL = 60 * 60 * 24; // 24 hours

module.exports = { sessionRedis, queueRedis, QUEUE_NAME, SESSION_TTL };
