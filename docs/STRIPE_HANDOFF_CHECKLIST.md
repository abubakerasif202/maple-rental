# Stripe Handoff Checklist

Use this checklist before handing Maple Rental over to a client or switching from sandbox to production.

## Required environment variables

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `CHECKOUT_LINK_SECRET`
- `APP_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

Recommended for transactional payment recording:

- `SUPABASE_DB_URL` or `DATABASE_URL`

## Required Stripe behavior

- Checkout runs in `subscription` mode.
- The app creates hosted Checkout Sessions on the server.
- Stripe webhooks hit `POST /api/stripe/webhook` and mark the application `Paid` only.
- Checkout completion never creates rental rows or changes vehicle status, including for legacy Stripe metadata containing `car_id`.
- A session-capable Postgres connection on port `5432` provides transactional payment recording and replay protection.

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
- `npm run stripe:handoff` is read-only and returns `overallStatus: "pass"` when production-critical checks pass.

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
  - `customer.subscription.created`
  - `invoice.payment_failed`
  - `invoice.payment_succeeded`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Confirm the reusable catalog exists:
  - `Weekly vehicle rental`
- Confirm the webhook endpoint API version matches `2026-04-22.dahlia`.
- Review any secondary webhook endpoint receiving the same payment events and confirm it cannot duplicate Maple business side effects.

## App-level checks

- `APP_URL` matches the final public domain exactly.
- `/api/health` returns:

```json
{
  "status": "ok",
  "paymentActivationMode": "transactional"
}
```

If the deployment intentionally runs without a session-capable Postgres connection, expect `paymentActivationMode: "restricted"`; payment-only completion remains available but loses transactional locking.

- Payment links open the correct public `/checkout/:applicationId#checkout_token=...` URL.
- Successful Checkout redirects back to `/success` on the same domain.
- A successful Checkout marks the application `Paid` only and clears `pending_checkout_session_id`.
- No Checkout completion creates or updates rentals or cars.
- Failed recurring invoices move rentals to `Overdue`.
- Subscription deletion updates the rental state and releases the vehicle when appropriate.

## Test before go-live

- Complete one successful sandbox Checkout flow.
- Confirm the webhook is received and processed once.
- Confirm replayed webhook deliveries do not duplicate payment writes or mutate rentals/cars.
- Confirm the application moves to `Paid` without creating a rental or changing vehicle status.
- Confirm the customer receives the expected email if `RESEND_API_KEY` is configured.
- Confirm admin financials can load Stripe payouts if that feature is expected in the handoff.

## Go-live notes

- Rotate any development-era Stripe keys before launch.
- Do not reuse sandbox products, prices, or webhook endpoints in live mode.
- Do not change the pinned Stripe API version without retesting checkout and webhook flows.
- Keep a copy of the Stripe dashboard API keys page and webhook endpoint settings in the client handoff pack.
