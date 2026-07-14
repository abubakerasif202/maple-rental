import express from 'express';
import type Stripe from 'stripe';
import { db } from '../db/index.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { LEASE_SETTINGS } from '../constants.js';
import {
  getApplicationSelectColumns,
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
const RECENT_ACTIVITY_LIMIT = 8;
const SUMMARY_TREND_DAYS = 7;
const MAX_REPORT_DAYS = 366;
const SECONDS_PER_DAY = 24 * 60 * 60;
const SYDNEY_TIME_ZONE = 'Australia/Sydney';

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

const formatSydneyDateKey = (value: string | number | Date) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: SYDNEY_TIME_ZONE,
  }).format(date);
};

const startOfSydneyDay = (daysAgo = 0) => {
  const now = new Date();
  const sydneyDate = new Date(
    now.toLocaleString('en-US', { timeZone: SYDNEY_TIME_ZONE })
  );
  sydneyDate.setHours(0, 0, 0, 0);
  sydneyDate.setDate(sydneyDate.getDate() - daysAgo);
  return sydneyDate;
};

const getNumeric = (value: unknown) => Number(value) || 0;

const toText = (value: unknown) => (typeof value === 'string' ? value : '');

const buildStatusDistribution = (statuses: Record<string, number>) =>
  Object.entries(statuses)
    .filter(([, value]) => value > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([label, value]) => ({ label, value }));

const fetchStripePayoutSummary = async (
  stripe: Stripe,
  created: { gte: number; lte?: number }
) => {
  const recentPayouts: Stripe.Payout[] = [];
  let actualPayouts = 0;
  let payoutCount = 0;
  let startingAfter: string | undefined;

  while (true) {
    const page = await stripe.payouts.list({
      created,
      limit: STRIPE_PAYOUTS_PAGE_SIZE,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const payout of page.data) {
      payoutCount += 1;
      if (recentPayouts.length < RECENT_PAYOUTS_LIMIT) {
        recentPayouts.push(payout);
      }
      if (payout.status === 'paid' || payout.status === 'in_transit') {
        actualPayouts += payout.amount / 100;
      }
    }

    if (!page.has_more || page.data.length === 0) {
      break;
    }

    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) {
      break;
    }
  }

  return {
    actualPayouts,
    recentPayouts,
    recentPayoutsTruncated: payoutCount > recentPayouts.length,
  };
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
    if (req.query.startDate !== undefined && requestedStart === null) {
      return res.status(400).json({ error: 'startDate must be a valid YYYY-MM-DD date.' });
    }
    if (req.query.endDate !== undefined && requestedEnd === null) {
      return res.status(400).json({ error: 'endDate must be a valid YYYY-MM-DD date.' });
    }

    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - (7 * SECONDS_PER_DAY);
    const created: { gte: number; lte: number } = {
      gte: requestedStart ?? sevenDaysAgo,
      lte: requestedEnd ?? now,
    };

    if (created.lte < created.gte) {
      return res.status(400).json({ error: 'endDate must not precede startDate.' });
    }
    if (created.lte - created.gte > MAX_REPORT_DAYS * SECONDS_PER_DAY) {
      return res.status(400).json({ error: `Date range cannot exceed ${MAX_REPORT_DAYS} days.` });
    }

    const rangeStart = new Date(created.gte * 1000).toISOString();
    const rangeEnd = new Date(created.lte * 1000).toISOString();
    const balanceTransactionQuery = db
      .from('stripe_balance_transactions')
      .select('*')
      .gte('created_at', rangeStart)
      .lte('created_at', rangeEnd)
      .order('created_at', { ascending: false })
      .limit(RECENT_BALANCE_TRANSACTIONS_LIMIT);
    const [balanceTransactionsResult, balanceTotalsResult, payoutSummary] = await Promise.all([
      balanceTransactionQuery,
      db.rpc('aggregate_stripe_balance_transactions', {
        p_end: rangeEnd,
        p_start: rangeStart,
      }),
      fetchStripePayoutSummary(stripe, created),
    ]);
    const {
      data: balanceTransactions,
      error: balanceTransactionsError,
    } = balanceTransactionsResult;
    const {
      data: balanceTotals,
      error: balanceTotalsError,
    } = balanceTotalsResult;

    if (
      balanceTransactionsError &&
      !isMissingOperationalHistoryTableError(balanceTransactionsError)
    ) {
      throw balanceTransactionsError;
    }
    if (balanceTotalsError && !isMissingOperationalHistoryTableError(balanceTotalsError)) {
      throw balanceTotalsError;
    }

    const importedBalanceTransactions =
      balanceTransactionsError && isMissingOperationalHistoryTableError(balanceTransactionsError)
        ? []
        : ((balanceTransactions || []) as Array<Record<string, any>>);
    const importedBalanceTotals =
      balanceTotalsError && isMissingOperationalHistoryTableError(balanceTotalsError)
        ? null
        : (balanceTotals as Record<string, unknown> | null);
    const actual_payouts_weekly = payoutSummary.actualPayouts;
    const imported_balance_net = Number(importedBalanceTotals?.net) || 0;
    const imported_balance_gross = Number(importedBalanceTotals?.gross) || 0;

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
      recent_payouts: payoutSummary.recentPayouts.map((p) => ({
        id: p.id,
        amount: p.amount / 100,
        arrival_date: new Date(p.arrival_date * 1000).toISOString().slice(0, 10),
        status: p.status,
      })),
      recent_payouts_truncated: payoutSummary.recentPayoutsTruncated,
    });
  } catch (err) {
    console.error('Financials fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch weekly financials' });
  }
});

