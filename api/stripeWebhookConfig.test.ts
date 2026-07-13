import { describe, expect, it } from 'vitest';

import {
  EXPECTED_STRIPE_WEBHOOK_EVENTS,
  getMissingStripeWebhookEvents,
} from './stripeWebhookConfig.js';

describe('getMissingStripeWebhookEvents', () => {
  it('accepts the complete Maple webhook event set', () => {
    expect(
      getMissingStripeWebhookEvents(EXPECTED_STRIPE_WEBHOOK_EVENTS)
    ).toEqual([]);
  });

  it('returns only required events that are absent', () => {
    expect(
      getMissingStripeWebhookEvents(['checkout.session.completed'])
    ).toEqual(
      EXPECTED_STRIPE_WEBHOOK_EVENTS.filter(
        (eventName) => eventName !== 'checkout.session.completed'
      )
    );
  });

  it('accepts a wildcard event subscription', () => {
    expect(getMissingStripeWebhookEvents(['*'])).toEqual([]);
  });
});
