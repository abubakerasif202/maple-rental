import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Stripe from 'stripe';
import db from './src/db/index.js';

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(cookieParser());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET is required. Export JWT_SECRET before starting the server.');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
  console.error('ADMIN_PASSWORD must be provided when NODE_ENV=production.');
  process.exit(1);
}

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

// Auth
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const admin = db.prepare('SELECT * FROM admin WHERE username = ?').get(username) as any;

  if (!admin || !bcrypt.compareSync(password, admin.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '1d' });
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
app.get('/api/cars', (req, res) => {
  const cars = db.prepare('SELECT * FROM cars').all();
  res.json(cars);
});

app.get('/api/cars/:id', (req, res) => {
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!car) return res.status(404).json({ error: 'Car not found' });
  res.json(car);
});

app.post('/api/cars', authenticateAdmin, (req, res) => {
  const { name, modelYear, weeklyPrice, bond, status, image } = req.body;
  const stmt = db.prepare(`
    INSERT INTO cars (name, modelYear, weeklyPrice, bond, status, image)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(name, modelYear, weeklyPrice, bond, status, image);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/cars/:id', authenticateAdmin, (req, res) => {
  const { name, modelYear, weeklyPrice, bond, status, image } = req.body;
  const stmt = db.prepare(`
    UPDATE cars SET name = ?, modelYear = ?, weeklyPrice = ?, bond = ?, status = ?, image = ?
    WHERE id = ?
  `);
  stmt.run(name, modelYear, weeklyPrice, bond, status, image, req.params.id);
  res.json({ success: true });
});

app.delete('/api/cars/:id', authenticateAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM cars WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Car deletion error:', err);
    res.status(400).json({ error: 'Cannot delete car with active rentals' });
  }
});

// Applications
app.get('/api/applications', authenticateAdmin, (req, res) => {
  const applications = db.prepare(`
    SELECT * FROM applications ORDER BY createdAt DESC
  `).all();
  res.json(applications);
});

app.put('/api/applications/:id/status', authenticateAdmin, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE applications SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

// Create Application
app.post('/api/applications', (req, res) => {
  const { 
    name, phone, email, licenseNumber, licenseExpiry, 
    uberStatus, experience, address, weeklyBudget, 
    intendedStartDate, licensePhoto, uberScreenshot 
  } = req.body;

  try {
    const stmt = db.prepare(`
      INSERT INTO applications (
        name, phone, email, licenseNumber, licenseExpiry, 
        uberStatus, experience, address, weeklyBudget, 
        intendedStartDate, licensePhoto, uberScreenshot
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      name, phone, email, licenseNumber, licenseExpiry, 
      uberStatus, experience, address, weeklyBudget, 
      intendedStartDate, licensePhoto, uberScreenshot
    );

    res.json({ success: true, applicationId: result.lastInsertRowid });
  } catch (error: any) {
    console.error('Application error:', error);
    res.status(500).json({ error: 'Application submission failed' });
  }
});

// Rentals
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
  try {
    const stmt = db.prepare(`
      INSERT INTO rentals (applicationId, carId, startDate, weeklyPrice)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(applicationId, carId, startDate, weeklyPrice);
    
    // Update car status
    db.prepare("UPDATE cars SET status = 'Rented' WHERE id = ?").run(carId);
    
    res.json({ success: true, rentalId: result.lastInsertRowid });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create rental' });
  }
});

app.put('/api/rentals/:id/status', authenticateAdmin, (req, res) => {
  const { status, carId } = req.body;
  db.prepare('UPDATE rentals SET status = ? WHERE id = ?').run(status, req.params.id);
  
  if (status === 'Completed' || status === 'Cancelled') {
    db.prepare("UPDATE cars SET status = 'Available' WHERE id = ?").run(carId);
  }
  
  res.json({ success: true });
});

app.post('/api/bookings', (req, res) => {
  const { carId, applicationId, startDate, endDate, totalAmount } = req.body;
  if (!carId || !startDate || !endDate || !totalAmount) {
    return res.status(400).json({ error: 'carId, startDate, endDate, and totalAmount are required' });
  }

  try {
    const sessionId = crypto.randomUUID();
    const stmt = db.prepare(`
      INSERT INTO bookings (carId, applicationId, sessionId, startDate, endDate, totalAmount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(carId, applicationId || null, sessionId, startDate, endDate, totalAmount, 'pending');
    res.status(201).json({ bookingId: result.lastInsertRowid, sessionId });
  } catch (error: any) {
    console.error('Booking creation error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

app.post('/api/bookings/verify-payment', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'sessionId is required' });
  }

  const booking = db.prepare('SELECT * FROM bookings WHERE sessionId = ?').get(sessionId);
  if (!booking) {
    return res.status(404).json({ success: false, error: 'Booking not found' });
  }

  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run('confirmed', booking.id);
  res.json({ success: true, bookingId: booking.id });
});

// Dashboard Stats
app.get('/api/stats', authenticateAdmin, (req, res) => {
  const totalApplications = (db.prepare('SELECT COUNT(*) as count FROM applications').get() as any).count;
  const activeRentals = (db.prepare("SELECT COUNT(*) as count FROM rentals WHERE status = 'Active'").get() as any).count;
  const totalWeeklyIncome = (db.prepare("SELECT SUM(weeklyPrice) as total FROM rentals WHERE status = 'Active'").get() as any).total || 0;
  
  res.json({
    totalApplications,
    activeRentals,
    totalWeeklyIncome
  });
});

// --- Vite Middleware ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
