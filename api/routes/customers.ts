import express from 'express';
import { db } from '../db/index.js';
import { authenticateAdmin } from '../middleware/auth.js';
import {
  isMissingOperationalHistoryTableError,
  OPERATIONAL_HISTORY_UNAVAILABLE_MESSAGE,
} from '../operationalHistory.js';
import { filterRealOperationalInvoices } from '../importedDataFilters.js';

const router = express.Router();
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const customerInvoiceColumns = 'customer_id, amount, balance, invoice_date';

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

const applyCustomerSearch = (query: any, searchTerm: string) => {
  if (!searchTerm) {
    return query;
  }

  const pattern = `%${searchTerm}%`;
  return query.or(
    [
      `full_name.ilike.${pattern}`,
      `email.ilike.${pattern}`,
      `phone.ilike.${pattern}`,
      `company_name.ilike.${pattern}`,
      `staff_number.ilike.${pattern}`,
      `external_id.ilike.${pattern}`,
    ].join(',')
  );
};

router.get('/', authenticateAdmin, async (req, res) => {
  const requestedPage = parsePositiveInt(req.query.page, 1);
  const pageSize = Math.min(parsePositiveInt(req.query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const searchTerm = normalizeSearchTerm(req.query.search);

  try {
    const countQuery = applyCustomerSearch(
      db.from('customers').select('id', { count: 'exact', head: true }).eq('is_imported', false),
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
    const customerQuery = applyCustomerSearch(
      db.from('customers').select('*').eq('is_imported', false),
      searchTerm,
    );
    const { data: customers, error: customerRowsError } = await customerQuery
      .order('full_name', { ascending: true })
      .range(rangeStart, rangeEnd);
    if (customerRowsError) throw customerRowsError;

    const customerIds = (customers || [])
      .map((customer: any) => Number(customer.id))
      .filter((customerId) => Number.isFinite(customerId));

    let invoices: Array<Record<string, any>> = [];
    if (customerIds.length > 0) {
      const { data: invoiceRows, error: invoicesError } = await db
        .from('invoices')
        .select(customerInvoiceColumns)
        .in('customer_id', customerIds);

      if (invoicesError) {
        if (isMissingOperationalHistoryTableError(invoicesError)) {
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

        throw invoicesError;
      }

      invoices = filterRealOperationalInvoices(
        (invoiceRows || []) as Array<Record<string, any>>,
      );
    }

    const invoiceSummaryByCustomerId = new Map<
      number,
      { invoice_count: number; total_billed: number; outstanding_balance: number; last_invoice_date: string | null }
    >();

    for (const invoice of invoices || []) {
      if (!invoice.customer_id) {
        continue;
      }

      const customerId = Number(invoice.customer_id);
      const currentSummary = invoiceSummaryByCustomerId.get(customerId) || {
        invoice_count: 0,
        total_billed: 0,
        outstanding_balance: 0,
        last_invoice_date: null,
      };

      currentSummary.invoice_count += 1;
      currentSummary.total_billed += Number(invoice.amount) || 0;
      currentSummary.outstanding_balance += Number(invoice.balance) || 0;

      const invoiceDate = typeof invoice.invoice_date === 'string' ? invoice.invoice_date : null;
      if (invoiceDate && (!currentSummary.last_invoice_date || invoiceDate > currentSummary.last_invoice_date)) {
        currentSummary.last_invoice_date = invoiceDate;
      }

      invoiceSummaryByCustomerId.set(customerId, currentSummary);
    }

    const items = (customers || []).map((customer: any) => ({
      ...customer,
      invoice_count: invoiceSummaryByCustomerId.get(Number(customer.id))?.invoice_count || 0,
      total_billed: invoiceSummaryByCustomerId.get(Number(customer.id))?.total_billed || 0,
      outstanding_balance:
        invoiceSummaryByCustomerId.get(Number(customer.id))?.outstanding_balance || 0,
      last_invoice_date:
        invoiceSummaryByCustomerId.get(Number(customer.id))?.last_invoice_date || null,
    }));

    res.json({
      available: true,
      items,
      page,
      pageSize,
      totalItems,
      totalPages,
    });
  } catch (error) {
    console.error('Customer history fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch customer history' });
  }
});

export default router;
