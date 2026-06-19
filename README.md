# Aurora Rentals

Aurora Rentals is a full-stack rental SaaS for approval-first vehicle subscriptions. One Express process serves both the API and the built React/Vite frontend in production.

Deployment handoff notes are documented in [AURORA_DEPLOYMENT.md](AURORA_DEPLOYMENT.md).
Stripe operational setup and reset steps are documented in [docs/STRIPE_SETUP.md](docs/STRIPE_SETUP.md).

## Summary

- Public users can browse the fleet, review pricing, submit applications, upload driver documents, and receive payment links after admin review.
- Admin users can review applications, manage vehicles, activate rentals, inspect customer and invoice history, and work with lease agreements.
- Supabase provides auth and private document storage.
- Transactional app data and Stripe/payment state use a direct PostgreSQL connection, with `DATABASE_URL` preferred.
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

## Routes

Public:

- `/`
- `/fleet`
- `/cars`
- `/cars/:id`
- `/pricing`
- `/apply`
- `/faq`
- `/contact`
- `/my-rental`
- `/checkout/:id`
- `/success`

Admin:

- `/admin/login`
- `/admin/dashboard`
- `/admin/agreements`
- `/admin/toll-notices`

API:

- `/api/auth`
- `/api/cars`
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
- A separate Aurora Supabase project
- A separate Aurora Stripe account or Stripe test workspace/catalog

### Install

```bash
npm ci
```

### Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in Aurora-only values. The server loads `.env` first and then `.env.local` in non-production environments.

Minimum local variables:

```env
SUPABASE_URL=https://your-aurora-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_aurora_service_role_key
SUPABASE_ANON_KEY=your_aurora_anon_key
ADMIN_EMAIL=hello@aurorarentals.com.au
CHECKOUT_LINK_SECRET=replace_with_a_long_random_secret
JWT_SECRET=replace_with_a_long_random_secret
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=http://localhost:3000
SITE_URL=http://localhost:3000
LEASE_OWNER_NAME=Aurora Rentals
LEASE_OWNER_ADDRESS=Sydney NSW
LEASE_OWNER_CONTACT=1300 555 828
LEASE_OWNER_EMAIL=hello@aurorarentals.com.au
VITE_API_BASE_URL=/api
VITE_STRIPE_PUBLIC_KEY=pk_test_...
VITE_SUPABASE_URL=https://your-aurora-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_aurora_anon_key
VITE_SUPABASE_VEHICLE_IMAGES_BUCKET=vehicle-images
```

Recommended for full local parity:

```env
DATABASE_URL=postgresql://...
RESEND_API_KEY=re_...
```

`SUPABASE_DB_URL=postgresql://...` remains supported as a fallback for legacy environments, but `DATABASE_URL` is preferred for local parity and Render deployments.

Stripe payment links and hosted checkout session creation work with the standard Supabase HTTP credentials. Automatic rental activation requires `DATABASE_URL` or `SUPABASE_DB_URL` to point to a session-capable Postgres connection; otherwise paid checkouts fall back to `Payment Review`.

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

Apply newer SQL files under `supabase/migrations/` before handoff. Aurora requires:

```text
supabase/migrations/20260619090000_add_aurora_application_fields.sql
```

Create the private storage bucket used for driver documents:

```bash
npx tsx scripts/setup-bucket.ts
```

Create or reset the admin user:

```bash
node scripts/seed-admin.js hello@aurorarentals.com.au your-password
node scripts/reset-admin.js hello@aurorarentals.com.au new-password
```

### Start Development

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

Command summary:

- `npm run dev`: full-stack local development server
- `npm run stripe:setup`: verify Stripe account, webhook endpoint, and reusable Stripe catalog
- `npm run stripe:handoff`: strict Stripe readiness gate for handoff; requires a live key and valid webhook setup
- `npm run migrate:stripe-webhook-ledger`: apply the Stripe webhook event ledger migration when required
- `npm run stripe:reset`: preview a destructive Stripe test-data reset
- `npm run lint`: TypeScript type-check
- `npm run test`: Vitest suite
- `npm run validate`: lint plus tests
- `npm run build`: client plus server production build
- `npm start`: compiled production server
- `npm run preview`: Vite preview for the static client bundle only

## Production Environment Variables

Required:

