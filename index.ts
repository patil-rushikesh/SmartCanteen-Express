import express, { Request, Response } from 'express';
import cors from 'cors';
import paymentWebhookRoutes from './modules/payment/routes.js';
import { apiRouter } from './routes/index.js';
import { apiRateLimit } from './middlewares/rate-limit.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { corsOrigins, env } from './utils/env.js';

const app = express();

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

app.use('/api/payments/webhooks', paymentWebhookRoutes);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(apiRateLimit);
app.use('/api', apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`[Server] Smart Canteen Backend running at http://localhost:${env.PORT}`);
});