router.get('/stats', authenticateAdmin, async (_req, res) => {
  try {
    const summary = await loadDashboardSummary();
    res.json({
      total_applications: summary.total_applications,
      active_rentals: summary.active_rentals,
      total_weekly_income: summary.total_weekly_income,
    });
  } catch (err) {
    console.error('Stats fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

const loadDashboardSummary = async () => {
  const rentalSelectColumns = await getRentalSelectColumns({ includeStripeFields: true });
  const applicationSelectColumns = await getApplicationSelectColumns();
  const importedApplicationSelectColumns = await getApplicationImportedDataSelectColumns();
  const [applicationsResult, rentalsResult, invoicesResult, agreementsResult, auditResult] =
    await Promise.all([
      db.from('applications').select(applicationSelectColumns),
      db.from('rentals').select(rentalSelectColumns),
      db.from('invoices').select('id, balance, amount, status, invoice_date, due_label, customer_name, car_registration'),
      db.from('lease_agreements').select('id, application_id, status, created_at'),
      db.from('admin_audit_events').select('id, action, actor, created_at, target_type, target_id, metadata').order('created_at', { ascending: false }).limit(RECENT_ACTIVITY_LIMIT),
    ]);

  for (const result of [applicationsResult, rentalsResult, invoicesResult, agreementsResult, auditResult]) {
    if (result.error) {
      throw result.error;
    }
  }

  const applicationRows = (applicationsResult.data || []) as Array<Record<string, any>>;
  const rentalRows = (rentalsResult.data || []) as Array<Record<string, any>>;
  const invoiceRows = (invoicesResult.data || []) as Array<Record<string, any>>;
  const agreementRows = (agreementsResult.data || []) as Array<Record<string, any>>;
  const auditRows = (auditResult.data || []) as Array<Record<string, any>>;
  const importedApplicationIds = getImportedApplicationIdSet(
    (await db.from('applications').select(importedApplicationSelectColumns)).data ||
      [],
  );
  const realApplications = filterRealApplications(applicationRows);
  const realRentals = filterRealRentals(rentalRows, importedApplicationIds);
  const statusCounts = realApplications.reduce<Record<string, number>>((acc, row) => {
    const status = toText(row.status) || 'Unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const totalWeeklyIncome = realRentals.reduce(
    (sum, row) => sum + getNumeric(row.weekly_price),
    0
  );
  const outstandingInvoices = invoiceRows.reduce(
    (sum, row) => sum + Math.max(0, getNumeric(row.balance)),
    0
  );
  const overdueInvoices = invoiceRows.filter((row) => getNumeric(row.balance) > 0 && toText(row.status).toLowerCase() !== 'paid').length;
  const paidApplications = realApplications.filter((row) => toText(row.status) === 'Paid');
  const agreementsByApplication = new Set(
    agreementRows.map((agreement) => toText(agreement.application_id)).filter(Boolean)
  );
  const recentApplications = [...realApplications]
    .sort((left, right) => Date.parse(toText(right.created_at)) - Date.parse(toText(left.created_at)))
    .slice(0, RECENT_ACTIVITY_LIMIT);
  const recentPayments = [...paidApplications]
    .sort((left, right) => Date.parse(toText(right.paid_at)) - Date.parse(toText(left.paid_at)))
    .slice(0, RECENT_ACTIVITY_LIMIT)
    .map((application) => ({
      id: toText(application.id),
      type: 'payment',
      title: `${toText(application.name) || 'Application'} marked paid`,
      subtitle: `${toText(application.approved_vehicle) || 'Registration not recorded'} • ${getNumeric(application.approved_weekly_price) ? `$${getNumeric(application.approved_weekly_price).toFixed(2)}/week` : 'Weekly price not set'}`,
      actor: null,
      amount: getNumeric(application.approved_weekly_price),
      created_at: toText(application.paid_at),
      status: toText(application.status),
    }));
  const recentRentalActivity = [...realRentals]
    .sort((left, right) => Date.parse(toText(right.created_at)) - Date.parse(toText(left.created_at)))
    .slice(0, RECENT_ACTIVITY_LIMIT)
    .map((rental) => ({
      id: String(rental.id),
      type: 'rental',
      title: `${toText(rental.applicant_name) || 'Rental'} active`,
      subtitle: `${toText(rental.vehicle_registration) || toText(rental.car_name) || 'Registration not recorded'} • ${getNumeric(rental.weekly_price) ? `$${getNumeric(rental.weekly_price).toFixed(2)}/week` : 'No weekly price'}`,
      actor: null,
      amount: getNumeric(rental.weekly_price),
      created_at: toText(rental.created_at),
      status: toText(rental.status),
    }));
  const recentAdminActions = auditRows.map((row) => ({
    id: String(row.id),
    type: 'audit',
    title: toText(row.action).replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
    subtitle: [toText(row.target_type), toText(row.target_id)].filter(Boolean).join(' • ') || null,
    actor: toText(row.actor) || null,
    created_at: toText(row.created_at),
    status: null,
  }));
  const trendByDay = new Map<string, { applications: number; paidApplications: number; rentals: number; revenue: number; audits: number }>();
  for (let dayOffset = SUMMARY_TREND_DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
    const key = formatSydneyDateKey(startOfSydneyDay(dayOffset));
    trendByDay.set(key, { applications: 0, paidApplications: 0, rentals: 0, revenue: 0, audits: 0 });
  }
  for (const row of realApplications) {
    const key = formatSydneyDateKey(toText(row.created_at));
    if (key == null) {
      continue;
    }
    const bucket = trendByDay.get(key);
    if (bucket) {
      bucket.applications += 1;
      if (toText(row.status) === 'Paid') {
        bucket.paidApplications += 1;
        bucket.revenue += getNumeric(row.approved_weekly_price);
      }
    }
    if (row.paid_at) {
      const paidKey = formatSydneyDateKey(toText(row.paid_at));
      if (paidKey == null) {
        continue;
      }
      const paidBucket = trendByDay.get(paidKey);
      if (paidBucket && toText(row.status) === 'Paid') {
        paidBucket.paidApplications += 1;
      }
    }
  }
  for (const row of realRentals) {
    const key = formatSydneyDateKey(toText(row.created_at));
    if (key == null) {
      continue;
    }
    const bucket = trendByDay.get(key);
    if (bucket) {
      bucket.rentals += 1;
      bucket.revenue += getNumeric(row.weekly_price);
    }
  }
  for (const row of auditRows) {
    const key = formatSydneyDateKey(toText(row.created_at));
    if (key == null) {
      continue;
    }
    const bucket = trendByDay.get(key);
    if (bucket) {
      bucket.audits += 1;
    }
  }

  return {
    active_rentals: realRentals.filter((row) => toText(row.status) === 'Active').length,
    agreements_awaiting_attention: Math.max(0, paidApplications.length - agreementsByApplication.size),
    agreements_generated: agreementRows.length,
    applications_by_status: statusCounts,
    outstanding_invoices: outstandingInvoices,
    overdue_invoices: overdueInvoices,
    pending_applications: statusCounts.Pending || 0,
    paid_applications: statusCounts.Paid || 0,
    recent_admin_actions: recentAdminActions,
    recent_applications: recentApplications,
    recent_payments: recentPayments,
    recent_rental_activity: recentRentalActivity,
    revenue_trend: [...trendByDay.entries()].map(([label, value]) => ({ label, ...value })),
    status_distribution: buildStatusDistribution(statusCounts),
    summary_generated_at: new Date().toISOString(),
    total_applications: realApplications.length,
    total_customers: (await db.from('customers').select('id', { count: 'exact', head: true })).count || 0,
    total_weekly_income: totalWeeklyIncome,
    weekly_recurring_revenue: totalWeeklyIncome,
  };
};

router.get('/dashboard-summary', authenticateAdmin, async (_req, res) => {
  try {
    res.json(await loadDashboardSummary());
  } catch (error) {
    console.error('Dashboard summary fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

export default router;
