import express from 'express';
import { db } from '../db/index.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { LEASE_SETTINGS } from '../constants.js';
import { getRentalSelectColumns } from '../schemaCompat.js';
import { getOptionalStripeClient } from '../stripeClient.js';

const router = express.Router();

router.get('/weekly', authenticateAdmin, async (_req, res) => {
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

    const rentals = ((activeRentals || []) as Array<Record<string, any>>);
    const projected_gross_weekly = rentals.reduce(
      (sum, rental) => sum + (Number(rental.weekly_price) || 0),
      0
    );
    // Platform charges the weekly account management fee per active rental.
    const estimated_platform_fees =
      rentals.length * (Number(LEASE_SETTINGS.fees.account_management_weekly) || 0);
    const projected_net_weekly = projected_gross_weekly - estimated_platform_fees;

    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
    const payouts = await stripe.payouts.list({
      created: { gte: sevenDaysAgo },
      limit: 10,
    });

    const actual_payouts_weekly = payouts.data
      .filter(p => p.status === 'paid' || p.status === 'in_transit')
      .reduce((sum, p) => sum + (p.amount / 100), 0);

    res.json({
      projected_gross_weekly,
      projected_net_weekly,
      estimated_platform_fees,
      actual_payouts_weekly,
      recent_payouts: payouts.data.map(p => ({
        id: p.id,
        amount: p.amount / 100,
        arrival_date: new Date(p.arrival_date * 1000).toISOString().slice(0, 10),
        status: p.status,
      })),
    });
  } catch (err) {
    console.error('Financials fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch weekly financials' });
  }
});

router.get('/stats', authenticateAdmin, async (_req, res) => {
  try {
    const rentalSelectColumns = await getRentalSelectColumns();
    const [applications, rentalsActive, incomeRows] = await Promise.all([
      db.from('applications').select('*', { count: 'exact', head: true }),
      db.from('rentals').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
      db.from('rentals').select(rentalSelectColumns).eq('status', 'Active'),
    ]);

    if (applications.error) {
      throw applications.error;
    }

    if (rentalsActive.error) {
      throw rentalsActive.error;
    }

    if (incomeRows.error) {
      throw incomeRows.error;
    }

    const applicationsCount = applications.count || 0;
    const activeRentalsCount = rentalsActive.count || 0;
    const rentalRows = ((incomeRows.data || []) as Array<Record<string, any>>);
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
