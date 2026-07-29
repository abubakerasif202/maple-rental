# Maple Rental

Maple Rental is a single-service full-stack rental platform for weekly vehicle rentals. Vehicles are identified operationally by registration text rather than a separate fleet catalogue. The same Express process serves the API and the built React/Vite frontend in production.

Client-ready deployment notes are documented in [docs/CLIENT_HANDOFF.md](docs/CLIENT_HANDOFF.md).
Canonical engineering contracts are in
[payment lifecycle](docs/architecture/payment-lifecycle.md),
[security model](docs/security-model.md), and
[deployment safety](docs/deployment.md).
Stripe operational setup and reset steps remain in [docs/STRIPE_SETUP.md](docs/STRIPE_SETUP.md).

## Executive Summary

- Public users can submit applications, upload driver documents, and receive a payment link after admin review.
- Admin users can review applications, record a registration number, manage payment status, inspect customer and invoice history, and work with lease agreements.
- Supabase provides auth and private document storage.
- Transactional app data and Stripe/payment state use a session-capable direct connection to the same Supabase PostgreSQL database exposed through `SUPABASE_URL`.
- Render deploys the app as one Node web service.

## Stack

- Frontend: React 19, Vite, React Router, TanStack Query, Tailwind CSS
- Backend: Express, TypeScript
- Data: Direct PostgreSQL for transactional state, Supabase Auth, Supabase Storage
- Payments: Stripe
- Email: Resend
- Deployment: Render

## Runtime Architecture

### Development

- `npm run dev` starts the Express server through `tsx watch`.
- In development, Express mounts Vite in middleware mode.
- The full app runs from one local origin: `http://localhost:3000`.

### Production

- `npm run build` builds the Vite client into `dist/` and the server into `server-dist/`.
- `npm start` runs `node server-dist/api/index.js`.
- Express serves `/api/*` routes directly.
- Express serves built static assets from `dist/`.
- Non-API SPA routes fall back to `dist/index.html`.
- Health checks are exposed at `/api/health`.

## Direct Database And Payments

- Stripe checkout activation requires `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CHECKOUT_LINK_SECRET`, `APP_URL`, `ADMIN_EMAIL`, and `JWT_SECRET`.
- Supabase storage and auth require `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
- Direct Postgres uses `DATABASE_URL` as the primary connection string and falls back to `SUPABASE_DB_URL` only when `DATABASE_URL` is not set.
- `paymentActivationMode` is `transactional` only when the selected direct Postgres connection is session-capable. Transaction-pooler or missing direct DB config leaves the app in `restricted` mode.
- Checkout and subscription links are generated through the existing routes:
  - `POST /api/applications/:id/approve-payment`
  - `POST /api/stripe/vehicle-checkout-link`
  - `POST /api/stripe/vehicle-checkout-session`
- The hosted checkout session remains Stripe Checkout in `subscription` mode with:
  - one recurring rental line item for the approved weekly charge
  - no bond or setup-fee charge; bond handling remains manual
- Stripe checkout recovery and state resolution use:
  - `GET /api/stripe/payment-context`
  - `GET /api/stripe/checkout-sessions/:sessionId`
  - `POST /api/stripe/webhook`

## Routes

### Public

- `/`
- `/pricing`
- `/cars` (legacy redirect to `/apply`)
- `/cars/:id` (legacy redirect to `/apply`)
- `/apply`
- `/checkout/:id`
- `/success`

### Admin

- `/admin/login`
- `/admin/dashboard`

### API

- `/api/auth`
- `/api/applications`
- `/api/inquiries`
- `/api/stripe`
- `/api/rentals`
- `/api/agreements`
- `/api/financials`
- `/api/customers`
- `/api/invoices`
- `/api/health`

## Local Development

### Prerequisites

- Node.js 20.x
- A Supabase project
- A Stripe account for checkout and webhooks

### Install

```bash
npm ci
```

### Configure environment variables

Copy `.env.example` to `.env.local` and fill in the values.

The server loads `.env` first and then `.env.local` in non-production environments.

Minimum local variables:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
ADMIN_EMAIL=admin@maplerentals.com.au
CHECKOUT_LINK_SECRET=replace_with_a_long_random_secret
JWT_SECRET=replace_with_a_long_random_secret
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=http://localhost:3000
SITE_URL=http://localhost:3000
LEASE_OWNER_NAME=Maple Rentals
LEASE_OWNER_ADDRESS=13/27-33 Addlestone Rd, Merrylands NSW 2160
LEASE_OWNER_CONTACT=0420 550 556
LEASE_OWNER_EMAIL=admin@maplerentals.com.au
VITE_API_BASE_URL=/api
```