- `NODE_ENV=production`
- `APP_URL=https://www.aurorarentals.com.au`
- `SITE_URL=https://www.aurorarentals.com.au`
- `ADMIN_EMAIL=hello@aurorarentals.com.au`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `CHECKOUT_LINK_SECRET`
- `JWT_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `LEASE_OWNER_NAME=Aurora Rentals`
- `LEASE_OWNER_ADDRESS=Sydney NSW`
- `LEASE_OWNER_CONTACT=1300 555 828`
- `LEASE_OWNER_EMAIL=hello@aurorarentals.com.au`
- `VITE_API_BASE_URL=/api`
- `VITE_STRIPE_PUBLIC_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_VEHICLE_IMAGES_BUCKET=vehicle-images`

Recommended:

- `RESEND_API_KEY`
- `SUPABASE_DB_URL` only as a fallback when `DATABASE_URL` is not set

Optional:

- `FRONTEND_URL`
- `CORS_ORIGIN`
- `JSON_BODY_LIMIT`
- `INDEXNOW_ENABLED`
- `INDEXNOW_KEY`
- `INDEXNOW_TIMEOUT_MS`
- `INDEXNOW_DEBOUNCE_MS`

## Direct Database And Payments

- Stripe checkout activation requires `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CHECKOUT_LINK_SECRET`, `APP_URL`, `ADMIN_EMAIL`, and `JWT_SECRET`.
- Supabase storage and auth require `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
- Direct Postgres uses `DATABASE_URL` as the primary connection string and falls back to `SUPABASE_DB_URL` only when `DATABASE_URL` is not set.
- `paymentActivationMode` is `transactional` only when the selected direct Postgres connection is session-capable.
- Transaction-pooler or missing direct DB config leaves the app in `restricted` mode.
- Checkout and subscription links are generated through:
  - `POST /api/applications/:id/approve-payment`
  - `POST /api/stripe/vehicle-checkout-link`
  - `POST /api/stripe/vehicle-checkout-session`
- Stripe checkout recovery and state resolution use:
  - `GET /api/stripe/payment-context`
  - `GET /api/stripe/checkout-sessions/:sessionId`
  - `POST /api/stripe/webhook`

## Render Deployment

Aurora must be deployed as a separate Render service from the Aurora GitHub repo:

```text
https://github.com/abubakerasif202/aurora-rentals.git
```

Render runtime contract:

- Service name: `aurora-rentals`
- Branch: `main`
- Build command: `npm run validate && npm run build`
- Start command: `npm start`
- Health check path: `/api/health`

First deploy checklist:

1. Create a new Render web service named `aurora-rentals`.
2. Connect `abubakerasif202/aurora-rentals`.
3. Set Aurora-only environment variables.
4. Use a separate Supabase project/database.
5. Apply `supabase/migrations/20260619090000_add_aurora_application_fields.sql`.
6. Create new Stripe products, prices, and webhook endpoint for Aurora.
7. Set the Stripe webhook URL to `https://<AURORA_RENDER_DOMAIN>/api/stripe/webhook`.
8. Deploy the Aurora service only.
9. Verify `/api/live`, `/api/health`, `/`, `/admin/login`, and `/apply`.

Do not reuse another company's production domain, Supabase credentials, Stripe products, Stripe prices, or webhook endpoints.

## Health Check

`GET /api/health` returns:

- `status`
- `environment`
- `database`
- `directDatabase`
- `paymentActivationMode`

`paymentActivationMode` will be:

- `transactional` when the selected direct database (`DATABASE_URL` first, then `SUPABASE_DB_URL`) is session-capable
- `restricted` when the app is running without a session-capable direct Postgres connection; payment links still work but automatic activation falls back to manual review

## Troubleshooting

### `Invalid supabaseUrl`

`SUPABASE_URL` must be the HTTPS project URL:

```env
SUPABASE_URL=https://your-aurora-project.supabase.co
```

Do not paste a Postgres connection string into `SUPABASE_URL`.

### Health endpoint reports `restricted`

Add `DATABASE_URL` with a session-capable direct Postgres connection to enable automatic Stripe activation. The web app can still boot and create payment links without a session-capable direct database, but paid checkouts remain in manual review.

### `npm run stripe:handoff` fails

Check:

- `STRIPE_SECRET_KEY` is the expected Aurora key
- `STRIPE_WEBHOOK_SECRET` is populated from the Aurora webhook endpoint
- `APP_URL` matches the final Aurora public domain
- `/api/stripe/webhook` exists as a live Stripe webhook endpoint
- `DATABASE_URL` points at the Aurora transactional database
- the database schema includes the latest `stripe_webhook_events` columns

### Admin login loops back to `/admin/login`

Check:

- `ADMIN_EMAIL`
- `SUPABASE_ANON_KEY`
- Supabase Auth user existence
- cookie settings on the deployed domain

## Security and Operational Notes

- Express trusts one proxy hop in production so rate limiting works correctly on Render.
- Helmet is enabled in production.
- Global API rate limiting is enabled, plus a stricter limiter on admin login attempts.
- API request bodies are size-limited.
- Driver documents are stored in a private Supabase Storage bucket and served through short-lived signed URLs.
- The server fails fast in production on invalid or missing core config instead of constructing unsafe fallback clients.
- Do not commit real customer exports, invoice exports, or private documents.
- Keep destructive scripts gated behind explicit env checks.
- Treat `scripts/pg-seed.js` as destructive. It requires `ALLOW_SCHEMA_RESET=true`.
