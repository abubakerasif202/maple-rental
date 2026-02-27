import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Stripe from 'stripe';
import { z } from 'zod';
import { db, initializeDB } from '../src/db/index.js';
import { ensureEsbuildBinaryPath } from '../scripts/ensureEsbuildBinaryPath.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Validation Schemas
const carSchema = z.object({
  name: z.string().min(1),
  modelYear: z.number().int().min(1900).max(new Date().getFullYear() + 1),
  weeklyPrice: z.number().positive(),
  bond: z.number().nonnegative(),
  status: z.enum(['Available', 'Rented', 'Maintenance']),
  image: z.string().url(),
});

const applicationSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email(),
  licenseNumber: z.string().min(5),
  licenseExpiry: z.string(),
  uberStatus: z.enum(['Active', 'Applying', 'Not Yet Registered']),
  experience: z.string().min(1),
  address: z.string().min(5),
  weeklyBudget: z.string().optional(),
  intendedStartDate: z.string(),
  licensePhoto: z.string().optional().nullable(),
  uberScreenshot: z.string().optional().nullable(),
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

app.use(cors());
app.use(cookieParser());
app.use(express.json());

let dbInitialized: Promise<void> | null = null;
const ensureDB = async () => {
  if (!dbInitialized) {
    dbInitialized = initializeDB();
  }
  return dbInitialized;
};

app.use(async (_req, res, next) => {
  try {
    await ensureDB();
    next();
  } catch (err) {
    console.error('Database initialization error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-secret-not-for-production');
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('CRITICAL: JWT_SECRET environment variable is missing in production!');
}

const authenticateAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.cookies.admin_token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as any).admin = decoded;
    next();
  } catch (err) {
    console.error('Authentication error:', err);
    res.status(401).json({ error: 'Invalid token' });
  }
};

app.post('/api/create-payment-intent', async (req, res) => {
  const { amount, currency = 'aud' } = req.body;
  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency,
      automatic_payment_methods: { enabled: true },
    });
    res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
  } catch (error: any) {
    console.error('Payment intent error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const result = await db.execute({
      sql: 'SELECT * FROM admin WHERE username = ?',
      args: [username],
    });
    const admin = result.rows[0];

    if (!admin || !(await bcrypt.compare(password, String(admin.password)))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '1d' });
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    res.json({ token, username: admin.username });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('admin_token');
  res.json({ message: 'Logged out' });
});

app.get('/api/auth/verify', authenticateAdmin, (req, res) => {
  res.json({ user: (req as any).admin });
});

