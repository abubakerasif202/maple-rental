import express from 'express';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Stripe from 'stripe';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import db from './src/db/index.ts';
import { 
  LoginSchema, CarSchema, ApplicationSchema, ApplicationStatusSchema, 
  RentalSchema, RentalStatusSchema, BookingSchema,
  type Car, type Booking, type Admin, type Application, type Rental,
  CAR_STATUSES, APPLICATION_STATUSES, RENTAL_STATUSES
} from './src/types.ts';

const app = express();
const PORT = process.env.PORT || 3000;

// Rate Limiting for Auth
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login attempts per window
  message: { error: 'Too many login attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate Limiting for Applications
const applicationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 applications per hour
  message: { error: 'Too many applications submitted, please try again after an hour' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
const corsAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  credentials: true,
  origin: (origin, callback) => {
    // Allow server-to-server and same-origin requests with no Origin header.
    if (!origin) return callback(null, true);

    // Keep local development simple without opening production to all origins.
    if (process.env.NODE_ENV !== 'production') {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
    }

    if (corsAllowedOrigins.includes(origin)) return callback(null, true);

    return callback(new Error('CORS origin not allowed.'));
  }
}));
app.use(cookieParser());

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
  ? new Stripe(stripeSecretKey, { apiVersion: '2025-02-24.acacia' as Stripe.StripeConfig['apiVersion'] })
  : null;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const getDateDiffInDays = (startDateInput: string, endDateInput: string): number | null => {
  const startDate = new Date(startDateInput);
  const endDate = new Date(endDateInput);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  const diffMs = endDate.getTime() - startDate.getTime();
  if (diffMs <= 0) return null;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

const calculateBookingTotal = (weeklyPrice: number, startDate: string, endDate: string): number | null => {
  const days = getDateDiffInDays(startDate, endDate);
  if (!days) return null;
  const dailyRate = weeklyPrice / 7;
  const total = Number((dailyRate * days).toFixed(2));
  return total > 0 ? total : null;
};

const setAdminCookie = (res: express.Response, token: string) => {
  res.cookie('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
};

const clearAdminCookie = (res: express.Response) => {
  res.clearCookie('admin_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
};

const markBookingPaid = async (sessionId: string) => {
  const bookingResult = await db.execute({
    sql: 'SELECT id, carId, status FROM bookings WHERE stripeSessionId = ?',
    args: [sessionId]
  });
  const booking = bookingResult.rows[0] as unknown as Booking | undefined;
  if (!booking) return { found: false as const };

  if (booking.status !== 'Paid') {
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
  }

  return { found: true as const, bookingId: Number(booking.id) };
};

const releasePendingBookingReservation = async (sessionId: string) => {
  const bookingResult = await db.execute({
    sql: 'SELECT id, carId, status FROM bookings WHERE stripeSessionId = ?',
    args: [sessionId]
  });
  const booking = bookingResult.rows[0] as unknown as Booking | undefined;
  if (!booking) return;

  if (booking.status === 'Pending') {
    await db.batch([
      {
        sql: "UPDATE bookings SET status = 'Cancelled' WHERE id = ?",
        args: [booking.id]
      },
      {
        sql: "UPDATE cars SET status = 'Available' WHERE id = ?",
        args: [booking.carId]
      }
    ]);
  }
};

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !stripeWebhookSecret) {
    return res.status(503).json({ error: 'Stripe webhook is not configured.' });
  }

  const signature = req.headers['stripe-signature'];
  if (!signature || typeof signature !== 'string') {
    return res.status(400).json({ error: 'Missing Stripe signature.' });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, stripeWebhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    return res.status(400).json({ error: 'Invalid Stripe signature.' });
  }

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.id && session.payment_status === 'paid') {
        await markBookingPaid(session.id);
      }
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.id) {
        await releasePendingBookingReservation(session.id);
      }
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handling error:', err);
    return res.status(500).json({ error: 'Webhook handling failed.' });
  }
});

app.use(express.json({ limit: '10mb' }));

// Auth Middleware
const authenticateAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.cookies.admin_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Admin;
    req.admin = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// --- API Routes ---

// Auth
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const validation = LoginSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid input', details: validation.error.format() });
  }

  const { username, password } = validation.data;

  try {
    const result = await db.execute({
      sql: 'SELECT * FROM admin WHERE username = ?',
      args: [username]
    });
    const admin = result.rows[0] as unknown as Admin | undefined;

    if (!admin || !admin.password || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: Number(admin.id), username: admin.username }, JWT_SECRET, { expiresIn: '1d' });
    setAdminCookie(res, token);
    res.json({ username: admin.username });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  clearAdminCookie(res);
  res.json({ message: 'Logged out' });
});

app.get('/api/auth/verify', authenticateAdmin, (req, res) => {
  res.json({ user: req.admin });
});

// Cars
app.get('/api/cars', async (req, res) => {
  try {
    const result = await db.execute('SELECT * FROM cars');
    res.json(result.rows as unknown as Car[]);
  } catch (error) {
    console.error('Fetch cars error:', error);
    res.status(500).json({ error: 'Failed to fetch cars' });
  }
});

