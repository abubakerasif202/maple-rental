# Maple Rentals Production Handoff

Generated: 2026-05-12

## 1. Current Project Status

Local production readiness checks are clean after the fixes in this handoff pass:

- Frontend production build passes through Vite.
- Server TypeScript production compile passes through `tsc -p tsconfig.server.json`.
- Repository TypeScript check passes through `npm run lint`.
- Unit/integration test suite passes.
- `npm run validate` passes.
- `npm audit --omit=dev` reports zero production vulnerabilities.
- No live Stripe/Supabase/API secrets were found in the repository scan.

Verdict: handoff-ready from local code, build, and test validation. Production deployment should wait until the manual environment, webhook, and database checklist below is completed against live services.

## 2. What Was Tested

- Package scripts and Render build/start configuration.
- Required environment variable surface in `.env.example` and `render.yaml`.
- Express API route registration, including health, live, applications, admin, rentals, agreements, toll notices, inquiries, and Stripe routes.
- Frontend route surface for public pages, admin pages, checkout, and success recovery.
- Supabase migration inventory through `supabase/migrations/20260509090000_add_agreement_templates.sql`.
- Stripe Checkout session creation, session status recovery, webhook signature verification, webhook event handling, pending/BECS states, completed session expiry avoidance, and idempotent activation tests.
- Admin protection on agreement, application, rental, customer, invoice, financial, toll notice, and payment-link routes.
- Application submission and upload flow tests.
- Health endpoints: `/api/live` and `/api/health`.
- Secret-pattern scan for Stripe and Supabase credential patterns.
- Production dependency audit with `npm audit --omit=dev`.
- Supabase changelog review for current platform notices: https://supabase.com/changelog.md.

## 3. What Was Fixed

- Fixed a race in application cancellation where the route used a manual payment-state update and could continue into Stripe inspection after another request changed `payment_link_version`.
- The cancellation route now uses the schema-compatible optimistic helper and returns `409 Conflict` when payment details change mid-cancel.
- Added a regression test proving a mid-cancel payment version change does not call Stripe session, checkout, or subscription APIs.
- Extended the payment-state write payload type to cover cancellation fields already supported by the schema compatibility mapper.

## 4. Remaining Warnings

- `npm run typecheck` is not defined. In this repository, `npm run lint` runs `tsc --noEmit` and is the effective typecheck.
- Production schema verification was not run against live Supabase because real `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` values are not present locally. Run `npm run verify:schema-contract` in a secure production-like environment before deploy.
- Render deployment was not triggered in this pass.
- The repo pins Node 20 through `.nvmrc` and package engines. Supabase published a Node 20 deprecation notice on 2026-05-08; no code change was made because the current Render/build path passes, but Node 22 migration should be scheduled.

## 5. Required Production Env Vars

Set real values in Render or the production secret store. Do not commit these values.

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `CHECKOUT_LINK_SECRET`
- `APP_URL`
- `ADMIN_EMAIL`
- `JWT_SECRET`
- `VITE_API_BASE_URL`
- `VITE_STRIPE_PUBLIC_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional or legacy-supported values to confirm intentionally:

- `SUPABASE_DB_URL`
- `FRONTEND_URL`
- `CORS_ORIGIN`
- `RESEND_API_KEY`
- `INDEXNOW_API_KEY`
- `INDEXNOW_KEY_LOCATION`
- `SITE_URL`
- `LEASE_STATE`
- `LEASE_TIMEZONE`
- `LEASE_LATE_FEE_AMOUNT`
- `LEASE_LATE_FEE_GRACE_DAYS`
- `LEASE_LATE_FEE_CAP_AMOUNT`
- `LEASE_OVERDUE_NOTICE_DAYS`

## 6. Stripe Webhook Setup Checklist

- Endpoint URL: `https://<production-domain>/api/stripe/webhook`.
- Use the live `STRIPE_SECRET_KEY` in the API service.
- Set `STRIPE_WEBHOOK_SECRET` from the live webhook endpoint signing secret.
- Ensure webhook signature verification remains enabled; do not proxy or parse the raw webhook body before Stripe verification.
- Subscribe the endpoint to:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `checkout.session.expired`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Confirm Checkout metadata includes `application_id`, `checkout_kind=vehicle`, and `payment_link_version`; vehicle registration remains application text and `car_id` is never sent.
- Confirm BECS or asynchronous payment methods show processing until Stripe reports success or failure.
- Confirm paid completed sessions are never expired during retry/cleanup.
- Confirm payment activation remains idempotent for duplicate or replayed webhooks.

## 7. Render Deployment Checklist

- Confirm Render uses `npm ci --include=dev && npm run validate && npm run build` as the build command.
- Confirm Render uses `npm start` as the start command.
- Confirm health path is `/api/health`.
- Confirm `NODE_ENV=production`.
- Confirm `DATABASE_URL` points to a session-capable Render Postgres connection for transactional payment activation.
- Do not point payment activation at a Supabase transaction pooler connection.
- Confirm all required env vars in section 5 are set on the API/web service before deploy.
- Deploy only after `npm run verify:schema-contract` passes against the target production schema.

## 8. Database/Migration Checklist

- Apply all Supabase migrations through `20260509090000_add_agreement_templates.sql`.
- Verify the `applications` table has payment link, checkout session, Stripe customer/subscription, cancellation, agreement, and template version columns expected by the API.
- Verify the `rentals` table has Stripe customer/subscription/session identifiers used by webhook subscription lifecycle handling.
- Verify the `stripe_webhook_events` table has the current ledger columns used for claiming, status, retry, and fulfillment tracking.
- Verify agreement template tables exist and the active template version persists.
- Verify toll transfer notice tables and send metadata columns exist.
- Verify Supabase storage buckets for application uploads are private and service-role accessible.
- Verify the private application-document bucket remains service-role accessible.

## 9. Manual Smoke Test Checklist

- `GET /api/live` returns 200.
- `GET /api/health` returns 200 in production with Supabase and direct Postgres reachable.
- Legacy vehicle listing URLs redirect to the application flow.
- Application submission succeeds with required uploads.
- Admin login succeeds only for authorized admin users.
- Admin dashboard loads applications, rentals, customers, invoices, agreements, and toll notices without missing-data crashes.
- Admin approval creates a Stripe checkout link/session.
- Stripe card checkout returns to success and shows paid/activated or manual review when appropriate.
- BECS/asynchronous checkout returns to success and shows processing, not failed, until Stripe settles.
- Stripe webhook delivery succeeds from the Stripe dashboard or Stripe CLI.
- Duplicate webhook delivery is idempotent.
- Agreement generation saves and displays the correct active template version.
- Toll notice endpoints remain admin-only.
- Application cancellation returns conflict if the payment link version changes during cancel.

## 10. Final Go/No-Go Verdict

Go for engineering handoff. Local code validation is clean and the discovered blocker was fixed with a regression test.

No-go for production deploy until these manual checks are completed:

- Production env vars are present in Render.
- Live Stripe webhook endpoint and signing secret are configured.
- Production database migrations are applied.
- `npm run verify:schema-contract` passes with production Supabase credentials.
- Manual smoke tests pass against the deployed service.
