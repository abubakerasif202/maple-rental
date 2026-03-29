import 'dotenv/config';
import { env } from '../server/src/config/env.js';
import { logger } from '../server/src/lib/logger.js';
import { stripe } from '../server/src/lib/stripe.js';
import { supabaseAdmin } from '../server/src/lib/supabase.js';
import { handleInvoicePaid } from '../server/src/services/subscriptionService.js';
import { updateDriver } from '../server/src/services/driverService.js';

const nowIso = new Date().toISOString();

const run = async () => {
  const { data: failedPayments, error } = await supabaseAdmin
    .from('payments')
    .select('*, subscriptions(vehicle_id)')
    .eq('status', 'failed')
    .lte('next_retry_at', nowIso)
    .lt('retry_count', env.PAYMENT_RETRY_LIMIT);

  if (error) {
    throw error;
  }

  let recovered = 0;
  let disabled = 0;

  for (const payment of failedPayments || []) {
    try {
      const invoice = await stripe.invoices.pay(payment.stripe_invoice_id);
      if (invoice.status === 'paid') {
        await handleInvoicePaid(invoice);
        recovered += 1;
        continue;
      }
      throw new Error(`Invoice retry returned status ${invoice.status}`);
    } catch (paymentError) {
      const nextRetryCount = Number(payment.retry_count || 0) + 1;
      const exhaustedRetries = nextRetryCount >= env.PAYMENT_RETRY_LIMIT;

      await Promise.all([
        supabaseAdmin
          .from('payments')
          .update({
            retry_count: nextRetryCount,
            next_retry_at: exhaustedRetries
              ? null
              : new Date(
                  Date.now() + env.PAYMENT_RETRY_DELAY_HOURS * 60 * 60 * 1000,
                ).toISOString(),
            failure_message:
              paymentError instanceof Error ? paymentError.message : 'Stripe retry failed',
          })
          .eq('id', payment.id),
        supabaseAdmin
          .from('subscriptions')
          .update({ status: exhaustedRetries ? 'unpaid' : 'past_due' })
          .eq('id', payment.subscription_id),
      ]);

      if (exhaustedRetries) {
        await Promise.all([
          updateDriver(payment.driver_id, { status: 'disabled', current_vehicle_id: null }),
          payment.subscriptions?.vehicle_id
            ? supabaseAdmin
                .from('vehicles')
                .update({ status: 'available' })
                .eq('id', payment.subscriptions.vehicle_id)
            : Promise.resolve(null),
        ]);
        disabled += 1;
      }
    }
  }

  logger.info(`retryPayments completed`, {
    recovered,
    disabled,
    attempted: failedPayments?.length || 0,
  });
};

run().catch((error) => {
  logger.error('retryPayments failed', error);
  process.exit(1);
});
