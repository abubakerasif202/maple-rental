import '../scripts/load-env.js';
import 'express-async-errors';

import http from 'node:http';
import path from 'node:path';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { ViteDevServer } from 'vite';
import { z } from 'zod';

import {
  checkDBHealth,
  getSupabaseAuthConfigurationIssues,
  getSupabaseConfigurationIssues,
  initializeDB,
} from './db/index.js';
import {
  closePostgresPool,
  hasDirectDatabaseConnection,
} from './db/postgres.js';
import { shouldServeSpaEntry } from './frontendRouting.js';
import { apiNotFoundHandler, errorHandler } from './middleware/errors.js';
import { requestContext, requestLogger } from './middleware/requestLogger.js';

import agreementRoutes from './routes/agreements.js';
import applicationRoutes from './routes/applications.js';
import authRoutes from './routes/auth.js';
import carRoutes from './routes/cars.js';
import customerRoutes from './routes/customers.js';
import financialRoutes from './routes/financials.js';
import indexNowAdminRoutes from './routes/indexNowAdmin.js';
import inquiryRoutes from './routes/inquiries.js';
import invoiceRoutes from './routes/invoices.js';
import rentalRoutes from './routes/rentals.js';
import stripeRoutes from './routes/stripe.js';
import webhookRoutes from './routes/webhooks.js';
import { buildContentSecurityPolicyDirectives } from './securityPolicy.js';
import { indexNowConfig } from './services/indexNow.js';
import { getPaymentProcessingMode } from './paymentProcessing.js';
import { verifyProductionSchemaContract } from './schemaContract.js';

const isVitest = process.env.VITEST === 'true';
const isProduction = process.env.NODE_ENV === 'production' && !isVitest;
const shouldListen = process.env.VITEST !== 'true';
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '100kb';
const DB_CHECK_TIMEOUT_MS = 8000;
const DB_HEALTH_CACHE_TTL_MS = isVitest ? 0 : 5000;
const frontendDistDir = path.resolve(process.cwd(), 'dist');
const frontendIndexPath = path.join(frontendDistDir, 'index.html');
const cspReportingEnabled = isProduction && process.env.CSP_REPORTING === 'true';
const cspReportUri =
  (process.env.CSP_REPORT_URI && process.env.CSP_REPORT_URI.trim()) ||
  '/api/csp-report';
const cspReportPath =
  cspReportUri.startsWith('http://') || cspReportUri.startsWith('https://')
    ? null
    : cspReportUri;

const appUrlSchema = z
  .string()
  .trim()
  .url('APP_URL must be a valid HTTP or HTTPS URL');

const adminEmailSchema = z
  .string()
  .trim()
  .email('ADMIN_EMAIL must be a valid email address');

const toOrigin = (value?: string) => {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const validateProductionEnv = () => {
  if (!isProduction) {
    return;
  }

  const missing = [
    'APP_URL',
    'ADMIN_EMAIL',
    'CHECKOUT_LINK_SECRET',
    'JWT_SECRET',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ].filter((key) => !process.env[key]?.trim());

  const invalid = Array.from(new Set([
    ...getSupabaseConfigurationIssues(),
    ...getSupabaseAuthConfigurationIssues(),
  ]));

  if (process.env.APP_URL) {
    const parsedAppUrl = appUrlSchema.safeParse(process.env.APP_URL);
    if (!parsedAppUrl.success) {
      invalid.push(parsedAppUrl.error.issues[0]?.message || 'APP_URL');
    }
  }

  if (process.env.ADMIN_EMAIL) {
    const parsedAdminEmail = adminEmailSchema.safeParse(process.env.ADMIN_EMAIL);
    if (!parsedAdminEmail.success) {
      invalid.push(parsedAdminEmail.error.issues[0]?.message || 'ADMIN_EMAIL');
    }
  }

  if (missing.length > 0 || invalid.length > 0) {
    const details = [...missing, ...invalid].join(', ');
    throw new Error(
      `Invalid production environment configuration: ${details}. ` +
        'Populate or correct the values in Render before deploy. See README and render.yaml.'
    );
  }
};

const validateProductionSchemaContract = async () => {
  if (!isProduction) {
    return;
  }

  try {
    await verifyProductionSchemaContract();
  } catch (error) {
    console.warn(
      'Production schema contract validation failed during startup; continuing with compatibility mode.',
      error
    );
  }
};

const logProductionConfigurationWarnings = () => {
  if (hasDirectDatabaseConnection()) {
    return;
  }

  console.warn(
    'SUPABASE_DB_URL or DATABASE_URL is not configured for a session-capable Postgres connection. ' +
      'Payment links and automatic Stripe activation will remain disabled until a direct connection ' +
      'or Supabase shared pooler session-mode URL on port 5432 is added.'
  );
};

const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.VITEST === 'true',
});

