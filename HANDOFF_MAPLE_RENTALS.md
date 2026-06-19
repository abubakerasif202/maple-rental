# Gala Rentals Production Handoff

This repository has been prepared for Gala Rentals as a separate rental SaaS project.

Use [GALA_DEPLOYMENT.md](GALA_DEPLOYMENT.md), [README.md](README.md), and [DEPLOY_RENDER.md](DEPLOY_RENDER.md) for current deployment instructions.

## Required Production Setup

- Deploy from `https://github.com/abubakerasif202/gala-rentals.git`.
- Create a new Render web service named `gala-rentals`.
- Use branch `main`.
- Use build command `npm run validate && npm run build`.
- Use start command `npm start`.
- Add only Gala domains, for example `www.galarentals.com.au`.
- Use Gala-only environment variables.
- Use a separate Supabase project/database.
- Apply `supabase/migrations/20260619090000_add_gala_application_fields.sql`.
- Create new Gala Stripe products, prices, and webhook endpoint.
- Set the Stripe webhook URL to `https://<GALA_RENDER_DOMAIN>/api/stripe/webhook`.

## Required Checks Before Live Traffic

- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`
- `/api/live`
- `/api/health`
- homepage loads
- `/admin/login` loads
- `/apply` submits with test data
- Stripe Checkout is created with test-mode keys before any live-key switch

Do not reuse another company's production Render service, domain, Supabase credentials, Stripe products, Stripe prices, or webhook endpoint.
