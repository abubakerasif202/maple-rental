import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { initializeDB } from './db/index.js';

// Route Imports
import authRoutes from './routes/auth.js';
import carRoutes from './routes/cars.js';
import applicationRoutes from './routes/applications.js';
import stripeRoutes from './routes/stripe.js';
import rentalRoutes from './routes/rentals.js';
import agreementRoutes from './routes/agreements.js';
import saasRoutes from './routes/saas.js';
import financialRoutes from './routes/financials.js';
import webhookRoutes from './routes/webhooks.js';

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const shouldListen = process.env.VITEST !== 'true';
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const frontendDistDir = path.resolve(process.cwd(), 'dist');
const frontendIndexPath = path.join(frontendDistDir, 'index.html');

// CORS Configuration
const toOrigin = (value?: string) => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const corsOrigins = [
  toOrigin(process.env.APP_URL),
  toOrigin(process.env.FRONTEND_URL),
  process.env.CORS_ORIGIN || null,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter((origin): origin is string => Boolean(origin));

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

// Webhooks (MUST be before express.json() for raw body)
app.use('/api/webhook', webhookRoutes);

// JSON Body Parser (with limit for image uploads)
app.use(express.json({ limit: '10mb' }));

// Database Initialization Middleware
let dbInitialized: Promise<void> | null = null;
const ensureDB = async () => {
  if (!dbInitialized) {
    dbInitialized = initializeDB();
  }
  return dbInitialized;
};

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
  });
});

app.use('/api', async (_req, res, next) => {
  try {
    await ensureDB();
    next();
  } catch (err) {
    console.error('Database initialization error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/cars', carRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/rentals', rentalRoutes);
app.use('/api/agreements', agreementRoutes);
app.use('/api/saas', saasRoutes);
app.use('/api/financials', financialRoutes);

// Legacy/Compatibility Redirects or Aliases
app.get('/api/stats', (_req, res) => res.redirect(307, '/api/financials/stats'));
app.get('/api/rental-plans', (_req, res) => res.redirect(307, '/api/stripe/rental-plans'));
app.post('/api/create-subscription', (_req, res) => res.redirect(307, '/api/stripe/create-subscription'));

// Server Startup
const startServer = async () => {
  await ensureDB();

  if (!isProduction) {
    const { ensureEsbuildBinaryPath } = await import('../scripts/ensureEsbuildBinaryPath.js');
    ensureEsbuildBinaryPath();
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(frontendDistDir, { index: false }));
    app.use((req, res, next) => {
      if (!['GET', 'HEAD'].includes(req.method) || req.path.startsWith('/api/')) {
        next();
        return;
      }

      res.sendFile(frontendIndexPath, (err) => {
        if (err) {
          next(err);
        }
      });
    });
  }

  if (shouldListen) {
    app.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT}`);
    });
  }
};

if (shouldListen) {
  startServer();
}

export default app;
