import express from 'express';
import type Stripe from 'stripe';
import { db } from '../db/index.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { LEASE_SETTINGS } from '../constants.js';
import {
  getApplicationImportedDataSelectColumns,
  getRentalSelectColumns,
} from '../schemaCompat.js';
import { getOptionalStripeClient } from '../stripeClient.js';
import { isMissingOperationalHistoryTableError } from '../operationalHistory.js';
import {
  filterRealApplications,
  filterRealRentals,
  getImportedApplicationIdSet,
} from '../importedDataFilters.js';

const router = express.Router();
const STRIPE_PAYOUTS_PAGE_SIZE = 100;
const RECENT_PAYOUTS_LIMIT = 10;
const RECENT_BALANCE_TRANSACTIONS_LIMIT = 10;

const parseDateOnlyToStripeTimestamp = (value: unknown, endOfDay = false) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(
    Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0)
  );

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return Math.floor(date.getTime() / 1000);
};

const fetchAllStripePayouts = async (
  stripe: Stripe,
  created: { gte: number; lte?: number }
) => {
  const payouts: Stripe.Payout[] = [];
  let startingAfter: string | undefined;

  while (true) {
    const page = await stripe.payouts.list({
      created,
      limit: STRIPE_PAYOUTS_PAGE_SIZE,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    payouts.push(...page.data);

    if (!page.has_more || page.data.length === 0) {
      break;
    }

    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) {
      break;
    }
  }

  return payouts;
};

router.get('/weekly', authenticateAdmin, async (req, res) => {
  try {
    const stripe = getOptionalStripeClient();

    if (!stripe) {
      return res
        .status(503)
        .json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY to enable payouts data.' });
    }

    const rentalSelectColumns = await getRentalSelectColumns();
    const { data: activeRentals, error: rentalsError } = await db
      .from('rentals')
      .select(rentalSelectColumns)
      .eq('status', 'Active');

    if (rentalsError) throw rentalsError;

    const { data: applications, error: applicationsError } = await db
      .from('applications')
      .select('*');

    if (applicationsError) throw applicationsError;

    const importedApplicationIds = getImportedApplicationIdSet(
      (applications || []) as Array<Record<string, any>>,
    );
    const rentals = filterRealRentals(
      (activeRentals || []) as Array<Record<string, any>>,
      importedApplicationIds,
    );
    const projected_gross_weekly = rentals.reduce(
      (sum, rental) => sum + (Number(rental.weekly_price) || 0),
      0
    );
    // Platform charges the weekly account management fee per active rental.
    const estimated_platform_fees =
      rentals.length * (Number(LEASE_SETTINGS.fees.account_management_weekly) || 0);
    const projected_net_weekly = projected_gross_weekly - estimated_platform_fees;

    const requestedStart = parseDateOnlyToStripeTimestamp(req.query.startDate);
    const requestedEnd = parseDateOnlyToStripeTimestamp(req.query.endDate, true);
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
    const created: { gte: number; lte?: number } = {
      gte: requestedStart ?? sevenDaysAgo,
    };

    if (requestedEnd) {
      created.lte = requestedEnd;
    }

    const balanceTransactionQuery = db
      .from('stripe_balance_transactions')
      .select('*')
      .gte('created_at', new Date(created.gte * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(RECENT_BALANCE_TRANSACTIONS_LIMIT);
    const { data: balanceTransactions, error: balanceTransactionsError } =
      await balanceTransactionQuery;

    if (
      balanceTransactionsError &&
      !isMissingOperationalHistoryTableError(balanceTransactionsError)
    ) {
      throw balanceTransactionsError;
    }

    const importedBalanceTransactions =
      balanceTransactionsError && isMissingOperationalHistoryTableError(balanceTransactionsError)
        ? []
        : ((balanceTransactions || []) as Array<Record<string, any>>);

    const payouts = await fetchAllStripePayouts(stripe, created);
    const recentPayouts = payouts.slice(0, RECENT_PAYOUTS_LIMIT);

    const actual_payouts_weekly = payouts
      .filter((payout) => payout.status === 'paid' || payout.status === 'in_transit')
      .reduce((sum, p) => sum + (p.amount / 100), 0);
    const imported_balance_net = importedBalanceTransactions.reduce(
      (sum, transaction) => sum + (Number(transaction.net) || 0),
      0,
    );
    const imported_balance_gross = importedBalanceTransactions.reduce(
      (sum, transaction) => sum + (Number(transaction.amount) || 0),
      0,
    );

    res.json({
      projected_gross_weekly,
      projected_net_weekly,
      estimated_platform_fees,
      actual_payouts_weekly,
      imported_balance_gross,
      imported_balance_net,
      imported_balance_transactions: importedBalanceTransactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        amount: Number(transaction.amount) || 0,
        fee: Number(transaction.fee) || 0,
        net: Number(transaction.net) || 0,
        currency: transaction.currency || 'aud',
        created_at: transaction.created_at,
        description: transaction.description || null,
        source: transaction.source || null,
        transfer: transaction.transfer || null,
      })),
      recent_payouts: recentPayouts.map((p) => ({
        id: p.id,
        amount: p.amount / 100,
        arrival_date: new Date(p.arrival_date * 1000).toISOString().slice(0, 10),
        status: p.status,
      })),
      recent_payouts_truncated: payouts.length > recentPayouts.length,
    });
  } catch (err) {
    console.error('Financials fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch weekly financials' });
  }
});

router.get('/stats', authenticateAdmin, async (_req, res) => {
  try {
    const rentalSelectColumns = await getRentalSelectColumns();
    const importedApplicationSelectColumns =
      await getApplicationImportedDataSelectColumns();
    const [applications, incomeRows] = await Promise.all([
      db.from('applications').select(importedApplicationSelectColumns),
      db.from('rentals').select(rentalSelectColumns).eq('status', 'Active'),
    ]);

    if (applications.error) {
      throw applications.error;
    }

    if (incomeRows.error) {
      throw incomeRows.error;
    }

    const applicationRows = (applications.data || []) as Array<Record<string, any>>;
    const importedApplicationIds = getImportedApplicationIdSet(applicationRows);
    const applicationsCount = filterRealApplications(applicationRows).length;
    const rentalRows = filterRealRentals(
      (incomeRows.data || []) as Array<Record<string, any>>,
      importedApplicationIds,
    );
    const activeRentalsCount = rentalRows.length;
    const totalWeeklyIncome = rentalRows.reduce((sum, row) => sum + (Number(row.weekly_price) || 0), 0);

    res.json({
      total_applications: applicationsCount,
      active_rentals: activeRentalsCount,
      total_weekly_income: totalWeeklyIncome,
    });
  } catch (err) {
    console.error('Stats fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
