import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRouter from './routes/auth.js';
import vehiclesRouter from './routes/vehicles.js';
import applicationsRouter from './routes/applications.js';
import billingRouter from './routes/billing.js';
import adminRouter from './routes/admin.js';
import webhookRouter from './routes/webhook.js';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import {
  getSystemHealth,
  warmSystemHealth,
} from './services/systemHealthService.js';

const allowedOrigins = [
  env.CLIENT_URL,
  env.APP_URL,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

export const createServer = () => {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
    }),
  );
  app.use(helmet());

  app.get('/api/health', (_request, response) => {
    const system = warmSystemHealth();

    response.status(200).json({
      status: system.pending ? 'starting' : system.ok ? 'ok' : 'degraded',
      service: 'maple-rentals-v4-api',
      environment: env.NODE_ENV,
      checkedAt: system.checkedAt,
      durationMs: system.durationMs,
      dependenciesOk: !system.pending && system.ok,
      checks: system.checks,
    });
  });

  app.get('/api/ready', async (_request, response, next) => {
    try {
      const system = await getSystemHealth({
        allowStale: false,
        timeoutMs: 1_500,
      });

      response.status(system.ok ? 200 : 503).json({
        status: system.ok ? 'ok' : 'degraded',
        service: 'maple-rentals-v4-api',
        environment: env.NODE_ENV,
        checkedAt: system.checkedAt,
        durationMs: system.durationMs,
        checks: system.checks,
      });
    } catch (error) {
      next(error);
    }
  });

  app.use('/webhook', express.raw({ type: 'application/json' }), webhookRouter);
  app.use(express.json());

  app.use('/api/auth', authRouter);
  app.use('/api/apply', applicationsRouter);
  app.use('/api/vehicles', vehiclesRouter);
  app.use('/api', billingRouter);
  app.use('/api/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  warmSystemHealth();

  return app;
};