let dbInitialized: Promise<void> | null = null;
type DBHealthCheckResult = Awaited<ReturnType<typeof checkDBHealth>>;
type DBHealthCheckState =
  | { error: null; result: DBHealthCheckResult }
  | { error: Error; result: null };

let dbHealthCheckPromise: Promise<DBHealthCheckResult> | null = null;
let dbHealthCheckState: {
  expiresAt: number;
  value: DBHealthCheckState;
} | null = null;

const withTimeout = async <T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  errorMessage: string
) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
        timeoutId.unref?.();
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const runDBHealthCheck = async () => {
  const now = Date.now();
  if (dbHealthCheckState && dbHealthCheckState.expiresAt > now) {
    if (dbHealthCheckState.value.error) {
      throw dbHealthCheckState.value.error;
    }

    return dbHealthCheckState.value.result;
  }

  if (!dbHealthCheckPromise) {
    dbHealthCheckPromise = withTimeout(
      () => checkDBHealth(),
      DB_CHECK_TIMEOUT_MS,
      `Database health check timed out after ${DB_CHECK_TIMEOUT_MS}ms`
    )
      .then((result) => {
        dbHealthCheckState = {
          expiresAt: Date.now() + DB_HEALTH_CACHE_TTL_MS,
          value: {
            error: null,
            result,
          },
        };
        return result;
      })
      .catch((error: unknown) => {
        const resolvedError =
          error instanceof Error ? error : new Error('Database health check failed');
        dbHealthCheckState = {
          expiresAt: Date.now() + DB_HEALTH_CACHE_TTL_MS,
          value: {
            error: resolvedError,
            result: null,
          },
        };
        throw resolvedError;
      })
      .finally(() => {
        dbHealthCheckPromise = null;
      });
  }

  return dbHealthCheckPromise;
};

const ensureDB = async () => {
  if (!dbInitialized) {
    dbInitialized = withTimeout(
      () => initializeDB(),
      DB_CHECK_TIMEOUT_MS,
      `Database initialization timed out after ${DB_CHECK_TIMEOUT_MS}ms`
    ).catch((error) => {
      dbInitialized = null;
      throw error;
    });
  }

  return dbInitialized;
};

const buildCorsOrigins = () =>
  [
    toOrigin(process.env.APP_URL),
    toOrigin(process.env.FRONTEND_URL),
    process.env.CORS_ORIGIN || null,
    ...(!isProduction
      ? [
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'http://localhost:4173',
          'http://127.0.0.1:4173',
          'http://localhost:5173',
          'http://127.0.0.1:5173',
        ]
      : []),
  ].filter((origin): origin is string => Boolean(origin));

const applySecurityMiddleware = (app: express.Express) => {
  app.disable('x-powered-by');

  if (isProduction) {
    // Render terminates TLS before proxying traffic to the Node process.
    app.set('trust proxy', 1);
  }

  if (isProduction) {
    app.use(
      helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        contentSecurityPolicy: {
          useDefaults: false,
          directives: buildContentSecurityPolicyDirectives({
            cspReportUri,
            cspReportingEnabled,
            supabaseUrl: process.env.SUPABASE_URL,
          }),
        },
      })
    );
  }

  const corsOrigins = buildCorsOrigins();
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
      credentials: true,
    })
  );

  app.use(cookieParser());
  app.use(requestContext);
  app.use(requestLogger);
};

const registerCoreRoutes = (app: express.Express) => {
  app.get(`/${indexNowConfig.key}.txt`, (_req, res) => {
    res.type('text/plain').send(indexNowConfig.key);
  });

  app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), webhookRoutes);

  if (cspReportingEnabled && cspReportPath) {
    app.post(
      cspReportPath,
      express.json({
        type: [
          'application/csp-report',
          'application/csp-report+json',
          'application/json',
        ],
        limit: '10kb',
      }),
      (req, res) => {
        console.warn('CSP report received:', JSON.stringify(req.body));
        res.status(204).end();
      }
    );
  }

  app.get('/api/health', async (_req, res) => {
    try {
      const { configured } = await runDBHealthCheck();

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        status: 'ok',
        environment: process.env.NODE_ENV || 'development',
        database: configured ? 'ok' : 'not_configured',
        paymentActivationMode: getPaymentProcessingMode(),
      });
    } catch (error) {
      console.error('Healthcheck error:', error);
      res.setHeader('Cache-Control', 'no-store');
      res.status(503).json({
        status: 'error',
        environment: process.env.NODE_ENV || 'development',
        database: 'unavailable',
        paymentActivationMode: getPaymentProcessingMode(),
      });
    }
  });

  app.use('/api', rateLimiter);
  app.use('/api', async (_req, _res, next) => {
    try {
      await ensureDB();
      next();
    } catch (error) {
      next(
        Object.assign(new Error('Database initialization failed'), {
          status: 503,
          cause: error,
        })
      );
    }
  });

  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: JSON_BODY_LIMIT }));

  app.use('/api/auth', authRoutes);
  app.use('/api/cars', carRoutes);
  app.use('/api/applications', applicationRoutes);
  app.use('/api/inquiries', inquiryRoutes);
  app.use('/api/stripe', stripeRoutes);
  app.use('/api/rentals', rentalRoutes);
  app.use('/api/agreements', agreementRoutes);
  app.use('/api/financials', financialRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/invoices', invoiceRoutes);
  app.use('/admin', indexNowAdminRoutes);

  app.get('/api/stats', (_req, res) =>
    res.redirect(307, '/api/financials/stats')
  );
  app.get('/api/rental-plans', (_req, res) =>
    res.redirect(307, '/api/stripe/rental-plans')
  );

  app.use(apiNotFoundHandler);
};