Recommended for full local parity:

```env
DATABASE_URL=postgresql://...
RESEND_API_KEY=re_...
```

`SUPABASE_DB_URL=postgresql://...` remains supported as a fallback for legacy environments, but `DATABASE_URL` is preferred for local parity and Render deployments.

Stripe payment links and hosted Checkout session creation require a session-capable Postgres connection through `DATABASE_URL` or `SUPABASE_DB_URL`. Verified Checkout completion records the application as `Paid` transactionally; it never changes vehicle status or creates a rental row.

Optional local-only admin shortcut:

```env
ADMIN_PASSWORD=change_me
```

If `ADMIN_PASSWORD` is set in development, the admin login route can issue a local signed admin session without requiring a live Supabase Auth sign-in.

### Prepare Supabase

Base schema and incremental SQL migrations live under `supabase/migrations/`.

Print the base schema SQL:

```bash
node scripts/seed-schema.js
```

Apply additional migrations for existing environments as needed:

```bash
npm run migrate:payment-workflow
npm run migrate:operational-history
```

Also apply any newer SQL files under `supabase/migrations/` for security and integrity updates before handoff.

Create the private storage bucket used for driver documents:

```bash
npx tsx scripts/setup-bucket.ts
```

Create or reset the admin user:

```bash
node scripts/seed-admin.js admin@maplerentals.com.au your-password
node scripts/reset-admin.js admin@maplerentals.com.au new-password
```

### Start development

```bash
npm run dev
```

Stripe setup helpers:

```bash
npm run stripe:setup
npm run stripe:handoff
npm run migrate:stripe-webhook-ledger
npm run stripe:reset
```

Open:

