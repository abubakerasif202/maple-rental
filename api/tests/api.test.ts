import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { db } from '../db/index.js';

// Mock the DB client
vi.mock('../db/index.js', () => ({
  db: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: [{ id: 1, name: 'Toyota Camry' }], error: null })),
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: 1, name: 'Toyota Camry' }, error: null })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: 2 }, error: null })),
        })),
      })),
    })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { email: 'admin@maplerentals.com.au' } }, error: null })),
      signInWithPassword: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'fake-token' }, user: { email: 'admin@maplerentals.com.au' } }, error: null })),
    }
  },
  initializeDB: vi.fn(() => Promise.resolve()),
}));

describe('Cars API', () => {
  it('GET /api/cars should return a list of cars', async () => {
    const res = await request(app).get('/api/cars');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].name).toBe('Toyota Camry');
  });

  it('GET /api/cars/:id should return a single car', async () => {
    const res = await request(app).get('/api/cars/1');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Toyota Camry');
  });
});

describe('Auth API', () => {
  it('POST /api/auth/login should log in an admin', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin@maplerentals.com.au', password: 'password' });
    
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('admin@maplerentals.com.au');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('POST /api/auth/login should deny non-admin email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'notadmin@example.com', password: 'password' });
    
    expect(res.status).toBe(403);
  });
});
