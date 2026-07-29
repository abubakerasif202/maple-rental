# Deploy Maple Rental to Render

Follow [`docs/deployment.md`](docs/deployment.md) for authorization, migration,
release-evidence, stop, and recovery requirements. This file describes Render setup.

## Goal

Deploy the application as a single Render web service where:

- Express serves the API under `/api/*`
- Express serves the built Vite frontend from `dist/`
- non-API routes fall back to `dist/index.html`
- Render health checks probe `/api/health`

## Render blueprint

This repository includes `render.yaml`, so Render can provision the service directly from GitHub.

Blueprint link:
[https://dashboard.render.com/blueprint/new?repo=https://github.com/abubakerasif202/maple-rental](https://dashboard.render.com/blueprint/new?repo=https://github.com/abubakerasif202/maple-rental)

Supabase SQL files are organized under `supabase/migrations/`, with the base schema in `supabase/migrations/01_schema.sql`.

## Expected service configuration

- Service type: `Web Service`
- Runtime: `Node`
- Build command: `npm ci --include=dev && npm run validate && npm run build`
- Start command: `npm start`
- Health check path: `/api/health`

## Runtime model

### Development

`npm run dev` starts the Express server in development mode and mounts Vite middleware inside the same process.

Default local URL:
- `http://localhost:3000`

### Production

`npm start` runs the compiled backend from:
- `server-dist/api/index.js`

That server:
- binds to `0.0.0.0:$PORT`
- serves static frontend assets from `dist/`
- returns `dist/index.html` for SPA routes
- keeps missing API routes as JSON 404s instead of returning the frontend shell

## Environment variables

### Required

- `APP_URL`
  - Canonical public app URL, for example `https://www.maplerentals.com.au`

- `ADMIN_EMAIL`
  - Allowed production admin login email

- `SUPABASE_URL`
  - Supabase project URL in `https://...supabase.co` format

- `SUPABASE_SERVICE_ROLE_KEY`
  - Backend service-role key used for privileged storage and auth-backed operations

- `SUPABASE_ANON_KEY`
  - Frontend/browser public anon key used by the client app

- `DATABASE_URL`
  - Preferred session-capable PostgreSQL connection string for the same Supabase project used by `SUPABASE_URL`

- `STRIPE_SECRET_KEY`
  - Stripe server SDK key

- `STRIPE_WEBHOOK_SECRET`
  - Stripe webhook signing secret

- `CHECKOUT_LINK_SECRET`
  - HMAC secret used to sign checkout link tokens

- `JWT_SECRET`
  - Secret used to sign admin session cookies

- `LEASE_OWNER_NAME`
- `LEASE_OWNER_ADDRESS`
- `LEASE_OWNER_CONTACT`
- `LEASE_OWNER_EMAIL`
  - Registered-owner details inserted into generated lease agreements

### Fallback only

- `SUPABASE_DB_URL`
  - Legacy fallback direct Postgres connection string when `DATABASE_URL` is not set
  - If both are present, the app uses `DATABASE_URL`

### Optional

- `RESEND_API_KEY`
  - Enables outbound transactional email

- `CORS_ORIGIN`
  - Additional browser origin to allow

- `FRONTEND_URL`
  - Legacy extra origin override if needed for external clients

- `ADMIN_PASSWORD`
  - Dev/test fallback only; not required in production

- `JSON_BODY_LIMIT`
  - Overrides the default JSON payload limit of `100kb` for non-application routes

- `/api/applications`
  - Uses its own parser budget sized for two 7 MB base64 licence uploads

## Important env rules

- `SUPABASE_URL` must be the HTTPS project URL, not the Postgres connection string.
- `DATABASE_URL` must point to the same Supabase project as `SUPABASE_URL`; a separate Render Postgres database is rejected to prevent split application/payment state.
- `SUPABASE_DB_URL` must be the Postgres connection string, not the HTTPS project URL.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the frontend.
- Do not set `PORT` manually on Render.

## First deploy checklist

1. Connect the GitHub repo in Render.
2. Use the Blueprint flow so `render.yaml` is applied.
3. Fill every required environment variable.
4. Set a session-capable direct or session-pooler URL for the same Supabase project as `DATABASE_URL`.
5. Keep the Supabase storage/auth variables in place.
6. Run the payment workflow migrations against `DATABASE_URL`.
7. Configure Stripe to deliver webhooks to `https://<your-domain>/api/stripe/webhook`.
8. Deploy.
9. Verify [https://www.maplerentals.com.au/api/health](https://www.maplerentals.com.au/api/health) or your Render URL equivalent.

## Health check expectations

A healthy response should look like:

```json
{
  "status": "ok",
  "database": "ok",
  "directDatabase": "ok",
  "paymentActivationMode": "transactional"
}
```

If `paymentActivationMode` is `restricted`, local/non-production payment processing
lacks transactional locking. In production, `/api/health` returns HTTP 503 for this
state; do not send traffic or declare the release healthy.

## Authenticated admin smoke test

After a deployment, run the read-only admin smoke test from PowerShell. It logs in through `/api/auth/login`, keeps the HTTP-only session cookie in a temporary cookie jar, checks the admin read endpoints, attempts trusted-origin logout, and removes all temporary files.

```powershell
$securePassword = Read-Host "Password" -AsSecureString
$env:MAPLE_ADMIN_EMAIL = "admin@example.com"
$env:MAPLE_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $securePassword).Password

try {
  npm run smoke:production:admin
} finally {
  Remove-Item Env:MAPLE_ADMIN_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:MAPLE_ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
```

Use `MAPLE_PRODUCTION_URL` only when verifying a non-default deployment URL. The script never prints credentials, cookies, tokens, private response bodies, or customer records, and exits non-zero on authentication, HTTP, JSON, or response-shape failures.

## Local production verification

Use this to simulate the Render runtime locally:

```powershell
npm ci
npm run build
$env:NODE_ENV='production'
$env:PORT='3000'
npm start
```

Then check:

- `http://localhost:3000/api/health`
- `http://localhost:3000/`
- `http://localhost:3000/admin/dashboard`

## Common failures

### Invalid supabaseUrl

Cause:
- a Postgres URI was pasted into `SUPABASE_URL`

Fix:
- put the `https://...supabase.co` URL back into `SUPABASE_URL`
- put the Postgres URI into `DATABASE_URL` (preferred) or `SUPABASE_DB_URL`

### Health endpoint shows `restricted`

Cause:
- `DATABASE_URL` is missing or points at a non-session-capable pooler

Fix:
- add a valid session-capable `DATABASE_URL` and redeploy

### Rate-limit proxy warning on Render

Cause:
- Express was not trusting the Render proxy

Fix:
- already handled in `api/index.ts` by enabling `trust proxy` in production

## Operational notes

- Static assets under `/assets/*` are served with long-lived cache headers.
- `index.html` is served with `Cache-Control: no-store` so SPA shells do not go stale.
- The backend validates critical production environment variables at startup and fails fast when required secrets are missing.
