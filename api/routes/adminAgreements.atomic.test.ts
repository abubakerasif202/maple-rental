import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('../db/index.js', () => ({
  db: { rpc: mockRpc },
}));
vi.mock('../middleware/auth.js', () => ({
  authenticateAdmin: (req: { admin?: { email: string } }, _res: unknown, next: () => void) => {
    req.admin = { email: 'admin@maplerentals.com.au' };
    next();
  },
}));
vi.mock('../agreementTemplates.js', () => ({
  fetchAgreementTemplateById: vi.fn(),
  fetchAgreementTemplates: vi.fn(async () => []),
}));

const { default: agreementsRouter } = await import('./adminAgreements.js');

const app = express();
app.use(express.json());
app.use('/api/admin/agreements', agreementsRouter);

describe('atomic agreement template mutations', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('revises an active template through a single transaction RPC', async () => {
    mockRpc.mockResolvedValue({
      data: {
        active: true,
        content: '# Updated agreement',
        id: 8,
        name: 'Car Lease Agreement',
        template_key: 'car-lease',
        updated_at: '2026-07-14T00:00:00.000Z',
        updated_by: 'admin@maplerentals.com.au',
        version: 4,
      },
      error: null,
    });

    const response = await request(app)
      .put('/api/admin/agreements/7')
      .send({ content: '# Updated agreement' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ active: true, id: 8, version: 4 });
    expect(mockRpc).toHaveBeenCalledWith('revise_agreement_template', {
      p_content: '# Updated agreement',
      p_name: null,
      p_source_id: 7,
      p_updated_by: 'admin@maplerentals.com.au',
    });
  });

  it('activates a template through the locked transaction RPC', async () => {
    mockRpc.mockResolvedValue({
      data: {
        active: true,
        content: '# Agreement',
        id: 9,
        name: 'Car Lease Agreement',
        template_key: 'car-lease',
        updated_at: '2026-07-14T00:00:00.000Z',
        version: 5,
      },
      error: null,
    });

    const response = await request(app).post('/api/admin/agreements/9/activate');

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('activate_agreement_template', {
      p_template_id: 9,
      p_updated_by: 'admin@maplerentals.com.au',
    });
  });
});
