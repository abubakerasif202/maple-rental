export const EXPECTED_STRIPE_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
] as const;

export const getMissingStripeWebhookEvents = (
  enabledEvents: readonly string[]
) =>
  enabledEvents.includes('*')
    ? []
    : EXPECTED_STRIPE_WEBHOOK_EVENTS.filter(
        (eventName) => !enabledEvents.includes(eventName)
      );
