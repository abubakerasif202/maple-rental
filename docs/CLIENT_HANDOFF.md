# Client Handoff

Prepared: 2026-03-19

## Suggested Commit

```text
fix(handoff): harden admin flow and application intake

Close the pre-handover security and workflow gaps.

- reject cross-site cookie-authenticated admin writes
- keep public applications pending until admin approval
- rate limit public inquiry submissions
- allow seeded root-relative vehicle image paths in admin edits
- lock down the legacy admins table with RLS and revoked client grants

Deployment impact:
- apply supabase/migrations/07_lock_down_admins_table.sql to existing environments
- verify APP_URL and FRONTEND_URL or CORS_ORIGIN match deployed browser origins
```

## Release Notes

### Security

- Admin routes that rely on the signed admin cookie now reject untrusted cross-site write requests.
- The legacy `public.admins` table is now locked down with row-level security and revoked `anon` and `authenticated` grants.
- The public inquiry form now has request throttling to reduce spam and email quota abuse.

### Workflow Changes

- Public application submissions now create `Pending` applications instead of auto-approving and reserving vehicles.
- Stripe checkout links and lease agreements are no longer created during public submission. They should only be created after admin review and approval.
- Applicants now receive a review-pending confirmation instead of being redirected straight to checkout.

### Admin and Content Management

- Vehicle image validation now accepts seeded root-relative asset paths such as `/car-images/ABC123.jpeg`, so existing records can be edited without rewriting image URLs.

## Deployment Checklist

### 1. Confirm production configuration

Verify these values before deploy:

- `APP_URL`
- `ADMIN_EMAIL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL` or `DATABASE_URL`
- `CHECKOUT_LINK_SECRET`
- `JWT_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`

If the browser origin for the deployed frontend or admin UI is different from `APP_URL`, set one of these to the exact browser origin:

- `FRONTEND_URL`
- `CORS_ORIGIN`

This is required for legitimate admin cookie-authenticated write requests to pass the trusted-origin check.

### 2. Apply database changes

For an existing environment:

1. Confirm earlier application migrations are already applied.
2. Apply `supabase/migrations/07_lock_down_admins_table.sql` in the Supabase SQL editor or your normal SQL deployment path.

For a brand new environment:

1. Apply the base schema from `supabase/migrations/01_schema.sql`.
2. Apply all later SQL migrations under `supabase/migrations/`.
3. Run any required JavaScript migration scripts from the repository README for payment and fleet workflow upgrades.

### 3. Validate the release artifact

Run from the repository root:

```bash
npm ci
npm run validate
npm run build
```

Validated on this handoff:

- `npm run lint`
- `npm run test`
- `npm run build`

### 4. Deploy

Vercel deployment path:

1. Push the approved release commit.
2. Confirm the GitHub connected Vercel deployment completes for the intended SHA.
3. Confirm the Function boots successfully.
4. Confirm the health check responds successfully at `/api/health`.

### 5. Smoke test after deploy

Run these checks against production:

1. Browse the public car listing and open a vehicle detail page.
2. Submit a public application and confirm:
   - the UI shows a review-pending success state
   - there is no immediate checkout redirect
   - the new application appears in admin as `Pending`
3. Approve that application through the admin workflow and confirm the payment-link flow still works.
4. Submit repeated public inquiries from the same IP and confirm the limiter blocks excessive requests.
5. Edit a seeded vehicle that uses a `/car-images/...` image path and confirm the save succeeds.
6. Log in and out of admin from the real production origin and confirm the session behaves normally.

## Operational Notes

- The requested vehicle can still be stored on a `Pending` application for admin review, but pending applications no longer reserve inventory.
- If the client later moves the frontend or admin UI to a new domain, `FRONTEND_URL` or `CORS_ORIGIN` must be updated to match that origin.
- This release intentionally changes business flow: payment collection now starts after admin approval, not immediately after public form submission.
