# Aurora Rentals Render Deployment

Use [AURORA_DEPLOYMENT.md](AURORA_DEPLOYMENT.md) as the primary deployment handoff.

Aurora Rentals must be deployed as a separate Render web service from the Aurora GitHub repo:

```text
https://github.com/abubakerasif202/aurora-rentals.git
```

## Render Service

- Service type: Web Service
- Service name: `aurora-rentals`
- Repo: `abubakerasif202/aurora-rentals`
- Branch: `main`
- Runtime: Node
- Build command: `npm run validate && npm run build`
- Start command: `npm start`
- Health check path: `/api/health`

## First Deploy Checklist

1. Create a new Render web service named `aurora-rentals`.
2. Connect the Aurora GitHub repo.
3. Add Aurora-only environment variables.
4. Use a separate Supabase project/database.
5. Apply `supabase/migrations/20260619090000_add_aurora_application_fields.sql`.
6. Create new Stripe products, prices, and webhook endpoint for Aurora.
7. Set the Stripe webhook URL to `https://<AURORA_RENDER_DOMAIN>/api/stripe/webhook`.
8. Add only an Aurora domain, for example `www.aurorarentals.com.au`.
9. Verify `/api/live`, `/api/health`, the homepage, `/admin/login`, and `/apply`.

Do not deploy this app to another company's Render service, domain, Supabase project, or Stripe account.
