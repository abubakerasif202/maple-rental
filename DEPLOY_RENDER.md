# Render Deployment Guide

## Services

This repo deploys as four Render services:

1. `maple-rentals-v4-frontend`
2. `maple-rentals-v4-backend`
3. `maple-rentals-v4-retry-payments`
4. `maple-rentals-v4-send-reminders`

The frontend and backend are the primary application services. The cron services support payment recovery and operational reminders.

## Render build settings

### Frontend

- Type: `Static Site`
- Root directory: `client`
- Build command: `npm ci && npm run build`
- Publish directory: `dist`

### Backend

- Type: `Web Service`
- Root directory: repo root
- Build command: `npm ci && npm run lint`
- Start command: `node server/index.js`
- Health check: `/api/health`
- Do not set `PORT` manually on Render. Render injects it for web services.

### Cron jobs

- Root directory: repo root
- Build command: `npm ci && npm run lint`
- Retry payments: `node jobs/retryPayments.js`
- Send reminders: `node jobs/sendReminders.js`

## Deploy steps

1. Push this repo to GitHub, GitLab, or Bitbucket.
2. In Supabase, run [supabase/sql/maple-rentals-v4.sql](supabase/sql/maple-rentals-v4.sql).
3. In Stripe, create a webhook endpoint pointing to `https://<backend-service>.onrender.com/webhook`.
4. In Render, create a new Blueprint deployment from this repo so `render.yaml` is applied.
5. Fill all `sync: false` environment variables for the backend and cron services.
6. Fill `VITE_API_URL` on the static site with the backend Render URL.
7. Deploy.
8. Confirm `/api/health` returns `status: ok` before exposing the frontend. If it returns `degraded`, the Supabase SQL has not been fully applied to the connected project.

## Backend environment variables

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
JWT_SECRET=
APP_URL=
CLIENT_URL=
ADMIN_EMAIL=
RESEND_API_KEY=
NOTIFY_FROM_EMAIL=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_SECURE=false
SMS_FROM=MAPLE
PAYMENT_RETRY_LIMIT=3
PAYMENT_RETRY_DELAY_HOURS=24
```

## Frontend environment variables

```env
VITE_API_URL=https://your-backend.onrender.com
```

## Stripe notes

- The frontend never sees `STRIPE_SECRET_KEY`.
- Checkout, direct subscriptions, portal creation, and webhook handling all occur in the backend.
- Stripe metadata stores `applicationId`, `driverId`, and `vehicleId` to keep webhook reconciliation deterministic.

## Verification checklist

1. Open the frontend URL and confirm `/vehicles` loads.
2. Hit `https://<backend>/api/health` and confirm `status: ok`.
3. If `/api/health` reports `degraded`, apply [supabase/sql/maple-rentals-v4.sql](supabase/sql/maple-rentals-v4.sql) to the exact Supabase project wired into Render.
4. Submit a test application.
5. Log in with the created driver account.
6. Approve the application from `/admin`.
7. Confirm the contract PDF is generated in Supabase Storage.
8. Start checkout from `/billing`.
9. Fire a Stripe test webhook and confirm payment rows and driver status update.
10. Confirm both cron services complete without runtime errors.
