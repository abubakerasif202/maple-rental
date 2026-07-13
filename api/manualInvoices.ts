import { z } from 'zod';
import { db } from './db/index.js';

export const manualInvoiceStatuses = [
  'draft',
  'issued',
  'paid',
  'overdue',
  'cancelled',
] as const;

export type ManualInvoiceStatus = (typeof manualInvoiceStatuses)[number];

export type ManualInvoiceItem = {
  id?: string;
  invoice_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  gst: number;
  amount: number;
  sort_order: number;
};

export type ManualInvoice = {
  id: string;
  invoice_number: string;
  status: ManualInvoiceStatus;
  issue_date: string;
  due_date?: string | null;
  bill_to_name: string;
  bill_to_abn_mobile?: string | null;
  vehicle_reference?: string | null;
  rental_period_reference?: string | null;
  notes?: string | null;
  additional_details?: string | null;
  subtotal: number;
  gst: number;
  total_inc_gst: number;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  items: ManualInvoiceItem[];
};

export const roundMoney = (value: number) => Number(value.toFixed(2));

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const moneySchema = z.coerce.number().finite().min(0).transform((value) => roundMoney(value));

export const manualInvoiceItemInputSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().finite().positive(),
  unit_price: moneySchema,
  gst: moneySchema.default(0),
});

export const manualInvoiceInputSchema = z.object({
  invoice_number: z.string().trim().min(1).max(80).optional(),
  status: z.enum(manualInvoiceStatuses).default('draft'),
  issue_date: dateOnlySchema,
  due_date: dateOnlySchema.optional().nullable(),
  bill_to_name: z.string().trim().min(1).max(200),
  bill_to_abn_mobile: z.string().trim().max(120).optional().nullable(),
  vehicle_reference: z.string().trim().max(200).optional().nullable(),
  rental_period_reference: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  additional_details: z.string().trim().max(2000).optional().nullable(),
  items: z.array(manualInvoiceItemInputSchema).min(1).max(50),
});

export type ManualInvoiceInput = z.infer<typeof manualInvoiceInputSchema>;

const generateInvoiceNumber = () => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `MR-INV-${date}-${suffix}`;
};

const normalizeInvoiceNumber = (invoiceNumber?: string) =>
  (invoiceNumber || generateInvoiceNumber()).trim().toUpperCase();

export const calculateManualInvoiceItems = (
  items: z.infer<typeof manualInvoiceItemInputSchema>[]
) =>
  items.map((item, index) => {
    const quantity = Number(item.quantity);
    const unitPrice = roundMoney(Number(item.unit_price));
    const gst = roundMoney(Number(item.gst || 0));
    const amount = roundMoney(quantity * unitPrice + gst);

    return {
      description: item.description.trim(),
      quantity,
      unit_price: unitPrice,
      gst,
      amount,
      sort_order: index,
    };
  });

export const calculateManualInvoiceTotals = (items: ManualInvoiceItem[]) => {
  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  );
  const gst = roundMoney(items.reduce((sum, item) => sum + item.gst, 0));
  const total_inc_gst = roundMoney(items.reduce((sum, item) => sum + item.amount, 0));

  return { subtotal, gst, total_inc_gst };
};

const getManualInvoiceItems = async (invoiceId: string) => {
  const { data, error } = await db
    .from('manual_invoice_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('sort_order', { ascending: true });

  if (error) {
    throw error;
  }

  return ((data || []) as ManualInvoiceItem[]).map((item) => ({
    ...item,
    amount: Number(item.amount || 0),
    gst: Number(item.gst || 0),
    quantity: Number(item.quantity || 0),
    unit_price: Number(item.unit_price || 0),
  }));
};

export const getManualInvoiceById = async (id: string): Promise<ManualInvoice | null> => {
  const { data, error } = await db
    .from('manual_invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    ...(data as ManualInvoice),
    subtotal: Number(data.subtotal || 0),
    gst: Number(data.gst || 0),
    total_inc_gst: Number(data.total_inc_gst || 0),
    items: await getManualInvoiceItems(id),
  };
};

export const listManualInvoices = async (): Promise<ManualInvoice[]> => {
  const { data, error } = await db
    .from('manual_invoices')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return ((data || []) as ManualInvoice[]).map((invoice) => ({
    ...invoice,
    subtotal: Number(invoice.subtotal || 0),
    gst: Number(invoice.gst || 0),
    total_inc_gst: Number(invoice.total_inc_gst || 0),
    items: [],
  }));
};

export const createManualInvoice = async ({
  adminEmail,
  input,
}: {
  adminEmail?: string | null;
  input: ManualInvoiceInput;
}) => {
  const invoiceNumber = normalizeInvoiceNumber(input.invoice_number);
  const items = calculateManualInvoiceItems(input.items);
  const invoicePayload = {
    invoice_number: invoiceNumber,
    status: input.status,
    issue_date: input.issue_date,
    due_date: input.due_date || null,
    bill_to_name: input.bill_to_name,
    bill_to_abn_mobile: input.bill_to_abn_mobile || null,
    vehicle_reference: input.vehicle_reference || null,
    rental_period_reference: input.rental_period_reference || null,
    notes: input.notes || null,
    additional_details: input.additional_details || null,
    created_by: adminEmail || null,
  };

  const { data, error } = await db.rpc('create_manual_invoice_transaction', {
    p_invoice: invoicePayload,
    p_items: items,
  });

  if (error) {
    if (error.code === '23505') {
      const duplicateError = new Error('Invoice number already exists.');
      (duplicateError as Error & { status?: number }).status = 409;
      throw duplicateError;
    }

    throw error;
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Manual invoice transaction did not return an invoice.');
  }

  const invoice = data as unknown as ManualInvoice;
  return {
    ...invoice,
    subtotal: Number(invoice.subtotal || 0),
    gst: Number(invoice.gst || 0),
    total_inc_gst: Number(invoice.total_inc_gst || 0),
    items: (invoice.items || []).map((item) => ({
      ...item,
      amount: Number(item.amount || 0),
      gst: Number(item.gst || 0),
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
    })),
  };
};
