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
    const { car_id, application_id, plan_id, custom_weekly_price, custom_bond } = subscriptionPayloadSchema.parse(req.body);

    if (car_id && plan_id) {
      return res.status(400).json({ error: 'Provide either car_id or plan_id, not both' });
    }

    const selectedPlanBase = getRentalPlanById(plan_id);
    const selectedPlan = selectedPlanBase
      ? buildRentalPlanWithPricing(selectedPlanBase, LEASE_SETTINGS.fees)
      : null;

    if (plan_id && !selectedPlan) {
      return res.status(404).json({ error: 'Rental plan not found' });
    }

    let productName = 'Car Lease';
    let bondAud = custom_bond || 0;
    let initialRentalAud = custom_weekly_price || 0;
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

      productName = car.name;
      if (!custom_weekly_price) initialRentalAud = Number(car.weekly_price);
      if (!custom_bond) bondAud = Number(car.bond);
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

// Webhook is special as it needs raw body, we'll handle it in the main app for now 
// or use a separate middleware here if we can.
// Actually, Express allows using specific body parsers for specific routes.
router.post('/webhook', express.raw({ type: 'application/json' }), async (request, response) => {
  const sig = request.headers['stripe-signature'];
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      request.body,
      sig as string,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Stripe Webhook Error: ${message}`);
    response.status(400).send(`Webhook Error: ${message}`);
    return;
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`✅ Webhook: Checkout session completed ${session.id}`);
        break;
      }
      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        console.log(`ℹ️ Webhook: Connected account updated ${account.id}`);

        if (account.details_submitted) {
          await db.from('merchants')
            .update({ onboarding_status: 'active' })
            .eq('stripe_account_id', account.id);
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any;
        const subscriptionId = invoice.subscription as string;
        const customerId = invoice.customer as string;

        if (!subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const { car_id, application_id } = subscription.metadata;

        if (car_id && application_id) {
          console.log(`✅ Webhook: Payment succeeded for car ${car_id} and application ${application_id}`);

          const { data: existingRental } = await db
            .from('rentals')
            .select('id')
            .eq('stripe_subscription_id', subscriptionId)
            .single();

          if (!existingRental) {
            const { data: car } = await db.from('cars').select('weekly_price').eq('id', car_id).single();

            await db.from('rentals').insert([{
              car_id: Number(car_id),
              application_id: Number(application_id),
              start_date: new Date().toISOString().split('T')[0],
              weekly_price: car?.weekly_price || 0,
              status: 'Active',
              stripe_subscription_id: subscriptionId,
              stripe_customer_id: customerId
            }]);

            await db.from('cars').update({ status: 'Rented' }).eq('id', car_id);
            await db.from('applications').update({ status: 'Approved' }).eq('id', application_id);

            if (process.env.RESEND_API_KEY) {
              const { data: appData } = await db.from('applications').select('name, email').eq('id', application_id).single();
              const { data: carData } = await db.from('cars').select('name').eq('id', car_id).single();

              if (appData && carData) {
                try {
                  const { Resend } = await import('resend');
                  const resend = new Resend(process.env.RESEND_API_KEY);
                  await resend.emails.send({
                    from: 'Maple Rentals <noreply@maplerentals.com.au>',
                    to: appData.email,
                    subject: 'Rental Confirmed - Maple Rentals',
                    html: `
                      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a202c;">
                        <h2 style="color: #D4AF37;">Lease Confirmed</h2>
                        <p>Hi ${appData.name},</p>
                        <p>Great news! Your payment for the <strong>${carData.name}</strong> has been successfully processed.</p>
                        <p>Your rental is now <strong>Active</strong>. You can now arrange for vehicle collection as discussed.</p>
                        <p><strong>Subscription ID:</strong> ${subscriptionId}</p>
                        <br>
                        <p>Best regards,</p>
                        <p><strong>The Maple Rentals Team</strong></p>
                      </div>
                    `
                  });
                } catch (emailErr) {
                  console.error('Failed to send rental confirmation email:', emailErr);
                }
              }
            }
          }
        } else if (application_id) {
          await db.from('applications').update({ status: 'Paid' }).eq('id', application_id);
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        const subscriptionId = invoice.subscription as string;
        if (subscriptionId) {
          await db.from('rentals')
            .update({ status: 'Overdue' })
            .eq('stripe_subscription_id', subscriptionId);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;
        const { car_id } = subscription.metadata;

        await db.from('rentals')
          .update({ status: 'Completed', end_date: new Date().toISOString().split('T')[0] })
          .eq('stripe_subscription_id', subscriptionId);

        if (car_id) {
          await db.from('cars').update({ status: 'Available' }).eq('id', car_id);
        }
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;
        const status = subscription.status;

        if (status === 'past_due' || status === 'unpaid') {
          await db.from('rentals')
            .update({ status: 'Overdue' })
            .eq('stripe_subscription_id', subscriptionId);
        } else if (status === 'active') {
          await db.from('rentals')
            .update({ status: 'Active' })
            .eq('stripe_subscription_id', subscriptionId);
        }
        break;
      }
      default:
        console.log(`ℹ️ Webhook: Unhandled event type ${event.type}`);
    }
  } catch (err) {
    console.error(`Error processing webhook event ${event.type}:`, err);
    return response.status(500).send('Webhook processing failed');
  }

  response.status(200).send('received');
});

export default router;
