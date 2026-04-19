import express, { Request, Response } from 'express';
import cors from 'cors';
import { Server } from 'node:http';
import paymentWebhookRoutes from './modules/payment/routes.js';
import { apiRouter } from './routes/index.js';
import { apiRateLimit } from './middlewares/rate-limit.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { corsOrigins, env } from './utils/env.js';

const resolveTrustProxy = (): boolean | number | string => {
  if (env.TRUST_PROXY === 'true') {
    return true;
  }

  if (env.TRUST_PROXY === 'false') {
    return false;
  }

  const parsedNumber = Number.parseInt(env.TRUST_PROXY, 10);
  if (Number.isFinite(parsedNumber)) {
    return parsedNumber;
  }

  return env.TRUST_PROXY;
};

export const createApp = () => {
  const app = express();
  app.set('trust proxy', resolveTrustProxy());
  app.disable('x-powered-by');

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

  return app;
};

export const startServer = (): Server => {
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`[Server] Smart Canteen Backend running at http://localhost:${env.PORT}`);
  });

  return server;
};

export const stopServer = async (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
