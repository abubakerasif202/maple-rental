import { Router } from 'express';
import { stripe } from '../lib/stripe.js';
import { env } from '../config/env.js';
import {
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionDeleted,
} from '../services/subscriptionService.js';

const router = Router();

router.post('/', async (request, response, next) => {
  try {
    const signature = request.headers['stripe-signature'];
    if (!signature || Array.isArray(signature)) {
      response.status(400).send('Missing Stripe signature');
      return;
    }

    const event = stripe.webhooks.constructEvent(
      request.body,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );

    if (event.type === 'invoice.paid') {
      await handleInvoicePaid(event.data.object);
    }

    if (event.type === 'invoice.payment_failed') {
      await handleInvoicePaymentFailed(event.data.object);
    }

    if (event.type === 'customer.subscription.deleted') {
      await handleSubscriptionDeleted(event.data.object);
    }

    response.json({ received: true, type: event.type });
  } catch (error) {
    next(error);
  }
});

export default router;
