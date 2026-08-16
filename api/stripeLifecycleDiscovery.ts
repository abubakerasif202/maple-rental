import type Stripe from 'stripe';

import { normalizeUuid } from '../shared/uuid.js';

/**
 * Trusted discovery of the application relationship behind a Stripe
 * subscription, used by lifecycle reconciliation.
 *
 * Subscription metadata is used when present but is deliberately NOT required.
 * Subscriptions created before metadata was propagated to the subscription
 * object carry the trusted `application_id`, `checkout_kind` and
 * `payment_link_version` only on their Checkout Session, so discovery always
 * inspects Checkout Sessions.
 *
 * This function performs no database access and no writes.
 */

export type DiscoveredRelationship =
  | { ambiguous: true; reason: string }
  | {
      ambiguous: false;
      applicationId: string | null;
      checkoutSessionId: string | null;
      paymentLinkVersion: number;
    };

export const discoverRelationshipFromSessions = (
  subscription: Pick<Stripe.Subscription, 'metadata'>,
  sessions: Array<Pick<Stripe.Checkout.Session, 'id' | 'metadata' | 'mode' | 'payment_status'>>
): DiscoveredRelationship => {
  const metadataApplicationId = normalizeUuid(
    subscription.metadata?.application_id || ''
  );

  const vehicleSessions = sessions.filter(
    (session) =>
      session.mode === 'subscription' &&
      session.payment_status === 'paid' &&
      session.metadata?.checkout_kind === 'vehicle' &&
      Boolean(normalizeUuid(session.metadata?.application_id || ''))
  );

  const distinctApplicationIds = new Set(
    vehicleSessions.map((session) =>
      normalizeUuid(session.metadata?.application_id || '')
    )
  );

  if (distinctApplicationIds.size > 1) {
    return {
      ambiguous: true,
      reason: `Checkout Sessions for this subscription reference ${distinctApplicationIds.size} different applications.`,
    };
  }

  const session = vehicleSessions[0] || null;
  const sessionApplicationId = session
    ? normalizeUuid(session.metadata?.application_id || '')
    : '';

  if (
    metadataApplicationId &&
    sessionApplicationId &&
    metadataApplicationId !== sessionApplicationId
  ) {
    return {
      ambiguous: true,
      reason:
        'Subscription metadata and Checkout Session metadata reference different applications.',
    };
  }

  return {
    ambiguous: false,
    applicationId: sessionApplicationId || metadataApplicationId || null,
    checkoutSessionId: session?.id || null,
    paymentLinkVersion: Number(
      session?.metadata?.payment_link_version ||
        subscription.metadata?.payment_link_version ||
        0
    ),
  };
};
