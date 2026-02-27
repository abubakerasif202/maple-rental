import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'car-rental.db'));

// Initialize tables
db.exec(`
  DROP TABLE IF EXISTS bookings;
  DROP TABLE IF EXISTS cars;
  DROP TABLE IF EXISTS admin;
  DROP TABLE IF EXISTS applications;
  DROP TABLE IF EXISTS rentals;

  CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    modelYear INTEGER NOT NULL,
    weeklyPrice REAL NOT NULL,
    bond REAL NOT NULL,
    status TEXT DEFAULT 'Available',
    image TEXT NOT NULL
  );

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

// Seed admin if not exists
const adminCount = db.prepare('SELECT COUNT(*) as count FROM admin').get() as { count: number };
if (adminCount.count === 0) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO admin (username, password) VALUES (?, ?)').run('admin', hashedPassword);
}

// Seed cars if empty
const carCount = db.prepare('SELECT COUNT(*) as count FROM cars').get() as { count: number };
if (carCount.count === 0) {
  const insertCar = db.prepare(`
    INSERT INTO cars (name, modelYear, weeklyPrice, bond, status, image)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  insertCar.run('Toyota Camry Hybrid Ascent', 2021, 250, 500, 'Available', 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fd?auto=format&fit=crop&q=80&w=1000');
  insertCar.run('Toyota Camry Hybrid SL', 2023, 350, 700, 'Available', 'https://images.unsplash.com/photo-1550355291-bbee04a92027?auto=format&fit=crop&q=80&w=1000');
  insertCar.run('Toyota Camry Hybrid Ascent Sport', 2022, 300, 600, 'Available', 'https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&q=80&w=1000');
}

export default db;
