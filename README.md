<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm ci` (or `npm install`)
2. Run the app:
   `npm run dev`

## Stripe SaaS Connect MWE

1. Ensure `APP_URL` points to the URL that serves the client (for example `http://localhost:5173`) so the backend can build return/refresh URLs.
2. Start the local server: `npm run dev`.
3. Navigate to `/admin/dashboard` to exercise the Accounts v2 onboarding flow, create a Connect Express merchant, and capture the onboarding link (refresh it if it expires).
4. Use the page content to contrast Stripe-owned versus buy-rate monetization and tune the `payoutInterval` before moving to production.

## Script Safety Notes

- `scripts/check-status.js` and `scripts/pg-seed.js` now require `SUPABASE_DB_URL` (or `DATABASE_URL`) in environment.
- `scripts/pg-seed.js` is destructive and requires `ALLOW_SCHEMA_RESET=true` to run.
- `scripts/seed-admin.js` and `scripts/reset-admin.js` require explicit admin email/password arguments (or `ADMIN_EMAIL` + `ADMIN_PASSWORD` env vars).

## Scraped Data

- Do not commit raw customer, invoice, or operational exports to this repository.
- Keep any temporary scrape/export artifacts in local, untracked paths only.
