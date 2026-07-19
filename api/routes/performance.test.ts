import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import performanceRoutes from './performance.js';

const createTestApp = () => {
  const app = express();
  app.use('/api/performance', performanceRoutes);
  return app;
};

describe('performance telemetry route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a bounded anonymous report without database access', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const response = await request(createTestApp())
      .post('/api/performance')
      .send({
        route: 'home',
        metrics: [
          { name: 'lcp', value: 1825.45 },
          { name: 'cls', value: 0.01234 },
        ],
      });

    expect(response.status).toBe(204);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(log.mock.calls[0][0]))).toEqual({
      event: 'web_vitals_untrusted',
      requestId: '-',
      route: 'home',
      metrics: [
        { name: 'lcp', value: 1825.5 },
        { name: 'cls', value: 0.0123 },
      ],
    });
  });

  it('rejects identifiers, unknown metrics, and oversized batches', async () => {
    const app = createTestApp();
    const [identifier, unknownMetric, oversized] = await Promise.all([
      request(app).post('/api/performance').send({
        route: '/checkout/private-token',
        metrics: [{ name: 'lcp', value: 1000 }],
      }),
      request(app).post('/api/performance').send({
        route: 'home',
        metrics: [{ name: 'inp', value: 100 }],
      }),
      request(app).post('/api/performance').send({
        route: 'home',
        metrics: [
          { name: 'lcp', value: 1000 },
          { name: 'cls', value: 0.1 },
          { name: 'ttfb', value: 200 },
          { name: 'lcp', value: 900 },
        ],
      }),
    ]);

    expect([identifier.status, unknownMetric.status, oversized.status]).toEqual([
      400,
      400,
      400,
    ]);
  });
});
