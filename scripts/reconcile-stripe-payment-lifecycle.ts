import '../scripts/load-env.js';
import Stripe from 'stripe';

import { db } from '../api/db/index.js';
import { getStripeClient } from '../api/stripeClient.js';
import { persistVerifiedStripeRelationship } from '../api/paymentLifecycle.js';

const apply = process.argv.includes('--apply');
const stripe: Stripe = getStripeClient();

type Result = { status: 'matched' | 'already linked' | 'ambiguous' | 'missing' | 'safe to activate'; applicationId?: string; subscriptionId?: string; reason?: string };

const run = async () => {
  const results: Result[] = [];
  for await (const subscription of stripe.subscriptions.list({ status: 'all', limit: 100 })) {
    if (subscription.metadata?.checkout_kind !== 'vehicle') continue;
    const subscriptionId = subscription.id;
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || null;
    let applicationId = subscription.metadata?.application_id || null;
    let checkoutSessionId: string | null = null;
    const sessions = await stripe.checkout.sessions.list({ subscription: subscriptionId, limit: 10 });
    const matchingSessions = sessions.data.filter((session) =>
      session.mode === 'subscription' &&
      session.payment_status === 'paid' &&
      session.metadata?.checkout_kind === 'vehicle' &&
      (!applicationId || session.metadata?.application_id === applicationId));
    if (matchingSessions.length === 1) {
      checkoutSessionId = matchingSessions[0].id;
      applicationId = matchingSessions[0].metadata?.application_id || applicationId;
    } else if (matchingSessions.length > 1) {
      results.push({ status: 'ambiguous', subscriptionId, reason: 'Multiple paid vehicle Checkout Sessions match this subscription.' });
      continue;
    }
    if (!applicationId || !customerId) {
      results.push({ status: 'missing', subscriptionId, reason: 'Trusted Stripe metadata/session did not provide application or customer identity.' });
      continue;
    }
    const { data: application, error } = await db.from('applications').select('id, status, approved_vehicle, approved_weekly_price, stripe_subscription_id, stripe_customer_id').eq('id', applicationId).maybeSingle();
    if (error || !application) {
      results.push({ status: 'missing', applicationId, subscriptionId, reason: 'Application metadata does not resolve to a current application.' });
      continue;
    }
    if (application.stripe_subscription_id && application.stripe_subscription_id !== subscriptionId) {
      results.push({ status: 'ambiguous', applicationId, subscriptionId, reason: 'Application is already linked to another subscription.' });
      continue;
    }
    const status: Result['status'] = application.stripe_subscription_id ? 'already linked' : 'matched';
    if (apply) await persistVerifiedStripeRelationship({ applicationId, checkoutSessionId, customerId, subscriptionId });
    results.push({ status, applicationId, subscriptionId });
    if (application.status === 'Paid' && application.approved_vehicle && Number(application.approved_weekly_price) > 0 && !['canceled', 'incomplete_expired'].includes(subscription.status)) {
      results.push({ status: 'safe to activate', applicationId, subscriptionId });
    }
  }
  const counts = results.reduce<Record<string, number>>((all, result) => ({ ...all, [result.status]: (all[result.status] || 0) + 1 }), {});
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', counts, results }, null, 2));
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Stripe lifecycle reconciliation failed');
  process.exitCode = 1;
});