const registerProductionFrontend = (app: express.Express) => {
  app.use(
    express.static(frontendDistDir, {
      index: false,
      dotfiles: 'ignore',
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader(
            'Cache-Control',
            'public, max-age=31536000, immutable'
          );
          return;
        }

        res.setHeader('Cache-Control', 'public, max-age=3600');
      },
    })
  );

  app.use((req, res, next) => {
    if (!shouldServeSpaEntry(req)) {
      next();
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(frontendIndexPath, (error) => {
      if (error) {
        next(error);
      }
    });
  });
};

const registerDevelopmentFrontend = async (app: express.Express) => {
  const { ensureEsbuildBinaryPath } = await import(
    '../scripts/ensureEsbuildBinaryPath.js'
  );
  ensureEsbuildBinaryPath();

  const { createServer: createViteServer } = await import('vite');
  const viteServer = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(viteServer.middlewares);
  return viteServer;
};

export const createApp = () => {
  const app = express();
  applySecurityMiddleware(app);
  registerCoreRoutes(app);
  return app;
};

const app = createApp();

const closeHttpServer = (server: http.Server) =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

type RunningResources = {
  server: http.Server | null;
  viteServer: ViteDevServer | null;
};

export const startServer = async (): Promise<RunningResources> => {
  validateProductionEnv();
  await validateProductionSchemaContract();
  logProductionConfigurationWarnings();

  let viteServer: ViteDevServer | null = null;
  if (isProduction) {
    registerProductionFrontend(app);
  } else {
    viteServer = await registerDevelopmentFrontend(app);
  }

  app.use(errorHandler);

  if (!shouldListen) {
    return { server: null, viteServer };
  }

  const server = await new Promise<http.Server>((resolve, reject) => {
    const createdServer = app.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT}`);
      resolve(createdServer);
    });

    createdServer.on('error', reject);
  });

  // Render only needs the port to open quickly; keep DB warmup asynchronous and
  // surface readiness through the healthcheck and API middleware instead.
  void ensureDB().catch((error) => {
    console.error('Database warmup failed:', error);
  });

  return { server, viteServer };
};

let runningResources: RunningResources | null = null;
let shutdownPromise: Promise<void> | null = null;

const shutdown = async (reason: string, error?: unknown) => {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    if (error) {
      console.error(`Shutting down after ${reason}:`, error);
    } else {
      console.info(`Received ${reason}. Shutting down gracefully...`);
    }

    const resources = runningResources;
    const tasks: Promise<unknown>[] = [closePostgresPool()];

    if (resources?.viteServer) {
      tasks.push(resources.viteServer.close());
    }

    if (resources?.server) {
      tasks.push(closeHttpServer(resources.server));
    }

    await Promise.allSettled(tasks);
  })();

  return shutdownPromise;
};

if (shouldListen) {
  const exitAfterShutdown = (code: number) => () => {
    void shutdown(code === 0 ? 'signal' : 'process error').finally(() =>
      process.exit(code)
    );
  };

  process.on('SIGTERM', exitAfterShutdown(0));
  process.on('SIGINT', exitAfterShutdown(0));
  process.on('unhandledRejection', (reason) => {
    void shutdown('unhandledRejection', reason).finally(() => process.exit(1));
  });
  process.on('uncaughtException', (error) => {
    void shutdown('uncaughtException', error).finally(() => process.exit(1));
  });

  void startServer()
    .then((resources) => {
      runningResources = resources;
    })
    .catch((error) => {
      console.error('Server startup error:', error);
      void shutdown('startup failure', error).finally(() => process.exit(1));
    });
}

export default app;