- App: [http://localhost:3000](http://localhost:3000)
- Health: [http://localhost:3000/api/health](http://localhost:3000/api/health)

## Build, Start, and Validate

```bash
npm run lint
npm run test
npm run validate
npm run build
npm start
```

What each command does:

- `npm run dev`: full-stack local development server
- `npm run stripe:setup`: verify the configured Stripe account, check the expected webhook endpoint, and ensure the reusable Stripe catalog exists
- `npm run stripe:handoff`: strict Stripe readiness gate for client handoff; requires a live key, valid webhook setup, and reports whether payment activation is automatic or manual-review
- `npm run migrate:stripe-webhook-ledger`: apply the Stripe webhook event ledger migration when the production schema is missing the webhook processing columns
- `npm run stripe:reset`: preview a destructive Stripe test-data reset
- `npm run lint`: TypeScript type-check plus ESLint with zero warnings
- `npm run test`: Vitest suite
- `npm run validate`: lint plus tests
- `npm run build`: client plus server production build
- `npm start`: compiled production server
- `npm run preview`: Vite preview for the static client bundle only

## Environment Variables

### Required in production

- `APP_URL`
  - Public application origin, for example `https://www.maplerentals.com.au`
- `ADMIN_EMAIL`
  - Single allowed admin email
- `SUPABASE_URL`
  - Must be the HTTPS project URL, not a Postgres URI
- `SUPABASE_ANON_KEY`
  - Required for auth-scoped Supabase operations such as admin sign-in and token verification
- `SUPABASE_SERVICE_ROLE_KEY`
  - Server-side privileged Supabase key
- `CHECKOUT_LINK_SECRET`
  - Secret used to sign secure payment-link tokens
- `JWT_SECRET`
  - Secret used to sign admin session cookies
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

### Required for direct transactional checkout activation

- `DATABASE_URL`
  - Preferred session-capable PostgreSQL connection string for the same Supabase project used by the Data API
- `SUPABASE_DB_URL`
  - Optional fallback only when `DATABASE_URL` is not set
  - Useful for legacy environments that still use a direct Supabase Postgres connection
  - If both are set, the app uses `DATABASE_URL`

### Recommended in production

- `LEASE_OWNER_NAME`
- `LEASE_OWNER_ADDRESS`
- `LEASE_OWNER_CONTACT`
- `LEASE_OWNER_EMAIL`
  - Optional overrides for the default Maple Rentals business details inserted into generated lease agreements
- `RESEND_API_KEY`
  - Transactional email delivery

### Optional

- `SITE_URL`
  - Canonical site URL for IndexNow publication. Falls back to `APP_URL`.
- `FRONTEND_URL`
  - Extra allowed browser origin
- `CORS_ORIGIN`
  - Extra allowed browser origin
- `JSON_BODY_LIMIT`
  - Override the global request body limit. Defaults to `100kb`.
- `/api/applications`
  - Uses a dedicated JSON parser sized for two 7 MB base64 licence uploads; this route is not controlled by `JSON_BODY_LIMIT`
- `INDEXNOW_ENABLED`
- `INDEXNOW_KEY`
- `INDEXNOW_TIMEOUT_MS`
- `INDEXNOW_DEBOUNCE_MS`

## Health Check

`GET /api/health` returns:

- `status`
- `environment`
- `database`
- `directDatabase`
- `paymentActivationMode`

`paymentActivationMode` will be:

- `transactional` when the selected direct database (`DATABASE_URL` first, then `SUPABASE_DB_URL`) is session-capable
- `restricted` outside production when the app is running without a session-capable direct Postgres connection; production health fails closed with HTTP 503 in this state

## Security and Operational Notes

- Express trusts one proxy hop in production so rate limiting works correctly on Render.
- Helmet is enabled in production.
- Global API rate limiting is enabled, plus a stricter limiter on admin login attempts.
- API request bodies are size-limited.
- Admin auth cookies are `httpOnly`, `secure` in production, and `sameSite=strict`.
- Driver licence documents are stored in a private Supabase Storage bucket and served through short-lived signed URLs.
- The server fails fast in production on invalid or missing core config instead of constructing unsafe fallback clients.

## Render + Supabase Storage + Stripe

This repo includes [`render.yaml`](./render.yaml) for a single web-service deployment.

Render runtime contract:

- Build command: `npm ci --include=dev && npm run validate && npm run build`
- Start command: `npm start`
- Health check path: `/api/health`

Recommended Render environment variables:

- `APP_URL`
- `ADMIN_EMAIL`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `CHECKOUT_LINK_SECRET`
- `JWT_SECRET`
- `RESEND_API_KEY` if email delivery is enabled

`render.yaml` pre-populates the `LEASE_OWNER_*` values with the current Maple Rentals business details.
Override them in Render only if those agreement details need to change.

### Render deployment steps

1. Copy a session-capable direct or session-pooler PostgreSQL URL for the same Supabase project used by `SUPABASE_URL`.
2. Deploy the web service from `render.yaml`, then set that URL as `DATABASE_URL` on the service. Do not use a separate Render Postgres database because application reads and writes are server-mediated through the Supabase Data API.
3. Keep the Supabase variables in place for storage and auth: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
4. Set the Stripe secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `CHECKOUT_LINK_SECRET`.
5. Set the app and security variables: `APP_URL`, `ADMIN_EMAIL`, and `JWT_SECRET`.
6. Run the production migrations against the direct database:

```powershell
$env:DATABASE_URL='postgresql://...'
npm run migrate:payment-workflow
npm run migrate:legacy-snake-payment-workflow
npm run migrate:stripe-webhook-ledger
npm run migrate:operational-history
npm run migrate:application-indexes
```

7. Configure the Stripe webhook endpoint to `https://<your-domain>/api/stripe/webhook`, then run `npm run stripe:handoff` against the deployed environment to verify readiness.

## Troubleshooting

### `Invalid supabaseUrl`

`SUPABASE_URL` must be the HTTPS project URL, for example:

```env
SUPABASE_URL=https://your-project.supabase.co
```

Do not paste the Postgres connection string into `SUPABASE_URL`.

### Health endpoint reports `restricted`

Add `DATABASE_URL` with a session-capable direct or session-pooler connection to the same Supabase project as `SUPABASE_URL`. `SUPABASE_DB_URL` remains available as a fallback, but `DATABASE_URL` is the preferred Render variable name. Production startup fails closed when this same-project transactional connection is missing or incompatible.

### `npm run stripe:handoff` fails

Check:

- `STRIPE_SECRET_KEY` is a current live key
- `STRIPE_WEBHOOK_SECRET` is populated from the live webhook endpoint
- `APP_URL` matches the final public domain
- `/api/stripe/webhook` exists as a live Stripe webhook endpoint
- `DATABASE_URL` points at the same Supabase project as `SUPABASE_URL`
- the database schema includes the latest `stripe_webhook_events` columns

### Admin login loops back to `/admin/login`

Check:

- `ADMIN_EMAIL`
- `SUPABASE_ANON_KEY`
- Supabase Auth user existence
- cookie settings on the deployed domain

### Render logs mention rate limiting and `X-Forwarded-For`

The server is already configured to trust Render’s proxy hop. If this appears again, confirm the service is running the latest commit from `main`.

## Repository Notes

- Do not commit real customer exports, invoice exports, or private documents.
- Keep destructive scripts gated behind explicit env checks.
- Treat `scripts/pg-seed.js` as destructive. It requires `ALLOW_SCHEMA_RESET=true`.
