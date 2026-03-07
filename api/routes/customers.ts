import express from 'express';
import { db } from '../db/index.js';
import { authenticateAdmin } from './auth.js';
import {
  isMissingOperationalHistoryTableError,
  OPERATIONAL_HISTORY_UNAVAILABLE_MESSAGE,
} from '../operationalHistory.js';

const router = express.Router();

router.get('/', authenticateAdmin, async (_req, res) => {
  try {
    const [{ data: customers, error: customersError }, { data: invoices, error: invoicesError }] =
      await Promise.all([
        db.from('customers').select('*').order('full_name', { ascending: true }),
        db.from('invoices').select('customer_id, amount, balance, invoice_date').order('invoice_date', { ascending: false }),
      ]);

    if (customersError || invoicesError) {
      const missingTableError = customersError || invoicesError;
      if (isMissingOperationalHistoryTableError(missingTableError)) {
        return res.json({
          available: false,
          items: [],
          message: OPERATIONAL_HISTORY_UNAVAILABLE_MESSAGE,
        });
      }

      throw customersError || invoicesError;
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
    });
  } catch (error) {
    console.error('Customer history fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch customer history' });
  }
});

export default router;
