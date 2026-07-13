import express from 'express';
import { db } from '../db/index.js';
import { authenticateAdmin } from '../middleware/auth.js';
import {
  isMissingOperationalHistoryTableError,
  OPERATIONAL_HISTORY_UNAVAILABLE_MESSAGE,
} from '../operationalHistory.js';

const router = express.Router();
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const invoiceCustomerColumns = 'id, email, phone';

const parsePositiveInt = (value: unknown, fallback: number) => {
  const normalized = Array.isArray(value) ? value[0] : value;
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
};

const normalizeSearchTerm = (value: unknown) => {
  const normalized = Array.isArray(value) ? value[0] : value;

  if (typeof normalized !== 'string') {
    return '';
  }

  return normalized.replace(/[^a-zA-Z0-9@.+\-\s]/g, ' ').replace(/\s+/g, ' ').trim();
};

const applyInvoiceSearch = (query: any, searchTerm: string) => {
  if (!searchTerm) {
    return query;
  }

  const pattern = `%${searchTerm}%`;
  return query.or(
    [
      `external_invoice_number.ilike.${pattern}`,
      `customer_name.ilike.${pattern}`,
      `car_registration.ilike.${pattern}`,
      `due_label.ilike.${pattern}`,
      `transaction_summary.ilike.${pattern}`,
    ].join(',')
  );
};

router.get('/', authenticateAdmin, async (req, res) => {
  const requestedPage = parsePositiveInt(req.query.page, 1);
  const pageSize = Math.min(parsePositiveInt(req.query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const searchTerm = normalizeSearchTerm(req.query.search);

  try {
    const countQuery = applyInvoiceSearch(
      db.from('invoices').select('id', { count: 'exact', head: true }).eq('is_imported', false),
      searchTerm,
    );
    const { count, error: countError } = await countQuery;
    if (countError) {
      if (isMissingOperationalHistoryTableError(countError)) {
        return res.json({
          available: false,
          items: [],
          message: OPERATIONAL_HISTORY_UNAVAILABLE_MESSAGE,
          page: 1,
          pageSize,
          totalItems: 0,
          totalPages: 1,
        });
      }

      throw countError;
    }

    const totalItems = count || 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const rangeStart = (page - 1) * pageSize;
    const rangeEnd = rangeStart + pageSize - 1;
    const invoiceQuery = applyInvoiceSearch(
      db.from('invoices').select('*').eq('is_imported', false),
      searchTerm,
    );
    const { data: invoices, error: invoicesError } = await invoiceQuery
      .order('invoice_date', { ascending: false })
      .range(rangeStart, rangeEnd);
    if (invoicesError) throw invoicesError;

    const customerIds = (invoices || [])
      .map((invoice: any) => Number(invoice.customer_id))
      .filter((customerId: number) => Number.isFinite(customerId));

    let customers: Array<Record<string, any>> = [];
    if (customerIds.length > 0) {
      const { data: customerRows, error: customersError } = await db
        .from('customers')
        .select(invoiceCustomerColumns)
        .in('id', customerIds);

      if (customersError) {
        if (isMissingOperationalHistoryTableError(customersError)) {
          return res.json({
            available: false,
            items: [],
            message: OPERATIONAL_HISTORY_UNAVAILABLE_MESSAGE,
            page: 1,
            pageSize,
            totalItems: 0,
            totalPages: 1,
          });
        }

        throw customersError;
      }

      customers = (customerRows || []) as Array<Record<string, any>>;
    }

    const customerById = new Map<number, any>(
      (customers || []).map((customer: any) => [Number(customer.id), customer])
    );

    const items = (invoices || []).map((invoice: any) => {
      const customer = invoice.customer_id
        ? customerById.get(Number(invoice.customer_id))
        : null;

      return {
        ...invoice,
        customer_email: customer?.email || null,
        customer_phone: customer?.phone || null,
        status: Number(invoice.balance) > 0 ? 'Open' : 'Paid',
      };
    });

    res.json({
      available: true,
      items,
      page,
      pageSize,
      totalItems,
      totalPages,
    });
  } catch (error) {
    console.error('Invoice history fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch invoice history' });
  }
});

export default router;
