import '../scripts/load-env.js';
import type Stripe from 'stripe';

import { db } from '../api/db/index.js';
import {
  ACTIVATION_ELIGIBLE_SUBSCRIPTION_STATUSES,
  persistVerifiedStripeRelationship,
} from '../api/paymentLifecycle.js';
import { getSchemaCompat } from '../api/schemaCompat.js';
import { discoverRelationshipFromSessions } from '../api/stripeLifecycleDiscovery.js';
import { getStripeClient } from '../api/stripeClient.js';

/**
 * Reconcile Stripe subscriptions that started before the operational lifecycle
 * bridge existed.
 *
 * Dry run (default) performs ZERO database writes.
 * `--apply` persists trusted identity links only. It never activates a rental,
 * never cancels or modifies a Stripe object, and never touches billing.
 */

const shouldApply = process.argv.includes('--apply');
const stripe = getStripeClient();

type Classification =
  | 'already_linked'
  | 'ambiguous'
  | 'eligible_for_activation'
  | 'manual_review'
  | 'matched'
  | 'missing'
  | 'unsafe_subscription_state';

type ReconciliationResult = {
  activationEligible: boolean;
  applicationId: string | null;
  applicationStatus: string | null;
  checkoutSessionId: string | null;
  classification: Classification;
  linked: boolean;
  reason: string;
  stripeCustomerId: string | null;
  subscriptionId: string;
  subscriptionStatus: string;
};

const stripeObjectId = (value: string | { id?: string } | null | undefined) =>
  typeof value === 'string' ? value : value?.id || null;

const discoverRelationship = async (subscription: Stripe.Subscription) => {
  const sessions = await stripe.checkout.sessions.list({
    limit: 100,
    subscription: subscription.id,
  });

  return discoverRelationshipFromSessions(subscription, sessions.data);
};

