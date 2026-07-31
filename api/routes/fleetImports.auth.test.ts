import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createLocalAdminSessionToken } from '../middleware/auth.js';
import fleetImportRoutes from './fleetImports.js';

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use('/api/admin/fleet-imports', fleetImportRoutes);

describe('fleet import authorization boundary', () => {
  it.each([
    ['get', '/api/admin/fleet-imports'],
    ['get', '/api/admin/fleet-imports/56c2f453-c494-4702-9e7d-f12247ec8011'],
    ['post', '/api/admin/fleet-imports/56c2f453-c494-4702-9e7d-f12247ec8011/apply'],
  ] as const)('rejects unauthenticated %s %s', async (method, url) => {
    const response = await request(app)[method](url).send({
      confirm: 'APPLY FLEET CHANGES',
      idempotencyKey: '56c2f453-c494-4702-9e7d-f12247ec8012',
      rowIds: ['56c2f453-c494-4702-9e7d-f12247ec8013'],
    });
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects an untrusted-origin fleet write with a valid admin cookie', async () => {
    process.env.JWT_SECRET = 'fleet-import-test-secret-that-is-at-least-32-characters';
    const token = createLocalAdminSessionToken('admin@maplerentals.com.au');
    const response = await request(app)
      .post('/api/admin/fleet-imports/56c2f453-c494-4702-9e7d-f12247ec8011/cancel')
      .set('Cookie', `admin_token=${token}`)
      .set('Origin', 'https://evil.example');
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Cross-site admin request rejected' });
  });
});