app.get('/api/cars/:id', async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM cars WHERE id = ?',
      args: [req.params.id]
    });
    const car = result.rows[0] as unknown as Car | undefined;
    if (!car) return res.status(404).json({ error: 'Car not found' });
    res.json(car);
  } catch (error) {
    console.error('Fetch car error:', error);
    res.status(500).json({ error: 'Failed to fetch car' });
  }
});

app.post('/api/cars', authenticateAdmin, async (req, res) => {
  const validation = CarSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid car data', details: validation.error.format() });
  }

  const { name, modelYear, weeklyPrice, bond, status, image } = validation.data;

  try {
    const result = await db.execute({
      sql: 'INSERT INTO cars (name, modelYear, weeklyPrice, bond, status, image) VALUES (?, ?, ?, ?, ?, ?)',
      args: [name.trim(), modelYear, weeklyPrice, bond, status, image.trim()]
    });
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  } catch (error) {
    console.error('Create car error:', error);
    res.status(500).json({ error: 'Failed to create car' });
  }
});

app.put('/api/cars/:id', authenticateAdmin, async (req, res) => {
  const carId = Number(req.params.id);
  if (isNaN(carId)) return res.status(400).json({ error: 'Invalid car ID' });

  const validation = CarSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid car data', details: validation.error.format() });
  }

  const { name, modelYear, weeklyPrice, bond, status, image } = validation.data;

  try {
    const result = await db.execute({
      sql: 'UPDATE cars SET name = ?, modelYear = ?, weeklyPrice = ?, bond = ?, status = ?, image = ? WHERE id = ?',
      args: [name.trim(), modelYear, weeklyPrice, bond, status, image.trim(), carId]
    });
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'Car not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Update car error:', error);
    res.status(500).json({ error: 'Failed to update car' });
  }
});

app.delete('/api/cars/:id', authenticateAdmin, async (req, res) => {
  const carId = Number(req.params.id);
  if (isNaN(carId)) return res.status(400).json({ error: 'Invalid car ID' });

  try {
    const result = await db.execute({
      sql: 'DELETE FROM cars WHERE id = ?',
      args: [carId]
    });
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'Car not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete car error:', error);
    res.status(500).json({ error: 'Failed to delete car' });
  }
});

// Applications
app.get('/api/applications', authenticateAdmin, async (req, res) => {
  try {
    const result = await db.execute('SELECT * FROM applications ORDER BY createdAt DESC');
    res.json(result.rows as unknown as Application[]);
  } catch (error) {
    console.error('Fetch applications error:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

app.put('/api/applications/:id/status', authenticateAdmin, async (req, res) => {
  const applicationId = Number(req.params.id);
  if (isNaN(applicationId)) return res.status(400).json({ error: 'Invalid application ID' });

  const validation = ApplicationStatusSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid application status', details: validation.error.format() });
  }

  try {
    const result = await db.execute({
      sql: 'UPDATE applications SET status = ? WHERE id = ?',
      args: [validation.data.status, applicationId]
    });
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'Application not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Update application status error:', error);
    res.status(500).json({ error: 'Failed to update application status' });
  }
});

// Create Application
app.post('/api/applications', applicationLimiter, async (req, res) => {
  const validation = ApplicationSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid application data', details: validation.error.format() });
  }

  const { 
    name, phone, email, licenseNumber, licenseExpiry, 
    uberStatus, experience, address, weeklyBudget, 
    intendedStartDate, licensePhoto, uberScreenshot 
  } = validation.data;

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
        licenseExpiry || null,
        uberStatus.trim(),
        experience || null,
        address.trim(),
        weeklyBudget || null,
        intendedStartDate || null,
        licensePhoto || null,
        uberScreenshot || null
      ]
    });

    return res.json({ success: true, applicationId: Number(result.lastInsertRowid) });
  } catch (error) {
    console.error('Application error:', error);
    return res.status(500).json({ error: 'Application submission failed' });
  }
});

