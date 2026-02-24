import express from 'express';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Stripe from 'stripe';
import crypto from 'crypto';
import db from './src/db/index.js';

const app = express();
const PORT = 3000;

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
  ? new Stripe(stripeSecretKey, { apiVersion: '2025-02-24.acacia' })
  : null;

const CAR_STATUSES = ['Available', 'Rented', 'Maintenance'];
const APPLICATION_STATUSES = ['Pending', 'Approved', 'Rejected'];
const RENTAL_STATUSES = ['Active', 'Completed', 'Cancelled'];

const isNonEmptyString = (value, maxLength = 500) =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;

const toPositiveNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toPositiveInteger = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const token = req.cookies.admin_token || bearerToken;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!isNonEmptyString(username, 120) || !isNonEmptyString(password, 256)) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const admin = db.prepare('SELECT * FROM admin WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '1d' });
  res.cookie('admin_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
  return res.json({ token, username: admin.username });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ message: 'Logged out' });
});

app.get('/api/auth/verify', authenticateAdmin, (req, res) => {
  res.json({ user: req.admin });
});

app.get('/api/cars', (req, res) => {
  const cars = db.prepare('SELECT * FROM cars').all();
  res.json(cars);
});

app.get('/api/cars/:id', (req, res) => {
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!car) return res.status(404).json({ error: 'Car not found' });
  return res.json(car);
});

app.post('/api/cars', authenticateAdmin, (req, res) => {
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
    !CAR_STATUSES.includes(parsedStatus)
  ) {
    return res.status(400).json({ error: 'Invalid car payload.' });
  }

  const stmt = db.prepare(`
    INSERT INTO cars (name, modelYear, weeklyPrice, bond, status, image)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(name.trim(), parsedModelYear, parsedWeeklyPrice, parsedBond, parsedStatus, image.trim());
  return res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/cars/:id', authenticateAdmin, (req, res) => {
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
    !CAR_STATUSES.includes(status)
  ) {
    return res.status(400).json({ error: 'Invalid car payload.' });
  }

  const result = db.prepare(`
    UPDATE cars SET name = ?, modelYear = ?, weeklyPrice = ?, bond = ?, status = ?, image = ?
    WHERE id = ?
  `).run(name.trim(), parsedModelYear, parsedWeeklyPrice, parsedBond, status, image.trim(), carId);

  if (result.changes === 0) return res.status(404).json({ error: 'Car not found' });
  return res.json({ success: true });
});

app.delete('/api/cars/:id', authenticateAdmin, (req, res) => {
  const carId = toPositiveInteger(req.params.id);
  if (!carId) return res.status(400).json({ error: 'Invalid car id.' });
  const result = db.prepare('DELETE FROM cars WHERE id = ?').run(carId);
  if (result.changes === 0) return res.status(404).json({ error: 'Car not found' });
  return res.json({ success: true });
});

app.get('/api/applications', authenticateAdmin, (req, res) => {
  const applications = db.prepare('SELECT * FROM applications ORDER BY createdAt DESC').all();
  res.json(applications);
});

app.put('/api/applications/:id/status', authenticateAdmin, (req, res) => {
  const { status } = req.body;
  const applicationId = toPositiveInteger(req.params.id);
  if (!applicationId || typeof status !== 'string' || !APPLICATION_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid application status update.' });
  }

  const result = db.prepare('UPDATE applications SET status = ? WHERE id = ?').run(status, applicationId);
  if (result.changes === 0) return res.status(404).json({ error: 'Application not found' });
  return res.json({ success: true });
});

app.post('/api/applications', (req, res) => {
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
    const result = db.prepare(`
      INSERT INTO applications (
        name, phone, email, licenseNumber, licenseExpiry,
        uberStatus, experience, address, weeklyBudget,
        intendedStartDate, licensePhoto, uberScreenshot
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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
    );

    return res.json({ success: true, applicationId: result.lastInsertRowid });
  } catch (error) {
    console.error('Application error:', error);
    return res.status(500).json({ error: 'Application submission failed' });
  }
});

app.get('/api/rentals', authenticateAdmin, (req, res) => {
  const rentals = db.prepare(`
    SELECT r.*, a.name as driverName, c.name as carName
    FROM rentals r
    JOIN applications a ON r.applicationId = a.id
    JOIN cars c ON r.carId = c.id
    ORDER BY r.createdAt DESC
  `).all();
  res.json(rentals);
});

