import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.TURSO_DATABASE_URL || 'file:data/car-rental.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({
  url,
  authToken,
});

// Initialize tables
async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS cars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      modelYear INTEGER NOT NULL,
      weeklyPrice REAL NOT NULL,
      bond REAL NOT NULL,
      status TEXT DEFAULT 'Available',
      image TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      licenseNumber TEXT NOT NULL,
      licenseExpiry TEXT,
      uberStatus TEXT NOT NULL,
      experience TEXT,
      address TEXT NOT NULL,
      weeklyBudget TEXT,
      intendedStartDate TEXT,
      licensePhoto TEXT,
      uberScreenshot TEXT,
      status TEXT DEFAULT 'Pending',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS rentals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      applicationId INTEGER NOT NULL,
      carId INTEGER NOT NULL,
      startDate TEXT NOT NULL,
      weeklyPrice REAL NOT NULL,
      status TEXT DEFAULT 'Active',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (applicationId) REFERENCES applications (id),
      FOREIGN KEY (carId) REFERENCES cars (id)
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      carId INTEGER NOT NULL,
      customerName TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      licenseNumber TEXT NOT NULL,
      startDate TEXT NOT NULL,
      endDate TEXT NOT NULL,
      totalPrice REAL NOT NULL,
      status TEXT DEFAULT 'Pending',
      stripeSessionId TEXT UNIQUE,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (carId) REFERENCES cars (id)
    );
  `);

  // Seed admin if not exists
  const adminCheck = await db.execute('SELECT COUNT(*) as count FROM admin');
  const adminCount = Number(adminCheck.rows[0].count);
  
  if (adminCount === 0) {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(18).toString('base64url');

    if (!process.env.ADMIN_PASSWORD) {
      console.warn(`No ADMIN_PASSWORD provided. Generated one-time admin password for "${adminUsername}": ${adminPassword}`);
    }

    const hashedPassword = bcrypt.hashSync(adminPassword, 10);
    await db.execute({
      sql: 'INSERT INTO admin (username, password) VALUES (?, ?)',
      args: [adminUsername, hashedPassword]
    });
  }

  // Seed cars if empty
  const carCheck = await db.execute('SELECT COUNT(*) as count FROM cars');
  const carCount = Number(carCheck.rows[0].count);
  
  if (carCount === 0) {
    const cars = [
      ['Toyota Camry Hybrid Ascent', 2021, 250, 500, 'Available', 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fd?auto=format&fit=crop&q=80&w=1000'],
      ['Toyota Camry Hybrid SL', 2023, 350, 700, 'Available', 'https://images.unsplash.com/photo-1550355291-bbee04a92027?auto=format&fit=crop&q=80&w=1000'],
      ['Toyota Camry Hybrid Ascent Sport', 2022, 300, 600, 'Available', 'https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&q=80&w=1000']
    ];

    for (const car of cars) {
      await db.execute({
        sql: 'INSERT INTO cars (name, modelYear, weeklyPrice, bond, status, image) VALUES (?, ?, ?, ?, ?, ?)',
        args: car
      });
    }
  }
}

initDb().catch(console.error);

export default db;