app.get('/api/stats', authenticateAdmin, async (_req, res) => {
  try {
    const [applicationsCount, activeRentalsCount, activeIncome] = await Promise.all([
      db.execute('SELECT COUNT(*) as count FROM applications'),
      db.execute("SELECT COUNT(*) as count FROM rentals WHERE status = 'Active'"),
      db.execute("SELECT COALESCE(SUM(weeklyPrice), 0) as total FROM rentals WHERE status = 'Active'"),
    ]);

    res.json({
      totalApplications: Number(applicationsCount.rows[0]?.count || 0),
      activeRentals: Number(activeRentalsCount.rows[0]?.count || 0),
      totalWeeklyIncome: Number(activeIncome.rows[0]?.total || 0),
    });
  } catch (err) {
    console.error('Stats fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/cars', async (_req, res) => {
  const result = await db.execute('SELECT * FROM cars');
  res.json(result.rows);
});

app.get('/api/cars/:id', async (req, res) => {
  const result = await db.execute({
    sql: 'SELECT * FROM cars WHERE id = ?',
    args: [req.params.id],
  });
  const car = result.rows[0];
  if (!car) return res.status(404).json({ error: 'Car not found' });
  res.json(car);
});

app.post('/api/cars', authenticateAdmin, async (req, res) => {
  try {
    const data = carSchema.parse(req.body);
    const result = await db.execute({
      sql: 'INSERT INTO cars (name, modelYear, weeklyPrice, bond, status, image) VALUES (?, ?, ?, ?, ?, ?)',
      args: [data.name, data.modelYear, data.weeklyPrice, data.bond, data.status, data.image],
    });
    res.status(201).json({ id: String(result.lastInsertRowid) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    console.error('Car creation error:', err);
    res.status(500).json({ error: 'Failed to create car' });
  }
});

app.put('/api/cars/:id', authenticateAdmin, async (req, res) => {
  try {
    const data = carSchema.parse(req.body);
    await db.execute({
      sql: `UPDATE cars SET name = ?, modelYear = ?, weeklyPrice = ?, bond = ?, status = ?, image = ? WHERE id = ?`,
      args: [data.name, data.modelYear, data.weeklyPrice, data.bond, data.status, data.image, req.params.id],
    });
    res.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    console.error('Car update error:', err);
    res.status(500).json({ error: 'Failed to update car' });
  }
});

app.delete('/api/cars/:id', authenticateAdmin, async (req, res) => {
  try {
    await db.execute({
      sql: 'DELETE FROM cars WHERE id = ?',
      args: [req.params.id],
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete car' });
  }
});

app.get('/api/rentals', authenticateAdmin, async (_req, res) => {
  try {
    const result = await db.execute(`
      SELECT rentals.*, applications.name as applicantName, cars.name as carName
      FROM rentals
      LEFT JOIN applications ON applications.id = rentals.applicationId
      LEFT JOIN cars ON cars.id = rentals.carId
      ORDER BY rentals.createdAt DESC
    `);
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch rentals' });
  }
});

app.get('/api/applications', authenticateAdmin, async (_req, res) => {
  const result = await db.execute('SELECT * FROM applications ORDER BY createdAt DESC');
  res.json(result.rows);
});

app.post('/api/applications', async (req, res) => {
  try {
    const data = applicationSchema.parse(req.body);
    const result = await db.execute({
      sql: `INSERT INTO applications (
        name, phone, email, licenseNumber, licenseExpiry,
        uberStatus, experience, address, weeklyBudget,
        intendedStartDate, licensePhoto, uberScreenshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        data.name,
        data.phone,
        data.email,
        data.licenseNumber,
        data.licenseExpiry,
        data.uberStatus,
        data.experience,
        data.address,
        data.weeklyBudget || null,
        data.intendedStartDate,
        data.licensePhoto || null,
        data.uberScreenshot || null,
      ],
    });
    res.json({ success: true, applicationId: String(result.lastInsertRowid) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    console.error('Application submission error:', err);
    res.status(500).json({ error: 'Application submission failed' });
  }
});

app.put('/api/applications/:id/status', authenticateAdmin, async (req, res) => {
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  try {
    await db.execute({
      sql: 'UPDATE applications SET status = ? WHERE id = ?',
      args: [status, req.params.id],
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to update application status' });
  }
});

app.post('/api/bookings', async (req, res) => {
  const { carId, applicationId = null, startDate, endDate, totalAmount } = req.body;

  if (!carId || !startDate || !endDate || !totalAmount) {
    return res.status(400).json({ error: 'Missing booking fields' });
  }

  try {
    const result = await db.execute({
      sql: `INSERT INTO bookings (carId, applicationId, startDate, endDate, totalAmount, status)
            VALUES (?, ?, ?, ?, ?, 'pending')`,
      args: [carId, applicationId, startDate, endDate, totalAmount],
    });
    res.status(201).json({ success: true, bookingId: String(result.lastInsertRowid) });
  } catch {
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

app.post('/api/bookings/verify-payment', async (req, res) => {
  const { sessionId, paymentIntentId } = req.body;

  try {
    if (paymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      return res.json({ success: intent.status === 'succeeded', status: intent.status });
    }

    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      return res.json({
        success: session.payment_status === 'paid',
        status: session.payment_status,
      });
    }

    return res.status(400).json({ error: 'sessionId or paymentIntentId is required', success: false });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

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
    app.get('*', (_req, res) => {
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
