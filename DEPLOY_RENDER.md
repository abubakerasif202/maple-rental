# Gala Rentals Render Deployment

Use [GALA_DEPLOYMENT.md](GALA_DEPLOYMENT.md) as the primary deployment handoff.

Gala Rentals must be deployed as a separate Render web service from the Gala GitHub repo:

```text
https://github.com/abubakerasif202/gala-rentals.git
```

## Render Service

- Service type: Web Service
- Service name: `gala-rentals`
- Repo: `abubakerasif202/gala-rentals`
- Branch: `main`
- Runtime: Node
- Build command: `npm run validate && npm run build`
- Start command: `npm start`
- Health check path: `/api/health`

## First Deploy Checklist

1. Create a new Render web service named `gala-rentals`.
2. Connect the Gala GitHub repo.
3. Add Gala-only environment variables.
4. Use a separate Supabase project/database.
5. Apply `supabase/migrations/20260619090000_add_gala_application_fields.sql`.
6. Create new Stripe products, prices, and webhook endpoint for Gala.
7. Set the Stripe webhook URL to `https://<GALA_RENDER_DOMAIN>/api/stripe/webhook`.
8. Add only a Gala domain, for example `www.galarentals.com.au`.
9. Verify `/api/live`, `/api/health`, the homepage, `/admin/login`, and `/apply`.

Do not deploy this app to another company's Render service, domain, Supabase project, or Stripe account.
