import express from 'express';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Stripe from 'stripe';
import crypto from 'crypto';
import db from './src/db/index.ts';

const app = express();
const PORT = 3000;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

const jwtSecretFromEnv = process.env.JWT_SECRET;
if (!jwtSecretFromEnv && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production.');
}
const JWT_SECRET = jwtSecretFromEnv || crypto.randomBytes(32).toString('hex');
if (!jwtSecretFromEnv) {
  console.warn('JWT_SECRET is not set. Using an in-memory generated secret for this process.');
}

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2025-02-24.acacia' as any })
  : null;

const CAR_STATUSES = ['Available', 'Rented', 'Maintenance'] as const;
const APPLICATION_STATUSES = ['Pending', 'Approved', 'Rejected'] as const;
const RENTAL_STATUSES = ['Active', 'Completed', 'Cancelled'] as const;

const isNonEmptyString = (value: unknown, maxLength = 500): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;

const toPositiveNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toPositiveInteger = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

// Auth Middleware
const authenticateAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const token = req.cookies.admin_token || bearerToken;
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

// Auth
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!isNonEmptyString(username, 120) || !isNonEmptyString(password, 256)) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const result = await db.execute({
    sql: 'SELECT * FROM admin WHERE username = ?',
    args: [username]
  });
  const admin = result.rows[0] as any;

  if (!admin || !bcrypt.compareSync(password, admin.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: Number(admin.id), username: admin.username }, JWT_SECRET, { expiresIn: '1d' });
  res.cookie('admin_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
  res.json({ token, username: admin.username });
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
  const parsedModelYear = toPositiveInteger(modelYear);
  const parsedWeeklyPrice = toPositiveNumber(weeklyPrice);
  const parsedBond = toPositiveNumber(bond);
  const parsedStatus = typeof status === 'string' ? status : 'Available';

  if (
    !isNonEmptyString(name, 180) ||
    !isNonEmptyString(image, 2000) ||
    !parsedModelYear ||
    !parsedWeeklyPrice ||
    !parsedBond ||
    !CAR_STATUSES.includes(parsedStatus as (typeof CAR_STATUSES)[number])
  ) {
    return res.status(400).json({ error: 'Invalid car payload.' });
  }

  const result = await db.execute({
    sql: 'INSERT INTO cars (name, modelYear, weeklyPrice, bond, status, image) VALUES (?, ?, ?, ?, ?, ?)',
    args: [name.trim(), parsedModelYear, parsedWeeklyPrice, parsedBond, parsedStatus, image.trim()]
  });
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

app.put('/api/cars/:id', authenticateAdmin, async (req, res) => {
  const { name, modelYear, weeklyPrice, bond, status, image } = req.body;
  const carId = toPositiveInteger(req.params.id);
  const parsedModelYear = toPositiveInteger(modelYear);
  const parsedWeeklyPrice = toPositiveNumber(weeklyPrice);
  const parsedBond = toPositiveNumber(bond);

  if (
    !carId ||
    !isNonEmptyString(name, 180) ||
    !isNonEmptyString(image, 2000) ||
    !parsedModelYear ||
    !parsedWeeklyPrice ||
    !parsedBond ||
    typeof status !== 'string' ||
    !CAR_STATUSES.includes(status as (typeof CAR_STATUSES)[number])
  ) {
    return res.status(400).json({ error: 'Invalid car payload.' });
  }

  const result = await db.execute({
    sql: 'UPDATE cars SET name = ?, modelYear = ?, weeklyPrice = ?, bond = ?, status = ?, image = ? WHERE id = ?',
    args: [name.trim(), parsedModelYear, parsedWeeklyPrice, parsedBond, status, image.trim(), carId]
  });
  if (result.rowsAffected === 0) return res.status(404).json({ error: 'Car not found' });
  return res.json({ success: true });
});

app.delete('/api/cars/:id', authenticateAdmin, async (req, res) => {
  const carId = toPositiveInteger(req.params.id);
  if (!carId) return res.status(400).json({ error: 'Invalid car id.' });
  const result = await db.execute({
    sql: 'DELETE FROM cars WHERE id = ?',
    args: [carId]
  });
  if (result.rowsAffected === 0) return res.status(404).json({ error: 'Car not found' });
  return res.json({ success: true });
});

// Applications
app.get('/api/applications', authenticateAdmin, async (req, res) => {
  const result = await db.execute('SELECT * FROM applications ORDER BY createdAt DESC');
  res.json(result.rows);
});

app.put('/api/applications/:id/status', authenticateAdmin, async (req, res) => {
  const { status } = req.body;
  const applicationId = toPositiveInteger(req.params.id);
  if (
    !applicationId ||
    typeof status !== 'string' ||
    !APPLICATION_STATUSES.includes(status as (typeof APPLICATION_STATUSES)[number])
  ) {
    return res.status(400).json({ error: 'Invalid application status update.' });
  }

  const result = await db.execute({
    sql: 'UPDATE applications SET status = ? WHERE id = ?',
    args: [status, applicationId]
  });
  if (result.rowsAffected === 0) return res.status(404).json({ error: 'Application not found' });
  return res.json({ success: true });
});

// Create Application
app.post('/api/applications', async (req, res) => {
  const { 
    name, phone, email, licenseNumber, licenseExpiry, 
    uberStatus, experience, address, weeklyBudget, 
    intendedStartDate, licensePhoto, uberScreenshot 
  } = req.body;

  if (
    !isNonEmptyString(name, 180) ||
    !isNonEmptyString(phone, 40) ||
    !isNonEmptyString(email, 320) ||
    !isNonEmptyString(licenseNumber, 80) ||
    !isNonEmptyString(address, 300) ||
    !isNonEmptyString(uberStatus, 80)
  ) {
    return res.status(400).json({ error: 'Missing required application fields.' });
  }

  try {
    const result = await db.execute({
      sql: `INSERT INTO applications (
        name, phone, email, licenseNumber, licenseExpiry, 
        uberStatus, experience, address, weeklyBudget, 
        intendedStartDate, licensePhoto, uberScreenshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        name.trim(),
        phone.trim(),
        email.trim(),
        licenseNumber.trim(),
        typeof licenseExpiry === 'string' ? licenseExpiry : null,
        uberStatus.trim(),
        typeof experience === 'string' ? experience : null,
        address.trim(),
        typeof weeklyBudget === 'string' ? weeklyBudget : null,
        typeof intendedStartDate === 'string' ? intendedStartDate : null,
        typeof licensePhoto === 'string' ? licensePhoto : null,
        typeof uberScreenshot === 'string' ? uberScreenshot : null
      ]
    });

    return res.json({ success: true, applicationId: Number(result.lastInsertRowid) });
  } catch (error: any) {
    console.error('Application error:', error);
    return res.status(500).json({ error: 'Application submission failed' });
  }
});

// Rentals
app.get('/api/rentals', authenticateAdmin, async (req, res) => {
  const result = await db.execute(`
    SELECT r.*, a.name as driverName, c.name as carName 
    FROM rentals r 
    JOIN applications a ON r.applicationId = a.id
    JOIN cars c ON r.carId = c.id
    ORDER BY r.createdAt DESC
  `);
  res.json(result.rows);
});

app.post('/api/rentals', authenticateAdmin, async (req, res) => {
  const { applicationId, carId, startDate, weeklyPrice } = req.body;
  const parsedApplicationId = toPositiveInteger(applicationId);
  const parsedCarId = toPositiveInteger(carId);
  const parsedWeeklyPrice = toPositiveNumber(weeklyPrice);

  if (!parsedApplicationId || !parsedCarId || !parsedWeeklyPrice || !isNonEmptyString(startDate, 40)) {
    return res.status(400).json({ error: 'Invalid rental payload.' });
  }

  const appResult = await db.execute({
    sql: 'SELECT id FROM applications WHERE id = ?',
    args: [parsedApplicationId]
  });
  if (appResult.rows.length === 0) return res.status(404).json({ error: 'Application not found.' });

  const carResult = await db.execute({
    sql: 'SELECT id, status FROM cars WHERE id = ?',
    args: [parsedCarId]
  });
  const car = carResult.rows[0] as any;
  if (!car) return res.status(404).json({ error: 'Car not found.' });
  if (car.status !== 'Available') return res.status(409).json({ error: 'Car is not available.' });

  try {
    const batchResult = await db.batch([
      {
        sql: 'INSERT INTO rentals (applicationId, carId, startDate, weeklyPrice) VALUES (?, ?, ?, ?)',
        args: [parsedApplicationId, parsedCarId, startDate.trim(), parsedWeeklyPrice]
      },
      {
        sql: "UPDATE cars SET status = 'Rented' WHERE id = ?",
        args: [parsedCarId]
      }
    ]);
    return res.json({ success: true, rentalId: Number(batchResult[0].lastInsertRowid) });
  } catch (error: any) {
    console.error('Rental creation error:', error);
    return res.status(500).json({ error: 'Failed to create rental' });
  }
});

app.put('/api/rentals/:id/status', authenticateAdmin, async (req, res) => {
  const { status } = req.body;
  const rentalId = toPositiveInteger(req.params.id);
  if (
    !rentalId ||
    typeof status !== 'string' ||
    !RENTAL_STATUSES.includes(status as (typeof RENTAL_STATUSES)[number])
  ) {
    return res.status(400).json({ error: 'Invalid rental status update.' });
  }

  const rentalResult = await db.execute({
    sql: 'SELECT id, carId FROM rentals WHERE id = ?',
    args: [rentalId]
  });
  const rental = rentalResult.rows[0] as any;
  if (!rental) return res.status(404).json({ error: 'Rental not found.' });

  const batch = [
    {
      sql: 'UPDATE rentals SET status = ? WHERE id = ?',
      args: [status, rentalId]
    }
  ];

  if (status === 'Completed' || status === 'Cancelled') {
    batch.push({
      sql: "UPDATE cars SET status = 'Available' WHERE id = ?",
      args: [rental.carId]
    });
  } else if (status === 'Active') {
    batch.push({
      sql: "UPDATE cars SET status = 'Rented' WHERE id = ?",
      args: [rental.carId]
    });
  }

  await db.batch(batch);
  return res.json({ success: true });
});

// Bookings
app.post('/api/bookings', async (req, res) => {
  const { customerName, email, phone, licenseNumber, carId, startDate, endDate, totalPrice } = req.body;

  const parsedCarId = toPositiveInteger(carId);
  const parsedTotalPrice = toPositiveNumber(totalPrice);
  if (
    !isNonEmptyString(customerName, 180) ||
    !isNonEmptyString(email, 320) ||
    !isNonEmptyString(phone, 40) ||
    !isNonEmptyString(licenseNumber, 80) ||
    !parsedCarId ||
    !isNonEmptyString(startDate, 40) ||
    !isNonEmptyString(endDate, 40) ||
    !parsedTotalPrice
  ) {
    return res.status(400).json({ error: 'Invalid booking payload.' });
  }

  const carResult = await db.execute({
    sql: 'SELECT id, name, status FROM cars WHERE id = ?',
    args: [parsedCarId]
  });
  const car = carResult.rows[0] as any;
  if (!car) return res.status(404).json({ error: 'Car not found.' });
  if (car.status !== 'Available') return res.status(409).json({ error: 'Car is not available.' });
  if (!stripe) return res.status(503).json({ error: 'Payments are not configured.' });

  try {
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email.trim(),
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/cars/${parsedCarId}`,
      metadata: {
        carId: String(parsedCarId),
        customerName: customerName.trim(),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'aud',
            product_data: {
              name: `${car.name} booking`,
              description: `${startDate.trim()} to ${endDate.trim()}`,
            },
            unit_amount: Math.round(parsedTotalPrice * 100),
          },
        },
      ],
    });

    await db.execute({
      sql: `INSERT INTO bookings (
        carId, customerName, email, phone, licenseNumber, startDate, endDate, totalPrice, status, stripeSessionId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
      args: [
        parsedCarId,
        customerName.trim(),
        email.trim(),
        phone.trim(),
        licenseNumber.trim(),
        startDate.trim(),
        endDate.trim(),
        parsedTotalPrice,
        session.id
      ]
    });

    return res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Booking checkout error:', error);
    return res.status(500).json({ error: 'Failed to create checkout session.' });
  }
});

app.post('/api/bookings/verify-payment', async (req, res) => {
  const { sessionId } = req.body;
  if (!isNonEmptyString(sessionId, 200)) {
    return res.status(400).json({ error: 'Invalid session id.' });
  }
  if (!stripe) return res.status(503).json({ error: 'Payments are not configured.' });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return res.json({ success: false });
    }

    const bookingResult = await db.execute({
      sql: 'SELECT id, carId, status FROM bookings WHERE stripeSessionId = ?',
      args: [sessionId]
    });
    const booking = bookingResult.rows[0] as any;
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    await db.batch([
      {
        sql: "UPDATE bookings SET status = 'Paid' WHERE id = ?",
        args: [booking.id]
      },
      {
        sql: "UPDATE cars SET status = 'Rented' WHERE id = ?",
        args: [booking.carId]
      }
    ]);

    return res.json({ success: true, bookingId: Number(booking.id) });
  } catch (error) {
    console.error('Payment verification error:', error);
    return res.status(500).json({ error: 'Failed to verify payment.' });
  }
});

// Dashboard Stats
app.get('/api/stats', authenticateAdmin, async (req, res) => {
  const [apps, rentals, income] = await Promise.all([
    db.execute('SELECT COUNT(*) as count FROM applications'),
    db.execute("SELECT COUNT(*) as count FROM rentals WHERE status = 'Active'"),
    db.execute("SELECT SUM(weeklyPrice) as total FROM rentals WHERE status = 'Active'")
  ]);
  
  res.json({
    totalApplications: Number(apps.rows[0].count),
    activeRentals: Number(rentals.rows[0].count),
    totalWeeklyIncome: Number(income.rows[0].total) || 0
  });
});

export default app;

// --- Vite Middleware ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

if (!process.env.VERCEL) {
  startServer();
}
