import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db, { initializeDB } from './src/db/index.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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

app.put('/api/cars/:id', authenticateAdmin, async (req, res) => {
  const { name, modelYear, weeklyPrice, bond, status, image } = req.body;
  try {
    await db.execute({
      sql: `UPDATE cars SET name = ?, modelYear = ?, weeklyPrice = ?, bond = ?, status = ?, image = ? WHERE id = ?`,
      args: [name, modelYear, weeklyPrice, bond, status, image, req.params.id]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update car' });
  }
});

app.delete('/api/cars/:id', authenticateAdmin, async (req, res) => {
  try {
    await db.execute({
      sql: 'DELETE FROM cars WHERE id = ?',
      args: [req.params.id]
    });
    res.json({ success: true });
  } catch (err: any) {
    console.error('Car deletion error:', err);
    res.status(400).json({ error: 'Cannot delete car with active rentals' });
  }
});

// Applications
app.get('/api/applications', authenticateAdmin, async (req, res) => {
  const result = await db.execute('SELECT * FROM applications ORDER BY createdAt DESC');
  res.json(result.rows);
});

app.put('/api/applications/:id/status', authenticateAdmin, async (req, res) => {
  const { status } = req.body;
  await db.execute({
    sql: 'UPDATE applications SET status = ? WHERE id = ?',
    args: [status, req.params.id]
  });
  res.json({ success: true });
});

// Create Application
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
    console.error('Application error:', error);
    res.status(500).json({ error: 'Application submission failed' });
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
  try {
    const result = await db.execute({
      sql: `INSERT INTO rentals (applicationId, carId, startDate, weeklyPrice) VALUES (?, ?, ?, ?)`,
      args: [applicationId, carId, startDate, weeklyPrice]
    });
    
    // Update car status
    await db.execute({
      sql: "UPDATE cars SET status = 'Rented' WHERE id = ?",
      args: [carId]
    });
    
    res.json({ success: true, rentalId: String(result.lastInsertRowid) });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create rental' });
  }
});

app.put('/api/rentals/:id/status', authenticateAdmin, async (req, res) => {
  const { status, carId } = req.body;
  await db.execute({
    sql: 'UPDATE rentals SET status = ? WHERE id = ?',
    args: [status, req.params.id]
  });
  
  if (status === 'Completed' || status === 'Cancelled') {
    await db.execute({
      sql: "UPDATE cars SET status = 'Available' WHERE id = ?",
      args: [carId]
    });
  }
  
  res.json({ success: true });
});

app.post('/api/bookings', async (req, res) => {
  const { carId, applicationId, startDate, endDate, totalAmount } = req.body;
  if (!carId || !startDate || !endDate || !totalAmount) {
    return res.status(400).json({ error: 'carId, startDate, endDate, and totalAmount are required' });
  }

  try {
    const sessionId = crypto.randomUUID();
    const result = await db.execute({
      sql: `INSERT INTO bookings (carId, applicationId, sessionId, startDate, endDate, totalAmount, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [carId, applicationId || null, sessionId, startDate, endDate, totalAmount, 'pending']
    });
    res.status(201).json({ bookingId: String(result.lastInsertRowid), sessionId });
  } catch (error: any) {
    console.error('Booking creation error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

app.post('/api/bookings/verify-payment', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'sessionId is required' });
  }

  const result = await db.execute({
    sql: 'SELECT * FROM bookings WHERE sessionId = ?',
    args: [sessionId]
  });
  const booking = result.rows[0];
  if (!booking) {
    return res.status(404).json({ success: false, error: 'Booking not found' });
  }

  await db.execute({
    sql: 'UPDATE bookings SET status = ? WHERE id = ?',
    args: ['confirmed', booking.id]
  });
  res.json({ success: true, bookingId: booking.id });
});

// Dashboard Stats
app.get('/api/stats', authenticateAdmin, async (req, res) => {
  try {
    const appsResult = await db.execute('SELECT COUNT(*) as count FROM applications');
    const rentalsResult = await db.execute("SELECT COUNT(*) as count FROM rentals WHERE status = 'Active'");
    const incomeResult = await db.execute("SELECT SUM(weeklyPrice) as total FROM rentals WHERE status = 'Active'");
    
    res.json({
      totalApplications: Number(appsResult.rows[0].count),
      activeRentals: Number(rentalsResult.rows[0].count),
      totalWeeklyIncome: Number(incomeResult.rows[0].total) || 0
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// --- Vite Middleware ---
export default app;

async function startServer() {
  await initializeDB();

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

  if (process.env.VERCEL !== '1') {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();
