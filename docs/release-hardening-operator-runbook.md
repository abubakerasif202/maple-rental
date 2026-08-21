# Final hardening operator runbook

Run these steps only from an approved operator workstation. Do not paste keys,
database URLs, JWTs, or Stripe secrets into tickets, chat, or command output.

## Admin entitlement activation

1. Leave Render `ADMIN_AUTHORIZATION_MODE=hybrid` during migration.
2. In Supabase Dashboard, identify the existing admin by immutable user ID and
   set trusted Auth `app_metadata.maple_role` to `admin` using the Dashboard or a
   protected server-side Admin API operation. Never use `user_metadata`.
3. Sign out and back in, then verify both `/api/auth/verify` and one safe admin
   read using the encrypted cookie flow. Bearer verification should also pass.
4. Remove the claim or set `maple_role` to `revoked`; verify access is denied.
   Restore `admin`, sign in again, and verify access.
5. Change Render `ADMIN_AUTHORIZATION_MODE=entitlement`, deploy in an approved
   change window, and verify the existing admin again. Keep `ADMIN_EMAIL` for
   notifications; it no longer authorizes a missing role in entitlement mode.

## Schema and policy verification

First compare the linked production migration ledger and preview the exact SQL
set. The final `db push` command is production-mutating and must run only in an
approved change window after the database backup is confirmed:

```powershell
Set-Location -LiteralPath 'C:\Users\abuba\maple-rental-clean'
npx supabase migration list --linked
npx supabase db push --linked --dry-run --skip-vault

# PRODUCTION CHANGE: run only after reviewing the dry-run migration list.
npx supabase db push --linked --skip-vault
```

The expected new migration order is:

1. `20260821093210_make_verified_stripe_identity_atomic.sql`
2. `20260821120000_make_admin_audit_events_immutable.sql`
3. `20260821121000_harden_application_document_bucket.sql`

After the migration command succeeds, run the read-only verification:

```powershell
Set-Location -LiteralPath 'C:\Users\abuba\maple-rental-clean'
npm run verify:schema-contract

# Requires psql and a protected session-mode PostgreSQL URL already present in
# this process environment. The value is not printed by this command.
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f '.\scripts\verify-release-hardening.sql'
```

Expected evidence:

- the audit UPDATE/DELETE and TRUNCATE triggers are enabled;
- `anon` and `authenticated` have no audit INSERT/UPDATE/DELETE/TRUNCATE grant;
- `service_role` has audit SELECT/INSERT but no mutation grant;
- `applications` is private, limited to 7,340,032 bytes, and allows only JPEG,
  the accepted `image/jpg` alias, PNG, and PDF;
- no Storage object policy grants unintended browser access;
- required business tables have RLS enabled;
- all six payment/rental partial unique indexes exist;
- `persist_verified_stripe_relationship` exists as `SECURITY DEFINER` and its
  execute privilege is restricted to `service_role`.

## Malware scanning decision

No external scanner is added in this release. Files are small, private,
admin-only, MIME-allowlisted, and magic-byte checked, which materially limits but
does not eliminate malicious-document risk. Operators should treat downloads as
untrusted. The recommended next step is an asynchronous quarantine-to-approved
workflow using an operationally supported scanner (for example a managed malware
scanning integration or isolated ClamAV worker) once monitoring, retry, deletion,
and incident-response ownership are available. Do not make the bucket public or
weaken current validation to add scanning.
