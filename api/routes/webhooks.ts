import express from 'express';
import Stripe from 'stripe';
import { db } from '../db/index.js';
import { STRIPE_CONFIG } from '../constants.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', STRIPE_CONFIG);

router.post('/', express.raw({ type: 'application/json' }), async (request, response) => {
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