app.post('/api/rentals', authenticateAdmin, (req, res) => {
  const { applicationId, carId, startDate, weeklyPrice } = req.body;
  const parsedApplicationId = toPositiveInteger(applicationId);
  const parsedCarId = toPositiveInteger(carId);
  const parsedWeeklyPrice = toPositiveNumber(weeklyPrice);

  if (!parsedApplicationId || !parsedCarId || !parsedWeeklyPrice || !isNonEmptyString(startDate, 40)) {
    return res.status(400).json({ error: 'Invalid rental payload.' });
  }

  const application = db.prepare('SELECT id FROM applications WHERE id = ?').get(parsedApplicationId);
  if (!application) return res.status(404).json({ error: 'Application not found.' });

  const car = db.prepare('SELECT id, status FROM cars WHERE id = ?').get(parsedCarId);
  if (!car) return res.status(404).json({ error: 'Car not found.' });
  if (car.status !== 'Available') return res.status(409).json({ error: 'Car is not available.' });

  try {
    const tx = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO rentals (applicationId, carId, startDate, weeklyPrice)
        VALUES (?, ?, ?, ?)
      `).run(parsedApplicationId, parsedCarId, startDate.trim(), parsedWeeklyPrice);
      db.prepare("UPDATE cars SET status = 'Rented' WHERE id = ?").run(parsedCarId);
      return result.lastInsertRowid;
    });
    const rentalId = tx();
    return res.json({ success: true, rentalId });
  } catch {
    return res.status(500).json({ error: 'Failed to create rental' });
  }
});

app.put('/api/rentals/:id/status', authenticateAdmin, (req, res) => {
  const { status } = req.body;
  const rentalId = toPositiveInteger(req.params.id);
  if (!rentalId || typeof status !== 'string' || !RENTAL_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid rental status update.' });
  }

  const rental = db.prepare('SELECT id, carId FROM rentals WHERE id = ?').get(rentalId);
  if (!rental) return res.status(404).json({ error: 'Rental not found.' });

  const tx = db.transaction(() => {
    db.prepare('UPDATE rentals SET status = ? WHERE id = ?').run(status, rentalId);
    if (status === 'Completed' || status === 'Cancelled') {
      db.prepare("UPDATE cars SET status = 'Available' WHERE id = ?").run(rental.carId);
    } else if (status === 'Active') {
      db.prepare("UPDATE cars SET status = 'Rented' WHERE id = ?").run(rental.carId);
    }
  });
  tx();

  return res.json({ success: true });
});

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

  const car = db.prepare('SELECT id, name, status FROM cars WHERE id = ?').get(parsedCarId);
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

    db.prepare(`
      INSERT INTO bookings (
        carId, customerName, email, phone, licenseNumber, startDate, endDate, totalPrice, status, stripeSessionId
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)
    `).run(
      parsedCarId,
      customerName.trim(),
      email.trim(),
      phone.trim(),
      licenseNumber.trim(),
      startDate.trim(),
      endDate.trim(),
      parsedTotalPrice,
      session.id
    );

    return res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Booking checkout error:', error);
    return res.status(500).json({ error: 'Failed to create checkout session.' });
  }
});

app.post('/api/bookings/verify-payment', async (req, res) => {
  const { sessionId } = req.body;
  if (!isNonEmptyString(sessionId, 200)) return res.status(400).json({ error: 'Invalid session id.' });
  if (!stripe) return res.status(503).json({ error: 'Payments are not configured.' });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') return res.json({ success: false });

    const booking = db.prepare('SELECT id, carId FROM bookings WHERE stripeSessionId = ?').get(sessionId);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    const tx = db.transaction(() => {
      db.prepare("UPDATE bookings SET status = 'Paid' WHERE id = ?").run(booking.id);
      db.prepare("UPDATE cars SET status = 'Rented' WHERE id = ?").run(booking.carId);
    });
    tx();

    return res.json({ success: true, bookingId: booking.id });
  } catch (error) {
    console.error('Payment verification error:', error);
    return res.status(500).json({ error: 'Failed to verify payment.' });
  }
});

app.get('/api/stats', authenticateAdmin, (req, res) => {
  const totalApplications = db.prepare('SELECT COUNT(*) as count FROM applications').get().count;
  const activeRentals = db.prepare("SELECT COUNT(*) as count FROM rentals WHERE status = 'Active'").get().count;
  const totalWeeklyIncome = db.prepare("SELECT SUM(weeklyPrice) as total FROM rentals WHERE status = 'Active'").get().total || 0;

  res.json({ totalApplications, activeRentals, totalWeeklyIncome });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
