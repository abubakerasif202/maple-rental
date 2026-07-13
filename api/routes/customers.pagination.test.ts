import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('../db/index.js', () => ({
  db: { from: mockFrom, rpc: mockRpc },
}));
vi.mock('../middleware/auth.js', () => ({
  authenticateAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { default: customersRouter } = await import('./customers.js');

const app = express();
app.use('/api/customers', customersRouter);

describe('customer summary pagination', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
  });

  it('delegates filtering, aggregation, counting, and pagination to one database RPC', async () => {
    mockRpc.mockResolvedValue({
      data: {
        items: [{ full_name: 'Current Driver', id: 51, invoice_count: 2 }],
        page: 2,
        pageSize: 1,
        totalItems: 3,
        totalPages: 3,
      },
      error: null,
    });

    const response = await request(app)
      .get('/api/customers?page=2&pageSize=1&search=Current%20Driver');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      available: true,
      page: 2,
      pageSize: 1,
      totalItems: 3,
      totalPages: 3,
    });
    expect(mockRpc).toHaveBeenCalledWith('list_current_customer_invoice_summaries', {
      p_page: 2,
      p_page_size: 1,
      p_search: 'Current Driver',
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