const run = async () => {
  const compat = await getSchemaCompat();
  const results: ReconciliationResult[] = [];

  for await (const subscription of stripe.subscriptions.list({
    limit: 100,
    status: 'all',
  })) {
    const subscriptionId = subscription.id;
    const subscriptionStatus = String(subscription.status);
    const stripeCustomerId = stripeObjectId(subscription.customer);

    const base = {
      activationEligible: false,
      applicationId: null as string | null,
      applicationStatus: null as string | null,
      checkoutSessionId: null as string | null,
      linked: false,
      stripeCustomerId,
      subscriptionId,
      subscriptionStatus,
    };

    const discovery = await discoverRelationship(subscription);

    if (discovery.ambiguous) {
      results.push({
        ...base,
        classification: 'ambiguous',
        reason: discovery.reason,
      });
      continue;
    }

    if (!discovery.applicationId || !stripeCustomerId) {
      results.push({
        ...base,
        checkoutSessionId: discovery.checkoutSessionId,
        classification: 'missing',
        reason:
          'No trusted vehicle Checkout Session or subscription metadata resolved an application and customer.',
      });
      continue;
    }

    const applicationId = discovery.applicationId;
    const { data: application, error } = await db
      .from('applications')
      .select(
        [
          'id',
          'status',
          'stripe_customer_id',
          'stripe_subscription_id',
          `approved_vehicle:${compat.applicationApprovedVehicleColumn}`,
          `approved_weekly_price:${compat.applicationApprovedWeeklyPriceColumn}`,
          `intended_start_date:${compat.applicationIntendedStartDateColumn}`,
          `payment_link_version:${compat.applicationPaymentLinkVersionColumn}`,
        ].join(', ')
      )
      .eq('id', applicationId)
      .maybeSingle();

    if (error) {
      results.push({
        ...base,
        applicationId,
        checkoutSessionId: discovery.checkoutSessionId,
        classification: 'manual_review',
        reason: `Failed to read the application: ${error.message || 'Unknown error'}`,
      });
      continue;
    }

    if (!application) {
      results.push({
        ...base,
        applicationId,
        checkoutSessionId: discovery.checkoutSessionId,
        classification: 'missing',
        reason: 'Trusted Stripe metadata does not resolve to a current application.',
      });
      continue;
    }

    const record = application as unknown as {
      approved_vehicle?: string | null;
      approved_weekly_price?: number | string | null;
      intended_start_date?: string | null;
      payment_link_version?: number | null;
      status?: string | null;
      stripe_customer_id?: string | null;
      stripe_subscription_id?: string | null;
    };

    const applicationStatus = String(record.status || '');
    const withApplication = {
      ...base,
      applicationId,
      applicationStatus,
      checkoutSessionId: discovery.checkoutSessionId,
    };

    if (
      record.stripe_subscription_id &&
      record.stripe_subscription_id !== subscriptionId
    ) {
      results.push({
        ...withApplication,
        classification: 'ambiguous',
        reason: 'The application is already linked to a different Stripe subscription.',
      });
      continue;
    }

    const currentPaymentLinkVersion = Number(record.payment_link_version || 0);
    if (
      discovery.paymentLinkVersion > 0 &&
      discovery.paymentLinkVersion !== currentPaymentLinkVersion
    ) {
      results.push({
        ...withApplication,
        classification: 'manual_review',
        reason: `The paid Checkout Session is on payment link version ${discovery.paymentLinkVersion} but the application is on version ${currentPaymentLinkVersion}.`,
      });
      continue;
    }

    if (applicationStatus === 'Cancelled') {
      results.push({
        ...withApplication,
        classification: 'manual_review',
        reason: 'The application is Cancelled and must not become an operational customer.',
      });
      continue;
    }

    const alreadyLinked = Boolean(
      record.stripe_subscription_id && record.stripe_customer_id
    );

    // Activation eligibility is reported, never acted on.
    const hasApprovedVehicle = Boolean(String(record.approved_vehicle || '').trim());
    const hasApprovedPrice = Number(record.approved_weekly_price || 0) > 0;
    const subscriptionEligible =
      ACTIVATION_ELIGIBLE_SUBSCRIPTION_STATUSES.has(subscriptionStatus);

    let classification: Classification = alreadyLinked ? 'already_linked' : 'matched';
    let reason = alreadyLinked
      ? 'Identity is already persisted.'
      : 'Trusted identity resolved and ready to link.';
    let activationEligible = false;

    if (!subscriptionEligible) {
      classification = 'unsafe_subscription_state';
      reason = `Stripe subscription status "${subscriptionStatus}" is not eligible for rental activation.`;
    } else if (
      applicationStatus === 'Paid' &&
      hasApprovedVehicle &&
      hasApprovedPrice
    ) {
      classification = 'eligible_for_activation';
      activationEligible = true;
      reason = alreadyLinked
        ? 'Paid, linked, and safe for an admin to activate.'
        : 'Paid and safe for an admin to activate once identity is linked.';
    }

    let linked = alreadyLinked;
    // Ambiguous and missing relationships already returned above, so anything
    // reaching here has a single trusted application/customer resolution.
    //
    // A subscription in an unsafe state (canceled, unpaid, incomplete, paused)
    // is not a live operational relationship, so reconciliation records nothing
    // for it. Linking it would surface a dead subscription in the admin
    // activation queue, and for an application that never reached verified
    // payment it would assert an operational customer that does not exist.
    // Such records are reported for manual review instead.
    const writable = classification !== 'unsafe_subscription_state';
    if (shouldApply && !alreadyLinked && writable) {
      // --apply links identity only. It never activates a rental.
      try {
        await persistVerifiedStripeRelationship({
          applicationId,
          checkoutSessionId: discovery.checkoutSessionId,
          customerId: stripeCustomerId,
          paymentLinkVersion: currentPaymentLinkVersion,
          subscriptionId,
        });
        linked = true;
      } catch (linkError) {
        results.push({
          ...withApplication,
          activationEligible: false,
          classification: 'manual_review',
          reason: `Linking failed: ${linkError instanceof Error ? linkError.message : 'Unknown error'}`,
        });
        continue;
      }
    }

    results.push({
      ...withApplication,
      activationEligible,
      classification,
      linked,
      reason,
    });
  }

  const counts = results.reduce<Record<string, number>>(
    (all, result) => ({
      ...all,
      [result.classification]: (all[result.classification] || 0) + 1,
    }),
    {}
  );

  console.log(
    JSON.stringify(
      {
        activationEligibleCount: results.filter((r) => r.activationEligible).length,
        counts,
        mode: shouldApply ? 'apply' : 'dry-run',
        note: shouldApply
          ? 'Identity links persisted. No rental was activated and no Stripe object was modified.'
          : 'No database writes were performed.',
        results,
        subscriptionsInspected: results.length,
      },
      null,
      2
    )
  );
};

run().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Stripe lifecycle reconciliation failed'
  );
  process.exitCode = 1;
});
