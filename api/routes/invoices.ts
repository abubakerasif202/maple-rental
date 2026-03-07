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
    const [{ data: invoices, error: invoicesError }, { data: customers, error: customersError }] =
      await Promise.all([
        db.from('invoices').select('*').order('invoice_date', { ascending: false }),
        db.from('customers').select('id, full_name, email, phone').order('full_name', { ascending: true }),
      ]);

    if (invoicesError || customersError) {
      const missingTableError = invoicesError || customersError;
      if (isMissingOperationalHistoryTableError(missingTableError)) {
        return res.json({
          available: false,
          items: [],
          message: OPERATIONAL_HISTORY_UNAVAILABLE_MESSAGE,
        });
      }

      throw invoicesError || customersError;
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
    });
  } catch (error) {
    console.error('Invoice history fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch invoice history' });
  }
});

export default router;
