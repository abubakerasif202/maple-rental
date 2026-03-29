# Maple Rentals V4

Maple Rentals V4 is a Render-ready SaaS deployment split into a static frontend and a Node.js backend, with Supabase for hosted data/auth and Stripe for subscriptions.

## Repo structure

```text
root/
  client/   # Vite + React 18 + MUI + Zustand
  server/   # Express API and business logic
  jobs/     # Render cron jobs
  shared/   # shared runtime contracts/constants
  supabase/sql/maple-rentals-v4.sql
```

## Architecture

- Frontend: Render Static Site built from `client/`
- Backend: Render Web Service started with `node server/index.js`
- Cron jobs: Render Cron Services running `jobs/retryPayments.js` and `jobs/sendReminders.js`
- Database/Auth: Supabase
- Payments: Stripe
- Contracts: PDFKit + Supabase Storage bucket `contracts`
- Notifications: Resend or SMTP plus SMS stub logging

## Core routes

- `POST /api/auth`
- `POST /api/apply`
- `GET /api/vehicles`
- `POST /api/subscribe`
- `GET /api/admin`
- `POST /webhook`
- `GET /api/health`

## Local setup

1. Install backend dependencies from the repo root:

```bash
npm ci
```

2. Install frontend dependencies:

```bash
npm --prefix client ci
```

3. Configure environment variables:

- Copy `.env.example` values into `.env`
- Copy `client/.env.example` values into `client/.env`

4. Apply the Supabase SQL from [supabase/sql/maple-rentals-v4.sql](supabase/sql/maple-rentals-v4.sql).

5. Start both services locally:

```bash
npm run dev
```

Frontend runs on `http://localhost:5173`.
Backend runs on `http://localhost:3001`.

## Build and validate

```bash
npm run lint
npm run build
npm run validate
```

The root build only compiles the static frontend because the backend runs directly from `server/index.js`.

## Supabase schema

The SQL provisions:

- `drivers`
- `vehicles`
- `applications`
- `subscriptions`
- `payments`
- `payouts`
- `contracts`
- `notifications`

It also adds:

- indexes for operational lookups
- `updated_at` triggers
- RLS policies for driver self-access and admin access
- a private `contracts` storage bucket with object policies

## Stripe webhooks

Configure Stripe to send webhook events to:

```text
https://your-backend.onrender.com/webhook
```

Handled events:

- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.deleted`

The webhook endpoint requires the raw request body and validates the Stripe signature before processing.
The health endpoint checks that the required Supabase tables exist, so Render will keep the backend unhealthy until the V4 schema has been applied to the configured project.

## Environment variables

### Backend required

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Backend strongly recommended

- `SUPABASE_ANON_KEY`
- `JWT_SECRET`
- `APP_URL`
- `CLIENT_URL`
- `ADMIN_EMAIL`
- `RESEND_API_KEY` or SMTP settings

### Frontend required

- `VITE_API_URL`

## Render deployment

The repo includes [render.yaml](render.yaml) with:

- one static site for `client/`
- one web service for the API
- two cron services for reminders and payment retries

Detailed deployment steps live in [DEPLOY_RENDER.md](DEPLOY_RENDER.md).
