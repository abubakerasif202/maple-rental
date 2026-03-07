import express from 'express';
import Stripe from 'stripe';
import { db } from '../db/index.js';
import { LEASE_SETTINGS, RENTAL_PLAN_SETUP_FEES_AUD, STRIPE_CONFIG } from '../constants.js';
import { buildRentalPlanWithPricing, getRentalPlanById, rentalPlans } from '../../src/lib/rentalPlans.js';
import { subscriptionPayloadSchema, paymentIntentPayloadSchema } from '../validation.js';
import { z } from 'zod';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', STRIPE_CONFIG);

router.get('/rental-plans', (_req, res) => {
  res.json(
    rentalPlans.map((plan) => buildRentalPlanWithPricing(plan, LEASE_SETTINGS.fees))
  );
});

router.get('/lease-settings', (_req, res) => {
  res.json({
    currency: LEASE_SETTINGS.currency.toUpperCase(),
    recurring_interval: LEASE_SETTINGS.recurring_interval,
    minimum_rental_weeks: LEASE_SETTINGS.minimum_rental_weeks,
    insurance_coverage_region: LEASE_SETTINGS.insurance_coverage_region,
    fees: LEASE_SETTINGS.fees,
  });
});

router.post('/create-subscription', async (req, res) => {
  try {
    const { car_id, application_id, plan_id } = subscriptionPayloadSchema.parse(req.body);

    const { data: application, error: applicationError } = await db
      .from('applications')
      .select('id, status')
      .eq('id', application_id)
      .single();

    if (applicationError || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const selectedPlanBase = getRentalPlanById(plan_id);
    const selectedPlan = selectedPlanBase
      ? buildRentalPlanWithPricing(selectedPlanBase, LEASE_SETTINGS.fees)
      : null;

    if (plan_id && !selectedPlan) {
      return res.status(404).json({ error: 'Rental plan not found' });
    }

    let productName = 'Car Lease';
    let bondAud = 0;
    let initialRentalAud = 0;
    let serviceFeeAud = LEASE_SETTINGS.fees.account_management_weekly;
    let recurringAmountAud = initialRentalAud + serviceFeeAud;
    let recurringLabel = 'per week';
    let recurringInterval = LEASE_SETTINGS.recurring_interval as 'week' | 'month';
    let recurringIntervalCount = 1;

    if (selectedPlan) {
      productName = selectedPlan.name + ' Driver Plan';
      bondAud = selectedPlan.pricing.bondAud;
      initialRentalAud = selectedPlan.pricing.initialRentalAud;
      serviceFeeAud = selectedPlan.pricing.serviceFeeAud;
      recurringAmountAud = selectedPlan.pricing.recurringDueAud;
      recurringLabel = selectedPlan.pricing.recurringLabel;
      recurringInterval = selectedPlan.pricing.recurringInterval;
      recurringIntervalCount = selectedPlan.pricing.recurringIntervalCount;
    }

    if (car_id) {
      const { data: car, error: carError } = await db
        .from('cars')
        .select('id, name, weekly_price, bond, status')
        .eq('id', car_id)
        .single();

      if (carError || !car) {
        return res.status(404).json({ error: 'Car not found' });
      }

      if (car.status !== 'Available') {
        return res.status(409).json({ error: 'Selected vehicle is no longer available' });
      }

      if (!['Approved', 'Paid'].includes(application.status)) {
        return res.status(409).json({ error: 'Application must be approved before starting car checkout' });
      }

      productName = car.name;
      initialRentalAud = Number(car.weekly_price);
      bondAud = Number(car.bond);
      serviceFeeAud = LEASE_SETTINGS.fees.account_management_weekly;
      recurringAmountAud = Number((initialRentalAud + serviceFeeAud).toFixed(2));
      recurringLabel = 'per week';
      recurringInterval = LEASE_SETTINGS.recurring_interval;
      recurringIntervalCount = 1;
    }

    if (!initialRentalAud || initialRentalAud <= 0) {
      return res.status(400).json({ error: 'Invalid rental price configuration' });
    }

    const recurringAmountCents = Math.round(recurringAmountAud * 100);
    const upfrontItems = [
      {
        amountCents: Math.round(bondAud * 100),
        description: 'Security Bond (Refundable)',
      },
      {
        amountCents: Math.round(initialRentalAud * 100),
        description: selectedPlan ? 'Initial ' + selectedPlan.name + ' Rental' : 'Initial Weekly Rent',
      },
      {
        amountCents: Math.round(LEASE_SETTINGS.fees.new_account_setup * 100),
        description: 'New Account Setup Fee',
      },
      {
        amountCents: Math.round(LEASE_SETTINGS.fees.direct_debit_account_setup * 100),
        description: 'Direct Debit Account Setup Fee',
      },
    ].filter((item) => item.amountCents > 0);

    const upfrontDueCents = upfrontItems.reduce((sum, item) => sum + item.amountCents, 0);

    const customer = await stripe.customers.create({
      description: 'Maple Rental Subscription Customer',
      metadata: {
        car_id: car_id ? String(car_id) : '',
        application_id: application_id ? String(application_id) : '',
        pricing_plan_id: selectedPlan?.id ?? '',
        pricing_plan_name: selectedPlan?.name ?? '',
        lease_minimum_weeks: String(LEASE_SETTINGS.minimum_rental_weeks),
        insurance_coverage_region: LEASE_SETTINGS.insurance_coverage_region,
      },
    });

    const product = await stripe.products.create({
      name: productName + ' Subscription',
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: recurringAmountCents,
      currency: LEASE_SETTINGS.currency,
      recurring: {
        interval: recurringInterval,
        interval_count: recurringIntervalCount,
      },
    });

    for (const item of upfrontItems) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        amount: item.amountCents,
        currency: LEASE_SETTINGS.currency,
        description: item.description,
      });
    }

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: price.id }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      metadata: {
        car_id: car_id ? String(car_id) : '',
        application_id: application_id ? String(application_id) : '',
        pricing_plan_id: selectedPlan?.id ?? '',
        pricing_plan_name: selectedPlan?.name ?? '',
        lease_minimum_weeks: String(LEASE_SETTINGS.minimum_rental_weeks),
        insurance_coverage_region: LEASE_SETTINGS.insurance_coverage_region,
      },
      expand: ['latest_invoice.payment_intent'],
    });

    const invoice = subscription.latest_invoice as any;
    const paymentIntent = invoice.payment_intent;

    res.json({
      clientSecret: paymentIntent.client_secret,
      subscriptionId: subscription.id,
      paymentIntentId: paymentIntent.id,
      billingBreakdown: {
        currency: LEASE_SETTINGS.currency.toUpperCase(),
        upfrontDue: upfrontDueCents / 100,
        recurringAmount: recurringAmountCents / 100,
        recurringWeekly: recurringAmountCents / 100,
        recurringLabel,
        recurringInterval,
        recurringIntervalCount,
        minimumRentalWeeks: LEASE_SETTINGS.minimum_rental_weeks,
        bond: Number(bondAud.toFixed(2)),
        initialRental: Number(initialRentalAud.toFixed(2)),
        setupFees: RENTAL_PLAN_SETUP_FEES_AUD,
        serviceFee: Number(serviceFeeAud.toFixed(2)),
        planId: selectedPlan?.id ?? null,
        planName: selectedPlan?.name ?? null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }

    console.error('Stripe Subscription Error:', error);
    res.status(500).json({ error: 'Failed to initiate payment session' });
  }
});

router.post('/create-payment-intent', async (req, res) => {
  try {
    const { booking_id, currency } = paymentIntentPayloadSchema.parse(req.body);
    const { data: booking, error: bookingError } = await db
      .from('bookings')
      .select('id, total_amount')
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const amount = Number(booking.total_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid booking amount' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
    });
    res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
  } catch (error: any) {
    console.error('Payment intent error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/verify-payment', async (req, res) => {
  const { sessionId, paymentIntentId } = req.body;

  try {
    if (paymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      return res.json({ success: intent.status === 'succeeded', status: intent.status });
    }

    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      return res.json({
        success: session.payment_status === 'paid',
        status: session.payment_status,
      });
    }

    return res.status(400).json({ error: 'sessionId or paymentIntentId is required', success: false });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
