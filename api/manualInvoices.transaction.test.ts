import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}));

vi.mock('./db/index.js', () => ({
  db: { rpc: mockRpc },
}));

const {
  calculateManualInvoiceItems,
  createManualInvoice,
  manualInvoiceInputSchema,
} = await import('./manualInvoices.js');

const input = {
  bill_to_name: 'Approved Driver',
  issue_date: '2026-07-14',
  items: [{
    amount: 1,
    description: 'Weekly rental',
    gst: 10,
    quantity: 1,
    unit_price: 100,
  }],
  status: 'issued' as const,
};

describe('manual invoice transactional creation', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('ignores client-provided amounts and derives the item total', () => {
    const parsed = manualInvoiceInputSchema.parse(input);
    expect(parsed.items[0]).not.toHaveProperty('amount');
    expect(calculateManualInvoiceItems(parsed.items)[0]?.amount).toBe(110);
  });

  it('creates the invoice and its items through one database transaction RPC', async () => {
    mockRpc.mockResolvedValue({
      data: {
        bill_to_name: 'Approved Driver',
        gst: '10.00',
        id: '00000000-0000-4000-8000-000000000001',
        invoice_number: 'MR-INV-TEST',
        issue_date: '2026-07-14',
        items: [{
          amount: '110.00',
          description: 'Weekly rental',
          gst: '10.00',
          quantity: '1.00',
          sort_order: 0,
          unit_price: '100.00',
        }],
        status: 'issued',
        subtotal: '100.00',
        total_inc_gst: '110.00',
      },
      error: null,
    });

    const parsed = manualInvoiceInputSchema.parse(input);
    const invoice = await createManualInvoice({
      adminEmail: 'admin@maplerentals.com.au',
      input: { ...parsed, invoice_number: 'mr-inv-test' },
    });

    expect(mockRpc).toHaveBeenCalledWith('create_manual_invoice_transaction', {
      p_invoice: expect.objectContaining({
        created_by: 'admin@maplerentals.com.au',
        invoice_number: 'MR-INV-TEST',
      }),
      p_items: [{
        amount: 110,
        description: 'Weekly rental',
        gst: 10,
        quantity: 1,
        sort_order: 0,
        unit_price: 100,
      }],
    });
    expect(invoice.total_inc_gst).toBe(110);
    expect(invoice.items[0]?.amount).toBe(110);
  });

  it('maps the unique invoice-number constraint to a conflict', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } });
    const parsed = manualInvoiceInputSchema.parse(input);

    await expect(createManualInvoice({
      input: { ...parsed, invoice_number: 'MR-INV-DUP' },
    })).rejects.toMatchObject({
      message: 'Invoice number already exists.',
      status: 409,
    });
  });
});
