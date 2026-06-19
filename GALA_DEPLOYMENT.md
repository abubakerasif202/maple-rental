# Gala Rentals Deployment Handoff

Gala Rentals must be deployed as a separate rental company project.

Do not deploy this build to the existing Maple Rentals Render service.
Do not point `www.maplerentals.com.au` or `maplerentals.com.au` at this build.
Do not reuse Maple Rentals Stripe products, price IDs, webhook endpoints, or production database credentials.

## Production Setup Checklist

- Create a new GitHub repository for Gala Rentals, or keep this work on a protected Gala-only branch such as `gala-rentals-build`.
- Create a new Render web service named `gala-rentals`.
- Attach a new Gala domain, for example `www.galarentals.com.au`.
- Provision a new Supabase project, or confirm an existing database is separate from Maple Rentals production.
- Apply `supabase/migrations/20260619090000_add_gala_application_fields.sql` before accepting live applications.
- Create new Stripe test and live products and price IDs for Gala Rentals.
- Create a new Stripe webhook endpoint for the Gala Render URL.
- Configure new environment variables in Render and do not copy Maple production secrets.

## Required Environment Variables

- `NODE_ENV=production`
- `APP_URL=https://www.galarentals.com.au`
- `ADMIN_EMAIL`
- `JWT_SECRET`
- `DATABASE_URL`
- `SUPABASE_DB_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `CHECKOUT_LINK_SECRET`
- `LEASE_OWNER_NAME=Gala Rentals`
- `LEASE_OWNER_ADDRESS`
- `LEASE_OWNER_CONTACT`
- `LEASE_OWNER_EMAIL`
- `RESEND_API_KEY`
- `VITE_API_BASE_URL=/api`
- `VITE_STRIPE_PUBLIC_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_VEHICLE_IMAGES_BUCKET`

## Safe Deploy Steps

1. Push `gala-rentals-build` to the new Gala GitHub repository or Gala-only remote branch.
2. In Render, create a new web service named `gala-rentals` from that repo or branch.
3. Set all required Gala environment variables in the new Render service.
4. Apply the Supabase migration in the separate Gala database.
5. Configure Stripe products, prices, and the webhook endpoint for the new Gala service URL.
6. Run `npm run lint`, `npm run test`, `npm run build`, and `git diff --check`.
7. Deploy only the new `gala-rentals` Render service.
8. Smoke-test the Gala URL with `/api/live`, `/api/health`, `/`, `/apply`, `/faq`, `/contact`, and `/my-rental`.
