require('dotenv').config();

const express = require('express');
const cors = require('cors');
const promClient = require('prom-client');

const { initDB } = require('./db');

const app = express();

// Prometheus metrics
const register = promClient.register;
promClient.collectDefaultMetrics({ prefix: 'plask_', register });

const httpRequestDuration = new promClient.Histogram({
  name: 'plask_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

const httpRequestTotal = new promClient.Counter({
  name: 'plask_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route?.path || req.path;
    end({ method: req.method, route, status_code: res.statusCode });
    httpRequestTotal.inc({ method: req.method, route, status_code: res.statusCode });
  });
  next();
});

app.use(cors());
app.use(express.json());

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Routes
app.use('/health',         require('./routes/health'));
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/products',   require('./routes/products'));
app.use('/api/orders',     require('./middlewares/auth'), require('./routes/orders'));
app.use('/api/my',         require('./middlewares/auth'), require('./routes/my'));
app.use('/api/admin',      require('./middlewares/auth'), require('./middlewares/admin'), require('./routes/admin'));

const PORT = parseInt(process.env.PORT || '3002', 10);

const start = async () => {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`Backend listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('[STARTUP ERROR]', err);
    process.exit(1);
  }
};

start();
