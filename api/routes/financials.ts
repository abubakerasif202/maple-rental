import express from 'express';
import { db } from '../db/index.js';
import { authenticateAdmin } from './auth.js';
import Stripe from 'stripe';
import { STRIPE_CONFIG } from '../constants.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', STRIPE_CONFIG);

router.get('/weekly', authenticateAdmin, async (_req, res) => {
  try {
    const { data: activeRentals, error: rentalsError } = await db
      .from('rentals')
      .select('weekly_price')
      .eq('status', 'Active');

    if (rentalsError) throw rentalsError;

    const projected_gross_weekly = activeRentals?.reduce((sum, rental) => sum + Number(rental.weekly_price), 0) || 0;
    const estimated_platform_fees = activeRentals?.length || 0;
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
    const [applications, rentalsActive, incomeRows] = await Promise.all([
      db.from('applications').select('*', { count: 'exact', head: true }),
      db.from('rentals').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
      db.from('rentals').select('weekly_price').eq('status', 'Active'),
    ]);

    const applicationsCount = applications.count || 0;
    const activeRentalsCount = rentalsActive.count || 0;
    const totalWeeklyIncome = incomeRows.data?.reduce((sum, row) => sum + Number(row.weekly_price), 0) || 0;

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
