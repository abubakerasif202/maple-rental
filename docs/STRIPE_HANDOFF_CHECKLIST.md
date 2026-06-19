# Stripe Handoff Checklist

Use this checklist before handing Aurora Rentals over to a client or switching from sandbox to production.

## Required environment variables

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `CHECKOUT_LINK_SECRET`
- `APP_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

Recommended for automatic activation:

- `SUPABASE_DB_URL` or `DATABASE_URL`

## Required Stripe behavior

- Checkout runs in `subscription` mode.
- The app creates hosted Checkout Sessions on the server.
- Rental activation depends on Stripe webhooks hitting `POST /api/stripe/webhook`.
- Automatic activation requires a session-capable Postgres connection on port `5432`.
- Without that direct Postgres connection, successful payments fall back to `Payment Review` instead of automatic rental activation.

## Pre-handover commands

Run these from the repository root:

```bash
npm run validate
npm run verify:schema-contract
npm run stripe:handoff
```

Expected results:

- `npm run validate` passes.
- `npm run verify:schema-contract` passes with no missing columns.
- `npm run stripe:handoff` returns `overallStatus: "pass"` for full automatic activation, or `overallStatus: "warn"` if manual-review mode is the only remaining non-live issue.

If the schema check fails because `stripe_webhook_events` is missing `status` or `received_at`, run:

```bash
npm run migrate:stripe-webhook-ledger
```

## Stripe dashboard checks

- Confirm the correct account is selected.
- Confirm the API keys used by the deployment are current and unexpired.
- Confirm the production webhook endpoint exists and points to:
  - `https://<your-domain>/api/stripe/webhook`
- Confirm the webhook endpoint is subscribed to:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `checkout.session.expired`
  - `invoice.payment_failed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Confirm the reusable catalog exists:
  - `Security Bond`
  - `Onboarding setup fees`
  - `Weekly vehicle rental`

## App-level checks

- `APP_URL` matches the final public domain exactly.
- `/api/health` returns:

```json
{
  "status": "ok",
  "paymentActivationMode": "transactional"
}
```

If the deployment intentionally runs without a session-capable Postgres connection, expect `paymentActivationMode: "restricted"` and verify the team is prepared to process paid applications from `Payment Review`.

- Payment links open the correct public `/checkout/:carId` URL.
- Successful Checkout redirects back to `/success` on the same domain.
- A successful payment creates or updates the rental and stores Stripe customer and subscription IDs.
- Failed recurring invoices move rentals to `Overdue`.
- Subscription deletion updates the rental state and releases the vehicle when appropriate.

## Test before go-live

- Complete one successful sandbox Checkout flow.
- Confirm the webhook is received and processed once.
- Confirm replayed webhook deliveries do not duplicate activation.
- Confirm the rental moves to `Active`.
- Confirm the customer receives the expected email if `RESEND_API_KEY` is configured.
- Confirm admin financials can load Stripe payouts if that feature is expected in the handoff.

## Go-live notes

- Rotate any development-era Stripe keys before launch.
- Do not reuse sandbox products, prices, or webhook endpoints in live mode.
- Do not change the pinned Stripe API version without retesting checkout and webhook flows.
- Keep a copy of the Stripe dashboard API keys page and webhook endpoint settings in the client handoff pack.