// Rentals
app.get('/api/rentals', authenticateAdmin, async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT r.*, a.name as driverName, c.name as carName 
      FROM rentals r 
      JOIN applications a ON r.applicationId = a.id
      JOIN cars c ON r.carId = c.id
      ORDER BY r.createdAt DESC
    `);
    res.json(result.rows as unknown as Rental[]);
  } catch (error) {
    console.error('Fetch rentals error:', error);
    res.status(500).json({ error: 'Failed to fetch rentals' });
  }
});

app.post('/api/rentals', authenticateAdmin, async (req, res) => {
  const validation = RentalSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid rental data', details: validation.error.format() });
  }

  const { applicationId, carId, startDate, weeklyPrice } = validation.data;

  try {
    const appResult = await db.execute({
      sql: 'SELECT id FROM applications WHERE id = ?',
      args: [applicationId]
    });
    if (appResult.rows.length === 0) return res.status(404).json({ error: 'Application not found.' });

    const carResult = await db.execute({
      sql: 'SELECT id FROM cars WHERE id = ?',
      args: [carId]
    });
    const car = carResult.rows[0] as unknown as Car | undefined;
    if (!car) return res.status(404).json({ error: 'Car not found.' });

    // Atomically reserve the car for this rental creation attempt.
    const reserveCarResult = await db.execute({
      sql: "UPDATE cars SET status = 'Rented' WHERE id = ? AND status = 'Available'",
      args: [carId]
    });
    if (reserveCarResult.rowsAffected === 0) {
      return res.status(409).json({ error: 'Car is not available.' });
    }

    try {
      const insertResult = await db.execute({
        sql: 'INSERT INTO rentals (applicationId, carId, startDate, weeklyPrice) VALUES (?, ?, ?, ?)',
        args: [applicationId, carId, startDate.trim(), weeklyPrice]
      });
      return res.json({ success: true, rentalId: Number(insertResult.lastInsertRowid) });
    } catch (insertError) {
      await db.execute({
        sql: "UPDATE cars SET status = 'Available' WHERE id = ? AND status = 'Rented'",
        args: [carId]
      }).catch((rollbackError) => console.error('Failed to rollback car rental reservation:', rollbackError));
      throw insertError;
    }
  } catch (error) {
    console.error('Rental creation error:', error);
    return res.status(500).json({ error: 'Failed to create rental' });
  }
});

app.put('/api/rentals/:id/status', authenticateAdmin, async (req, res) => {
  const rentalId = Number(req.params.id);
  if (isNaN(rentalId)) return res.status(400).json({ error: 'Invalid rental ID' });

  const validation = RentalStatusSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid rental status', details: validation.error.format() });
  }

  const { status } = validation.data;

  try {
    const rentalResult = await db.execute({
      sql: 'SELECT id, carId FROM rentals WHERE id = ?',
      args: [rentalId]
    });
    const rental = rentalResult.rows[0] as unknown as Rental | undefined;
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
  } catch (error) {
    console.error('Update rental status error:', error);
    res.status(500).json({ error: 'Failed to update rental status' });
  }
});

// Bookings
app.post('/api/bookings', async (req, res) => {
  const validation = BookingSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid booking data', details: validation.error.format() });
  }

  const { customerName, email, phone, licenseNumber, carId, startDate, endDate } = validation.data;

  try {
    const carResult = await db.execute({
      sql: 'SELECT id, name, status, weeklyPrice FROM cars WHERE id = ?',
      args: [carId]
    });
    const car = carResult.rows[0] as unknown as Car | undefined;
    if (!car) return res.status(404).json({ error: 'Car not found.' });
    if (car.status !== 'Available') return res.status(409).json({ error: 'Car is not available.' });
    if (!stripe) return res.status(503).json({ error: 'Payments are not configured.' });

    const serverTotalPrice = calculateBookingTotal(Number(car.weeklyPrice), startDate.trim(), endDate.trim());
    if (!serverTotalPrice) {
      return res.status(400).json({ error: 'Invalid booking date range.' });
    }

    const reserveResult = await db.execute({
      sql: "UPDATE cars SET status = 'Reserved' WHERE id = ? AND status = 'Available'",
      args: [carId]
    });
    if (reserveResult.rowsAffected === 0) {
      return res.status(409).json({ error: 'Car is no longer available.' });
    }

    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email.trim(),
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/cars/${carId}`,
      metadata: {
        carId: String(carId),
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
            unit_amount: Math.round(serverTotalPrice * 100),
          },
        },
      ],
    });

    await db.execute({
      sql: `INSERT INTO bookings (
        carId, customerName, email, phone, licenseNumber, startDate, endDate, totalPrice, status, stripeSessionId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
      args: [
        carId,
        customerName.trim(),
        email.trim(),
        phone.trim(),
        licenseNumber.trim(),
        startDate.trim(),
        endDate.trim(),
        serverTotalPrice,
        session.id
      ]
    });

    return res.json({ url: session.url, sessionId: session.id, totalPrice: serverTotalPrice });
  } catch (error) {
    console.error('Booking checkout error:', error);
    await db.execute({
      sql: "UPDATE cars SET status = 'Available' WHERE id = ? AND status = 'Reserved'",
      args: [carId]
    }).catch((rollbackError) => console.error('Failed to rollback car reservation:', rollbackError));
    return res.status(500).json({ error: 'Failed to create checkout session.' });
  }
});

app.post('/api/bookings/verify-payment', async (req, res) => {
  const { sessionId } = req.body;
  if (typeof sessionId !== 'string' || !sessionId) {
    return res.status(400).json({ error: 'Invalid session id.' });
  }
  if (!stripe) return res.status(503).json({ error: 'Payments are not configured.' });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      if (session.status === 'expired') {
        await releasePendingBookingReservation(sessionId);
      }
      return res.json({ success: false });
    }

    const result = await markBookingPaid(sessionId);
    if (!result.found) return res.status(404).json({ error: 'Booking not found.' });
    return res.json({ success: true, bookingId: result.bookingId });
  } catch (error) {
    console.error('Payment verification error:', error);
    return res.status(500).json({ error: 'Failed to verify payment.' });
  }
});

// Dashboard Stats
app.get('/api/stats', authenticateAdmin, async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Fetch stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
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
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

if (!process.env.VERCEL) {
  startServer();
}
