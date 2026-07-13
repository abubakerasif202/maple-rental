import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEmailSend, mockRpc } = vi.hoisted(() => ({
  mockEmailSend: vi.fn(),
  mockRpc: vi.fn(),
}));

const notice = {
  id: 1,
  nominee_full_name: 'Example Driver',
  status: 'generated',
  toll_notice_number: 'TOLL-123',
  updated_at: '2026-07-14T00:00:00.000Z',
  vehicle_registration: 'ABC123',
};

vi.mock('../db/index.js', () => ({
  db: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: notice, error: null })),
        })),
      })),
    })),
    rpc: mockRpc,
  },
}));
vi.mock('../email.js', () => ({
  escapeHtml: (value: string) => value,
  getResend: vi.fn(async () => ({ emails: { send: mockEmailSend } })),
  sanitizeEmailHeaderValue: (value: string) => value,
}));
vi.mock('../middleware/auth.js', () => ({
  authenticateAdmin: (req: { admin?: { email: string } }, _res: unknown, next: () => void) => {
    req.admin = { email: 'admin@maplerentals.com.au' };
    next();
  },
}));
vi.mock('../templates/tollTransferNoticePdf.js', () => ({
  buildTollTransferNoticePdf: vi.fn(async () => Buffer.from('pdf')),
}));
vi.mock('./rentals.js', () => ({ loadRentalPrefillOptions: vi.fn(async () => []) }));

const { default: tollNoticesRouter } = await import('./tollNotices.js');

const app = express();
app.use(express.json());
app.use('/api/toll-notices', tollNoticesRouter);

describe('toll notice delivery outbox', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-resend-key';
    mockEmailSend.mockReset();
    mockRpc.mockReset();
  });

  it('reuses the provider idempotency key after accepted-email finalization failure', async () => {
    const attempt = {
      claimed: true,
      id: '00000000-0000-4000-8000-000000000001',
      idempotency_key: 'toll-notice-00000000-0000-4000-8000-000000000001',
      status: 'sending',
    };
    mockEmailSend.mockResolvedValue({ data: { id: 'email_123' }, error: null });
    mockRpc
      .mockResolvedValueOnce({ data: attempt, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'database unavailable' } })
      .mockResolvedValueOnce({ data: attempt, error: null })
      .mockResolvedValueOnce({
        data: { ...notice, sent_at: '2026-07-14T01:00:00.000Z', sent_to: 'tolls@example.com', status: 'sent' },
        error: null,
      });

    const first = await request(app)
      .post('/api/toll-notices/1/send')
      .send({ recipient_email: 'Tolls@Example.com' });
    const retry = await request(app)
      .post('/api/toll-notices/1/send')
      .send({ recipient_email: 'Tolls@Example.com' });

    expect(first.status).toBe(502);
    expect(retry.status).toBe(200);
    expect(mockEmailSend).toHaveBeenCalledTimes(2);
    for (const call of mockEmailSend.mock.calls) {
      expect(call[1]).toEqual({ idempotencyKey: attempt.idempotency_key });
      expect(call[0]).toMatchObject({ to: 'tolls@example.com' });
    }
  });
});
