<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/edb4d6f6-9a94-4e5b-91f2-ccb6d7fb9089

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
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

- Added sanitized Starr365 scrape output at `data/starr365_pages.json`.
- This dataset currently contains authenticated page metadata (`url` path, title, status, link counts), not vehicle records.
- Added extracted statement scrape data at `data/starr365_statement_data.json` from `statement_data.php` (invoice/statement sections and rows).
- Added invoice export data from `C:\Users\abuba\Invoice-list.xls`:
  - `data/invoice_list_from_xls.json` (structured rows + metadata)
  - `data/invoice_list_from_xls.csv` (flat tabular export)
- Added rental client export data from `C:\Users\abuba\RentalClientList.xlsx`:
  - `data/rentalclientlist_from_xlsx.json`
  - `data/rentalclientlist_from_xlsx.csv`
- Added fleets export data from `C:\Users\abuba\Fleets.xlsx`:
  - `data/fleets_from_xlsx.json`
  - `data/fleets_from_xlsx.csv`
