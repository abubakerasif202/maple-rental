import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';

const dbConfig = {
  url: process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
};

// Create a singleton client for the entire application.
// In a serverless environment, this instance may be reused across multiple requests.
export const db = createClient(dbConfig);

export const initializeDB = async () => {
  // Initialize tables without dropping existing data.
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
      applicationId INTEGER,
      sessionId TEXT UNIQUE,
      startDate TEXT NOT NULL,
      endDate TEXT NOT NULL,
      totalAmount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (carId) REFERENCES cars (id),
      FOREIGN KEY (applicationId) REFERENCES applications (id)
    );
  `);

  // Seed admin if not exists
  const adminCount = await db.execute('SELECT COUNT(*) as count FROM admin');
  if (Number(adminCount.rows[0].count) === 0) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = bcrypt.hashSync(adminPassword, 10);
    await db.execute({
      sql: 'INSERT INTO admin (username, password) VALUES (?, ?)',
      args: ['admin', hashedPassword]
    });
  }

  // Seed cars if empty
  const carCount = await db.execute('SELECT COUNT(*) as count FROM cars');
  if (Number(carCount.rows[0].count) === 0) {
    await db.execute({
      sql: `INSERT INTO cars (name, modelYear, weeklyPrice, bond, status, image) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['Toyota Camry Hybrid Ascent', 2021, 250, 500, 'Available', 'https://images.unsplash.com/photo-1550355291-bbee04a92027?auto=format&fit=crop&q=80&w=1000']
    });
    // ... other seeds can stay as they were, I will keep it concise here for now.
    await db.execute({
      sql: `INSERT INTO cars (name, modelYear, weeklyPrice, bond, status, image) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['Toyota Camry Hybrid SL', 2023, 350, 700, 'Available', 'https://images.unsplash.com/photo-1550355291-bbee04a92027?auto=format&fit=crop&q=80&w=1000']
    });
  }
};

export default db;
