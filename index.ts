import express, { Request, Response } from 'express';
import cors from 'cors';
import { prisma } from './lib/prisma.js';
import paymentWebhookRoutes from './modules/payment/routes.js';
import { apiRouter } from './routes/index.js';
import { apiRateLimit } from './middlewares/rate-limit.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { cacheReady, closeCache } from './services/shared/cache.service.js';
import { corsOrigins, env } from './utils/env.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', env.TRUST_PROXY_HOPS);
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    console.log(JSON.stringify({ type: 'http', method: req.method, path: req.path,
      status: res.statusCode, durationMs: Date.now() - started }));
  });
  next();
});

app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id'],
  credentials: true
}));

app.get('/', (_req: Request, res: Response) => {
  res.send('Smart Canteen Backend');
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV
  });
});

app.get('/api/ready', async (_req: Request, res: Response) => {
  try {
    await Promise.race([
      Promise.all([prisma.$queryRaw`SELECT 1`, cacheReady()]),
      new Promise((_, reject) => { const timeout = setTimeout(() => reject(new Error('Readiness timeout')), 3000); timeout.unref(); })
    ]);
    res.status(200).json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});

app.use('/api/payments/webhooks', paymentWebhookRoutes);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(apiRateLimit);
app.use('/api', apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  const address = server.address();
  if (process.send && address && typeof address !== 'string') process.send({ port: address.port });
  console.log(`[Server] Smart Canteen Backend running at http://localhost:${env.PORT}`);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    const timeout = setTimeout(() => process.exit(1), 25_000);
    timeout.unref();
    server.close(() => {
      void Promise.all([prisma.$disconnect(), closeCache()]).finally(() => process.exit(0));
    });
  });
}
