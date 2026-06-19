# Stripe Setup

This app uses Stripe Checkout in `subscription` mode for approved rental applications.

The shared Stripe client configuration is pinned to API version `2025-04-30.basil`.

## Runtime model

- The server creates Checkout Sessions dynamically from the approved bond and weekly rental price.
- The app now uses reusable Stripe catalog products instead of creating fresh inline products on each checkout.
- Canonical products are:
  - `Security Bond`
  - `Onboarding setup fees`
  - `Weekly vehicle rental`
- If the optional `STRIPE_*_PRODUCT_ID` environment variables are not set, the server will create or reuse these canonical products automatically in Stripe.

## Commands

Verify the current Stripe account and ensure the reusable catalog exists:

```bash
npm run stripe:setup
```

The JSON summary includes the resolved Stripe account mode, the configured API version, webhook-endpoint checks, and runtime readiness checks.

Run the strict client-handoff gate:

```bash
npm run stripe:handoff
```

This command fails unless all production-critical Stripe checks pass, including:

- live Stripe key mode
- `APP_URL` validity
- expected `/api/stripe/webhook` endpoint registration
- required webhook events
- payment activation mode (`transactional` or manual-review fallback)
- production schema contract readiness

Preview a destructive Stripe test-data reset without making changes:

```bash
npm run stripe:reset
```

The preview and final summary payloads also include the configured API version so you can confirm the reset is running against the expected Stripe contract.

Apply the destructive reset against the configured test account and recreate the canonical catalog:

```bash
ALLOW_STRIPE_RESET=true npm run stripe:reset -- --apply --reseed-catalog
```

## Safety rules

- `stripe:reset` refuses to run with a non-test Stripe key.
- `stripe:reset --apply` also requires `ALLOW_STRIPE_RESET=true`.
- The reset script cancels or archives objects where Stripe does not allow hard deletion.

## Local webhook forwarding

Forward Stripe events to the local app and capture a fresh webhook secret:

```bash
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```

Set the returned signing secret as `STRIPE_WEBHOOK_SECRET`.

## Webhook events consumed

The server handler at `POST /api/stripe/webhook` reacts to:

- `checkout.session.completed` and `checkout.session.async_payment_succeeded` — activate a paid vehicle rental (with idempotent ledger).
- `checkout.session.async_payment_failed` and `checkout.session.expired` — clear the application's `pending_checkout_session_id` when the terminated session still matches the current `payment_link_version`.
- `invoice.payment_failed` — move rentals to `Overdue`.
- `customer.subscription.updated` — reconcile rental status to `Active` or `Overdue`.
- `customer.subscription.deleted` — move rentals to `Completed` or `Cancelled` and release the vehicle when the cancellation was explicit.

Unsubscribed or unrecognised events are logged and acknowledged without side effects.

## QA checklist

Run the following end-to-end before each production release or after any change to checkout, webhook, or activation code:

1. Approve a pending application from the admin dashboard and confirm the applicant email contains a signed `/checkout/:carId?token=...` link.
2. Open the checkout link in an incognito window, complete payment with `4242 4242 4242 4242`, and confirm the redirect lands on `/success?session_id=cs_...&application_id=...` (no `{CHECKOUT_SESSION_ID}` literal in the URL).
3. Confirm the admin applications modal shows the `pending_checkout_session_id` before payment, and the rentals tab exposes `stripe_subscription_id` and `stripe_customer_id` after activation.
4. Replay the completion webhook from the Stripe dashboard and confirm the rental is not duplicated and the ledger row stays `processed`.
5. Start a checkout, close the Stripe page without paying, wait for `checkout.session.expired`, and confirm `pending_checkout_session_id` is cleared for that application.
6. Trigger an `async_payment_failed` (delayed-payment method) and confirm the same clearing behaviour.
7. In Stripe, cancel the test subscription and confirm the rental transitions to `Completed` or `Cancelled` as expected.
8. Confirm `/api/health` returns `paymentActivationMode: "transactional"` in production.

## Deployment notes

- Update the Stripe dashboard webhook endpoint's subscribed events to match the list above whenever `api/routes/webhooks.ts` gains or drops an event handler.
- The webhook endpoint must be mounted with `express.raw({ type: 'application/json' })` — do not move it behind JSON body parsing or signature verification will fail.
- `CHECKOUT_LINK_SECRET`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` must stay in sync across all app instances; rotating any of them without updating every instance will break live checkouts or webhook verification.
- When rotating secrets, drain in-flight checkouts first: pause approvals, wait for pending sessions to expire, rotate, and re-enable approvals.
- After any schema change that touches `applications.payment_link_version` or `stripe_webhook_events`, re-run `npm run verify:schema-contract` and `npm run stripe:handoff`.

## Notes

- `scripts/stripe_demo.py` is a legacy API demo that intentionally creates test objects. It is not part of the Aurora Rentals checkout setup.
- If you need a truly pristine Stripe environment, prefer a fresh Stripe sandbox in the Dashboard instead of reusing a polluted long-lived test account.
