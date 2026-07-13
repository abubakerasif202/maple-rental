import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockBalanceRange,
  mockFrom,
  mockPayoutsList,
  mockRpc,
} = vi.hoisted(() => ({
  mockBalanceRange: { end: '', start: '' },
  mockFrom: vi.fn(),
  mockPayoutsList: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('../db/index.js', () => ({
  db: { from: mockFrom, rpc: mockRpc },
}));
vi.mock('../middleware/auth.js', () => ({
  authenticateAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../schemaCompat.js', () => ({
  getApplicationImportedDataSelectColumns: vi.fn(async () => 'id'),
  getRentalSelectColumns: vi.fn(async () => 'id, weekly_price, status'),
}));
vi.mock('../stripeClient.js', () => ({
  getOptionalStripeClient: () => ({ payouts: { list: mockPayoutsList } }),
}));

const { default: financialsRouter } = await import('./financials.js');

const app = express();
app.use(express.json());
app.use('/api/financials', financialsRouter);

const resolvedQuery = (result: { data: unknown[]; error: null }) => {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.gte = vi.fn((_column: string, value: string) => {
    mockBalanceRange.start = value;
    return query;
  });
  query.lte = vi.fn((_column: string, value: string) => {
    mockBalanceRange.end = value;
    return query;
  });
  query.order = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.then = (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return query;
};

describe('weekly financial reporting', () => {
  beforeEach(() => {
    mockBalanceRange.start = '';
    mockBalanceRange.end = '';
    mockFrom.mockReset();
    mockPayoutsList.mockReset();
    mockRpc.mockReset();

    const balanceRows = Array.from({ length: 10 }, (_, index) => ({
      amount: 100,
      created_at: `2026-05-${String(18 + (index % 7)).padStart(2, '0')}T00:00:00.000Z`,
      id: `txn_${index}`,
      net: 95,
      type: 'payment',
    }));
    mockFrom.mockImplementation((table: string) => {
      if (table === 'rentals' || table === 'applications') {
        return resolvedQuery({ data: [], error: null });
      }
      if (table === 'stripe_balance_transactions') {
        return resolvedQuery({ data: balanceRows, error: null });
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    mockRpc.mockResolvedValue({
      data: { count: 11, gross: '1100.00', net: '1045.00' },
      error: null,
    });
    mockPayoutsList.mockResolvedValue({ data: [], has_more: false });
  });

  it('uses full-range database aggregates while returning only ten recent rows', async () => {
    const response = await request(app)
      .get('/api/financials/weekly?startDate=2026-05-18&endDate=2026-05-24');

    expect(response.status).toBe(200);
    expect(response.body.imported_balance_gross).toBe(1100);
    expect(response.body.imported_balance_net).toBe(1045);
    expect(response.body.imported_balance_transactions).toHaveLength(10);
    expect(mockBalanceRange.start).toBe('2026-05-18T00:00:00.000Z');
    expect(mockBalanceRange.end).toBe('2026-05-24T23:59:59.000Z');
    expect(mockRpc).toHaveBeenCalledWith('aggregate_stripe_balance_transactions', {
      p_end: '2026-05-24T23:59:59.000Z',
      p_start: '2026-05-18T00:00:00.000Z',
    });
  });

  it('rejects invalid and unbounded report ranges before calling Stripe', async () => {
    const reversed = await request(app)
      .get('/api/financials/weekly?startDate=2026-05-24&endDate=2026-05-18');
    const unbounded = await request(app)
      .get('/api/financials/weekly?startDate=2020-01-01&endDate=2026-05-18');

    expect(reversed.status).toBe(400);
    expect(reversed.body.error).toContain('must not precede');
    expect(unbounded.status).toBe(400);
    expect(unbounded.body.error).toContain('cannot exceed 366 days');
    expect(mockPayoutsList).not.toHaveBeenCalled();
  });
});
