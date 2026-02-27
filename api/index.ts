import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Stripe from 'stripe';
import { db, initializeDB } from '../src/db/index.js';
import { ensureEsbuildBinaryPath } from '../scripts/ensureEsbuildBinaryPath.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

// Middleware
app.use(cors());
app.use(cookieParser());
app.use(express.json());

// Database Initialization Middleware
let dbInitialized: Promise<void> | null = null;
const ensureDB = async () => {
  if (!dbInitialized) {
    dbInitialized = initializeDB();
  }
  return dbInitialized;
};

app.use(async (req, res, next) => {
  try {
    await ensureDB();
    next();
  } catch (err) {
    console.error('Database initialization error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-not-for-production';

// Auth Middleware
const authenticateAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.cookies.admin_token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as any).admin = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// --- API Routes ---

// Stripe
app.post('/api/create-payment-intent', async (req, res) => {
  const { amount, currency = 'aud' } = req.body;
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      automatic_payment_methods: { enabled: true },
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Auth
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const result = await db.execute({
      sql: 'SELECT * FROM admin WHERE username = ?',
      args: [username]
    });
    const admin = result.rows[0];

    if (!admin || !bcrypt.compareSync(password, String(admin.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '1d' });
    res.cookie('admin_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
    res.json({ token, username: admin.username });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ message: 'Logged out' });
});

app.get('/api/auth/verify', authenticateAdmin, (req, res) => {
  res.json({ user: (req as any).admin });
});

// Cars
app.get('/api/cars', async (req, res) => {
  const result = await db.execute('SELECT * FROM cars');
  res.json(result.rows);
});

app.get('/api/cars/:id', async (req, res) => {
  const result = await db.execute({
    sql: 'SELECT * FROM cars WHERE id = ?',
    args: [req.params.id]
  });
  const car = result.rows[0];
  if (!car) return res.status(404).json({ error: 'Car not found' });
  res.json(car);
});

app.post('/api/cars', authenticateAdmin, async (req, res) => {
  const { name, modelYear, weeklyPrice, bond, status, image } = req.body;
  try {
    const result = await db.execute({
      sql: `INSERT INTO cars (name, modelYear, weeklyPrice, bond, status, image) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [name, modelYear, weeklyPrice, bond, status, image]
    });
    res.status(201).json({ id: String(result.lastInsertRowid) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create car' });
  }
});

// ... (other routes similar to before, but using db singleton)

app.get('/api/applications', authenticateAdmin, async (req, res) => {
  const result = await db.execute('SELECT * FROM applications ORDER BY createdAt DESC');
  res.json(result.rows);
});

app.post('/api/applications', async (req, res) => {
  const { 
    name, phone, email, licenseNumber, licenseExpiry, 
    uberStatus, experience, address, weeklyBudget, 
    intendedStartDate, licensePhoto, uberScreenshot 
  } = req.body;

  try {
    const result = await db.execute({
      sql: `INSERT INTO applications (
        name, phone, email, licenseNumber, licenseExpiry, 
        uberStatus, experience, address, weeklyBudget, 
        intendedStartDate, licensePhoto, uberScreenshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        name, phone, email, licenseNumber, licenseExpiry, 
        uberStatus, experience, address, weeklyBudget, 
        intendedStartDate, licensePhoto, uberScreenshot
      ]
    });
    res.json({ success: true, applicationId: String(result.lastInsertRowid) });
  } catch (error: any) {
    res.status(500).json({ error: 'Application submission failed' });
  }
});

// --- Server Setup ---
const startServer = async () => {
  await ensureDB();

  if (process.env.NODE_ENV !== 'production') {
    ensureEsbuildBinaryPath();
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  if (process.env.VERCEL !== '1') {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
};

if (process.env.VERCEL !== '1') {
  startServer();
}

export default app;
