# Single-admin security

Maple Rentals currently restricts admin sessions to the case-insensitive
`ADMIN_EMAIL` after Supabase Auth token verification. Production startup rejects a
missing or invalid admin email, and every privileged Express route must use
`authenticateAdmin`.

Email restriction is an additional single-operator boundary, not a complete role
model. The required trusted-claim, server authorization, RLS/grants, policy-test,
audit, and document-access controls are defined in
[`security-model.md`](security-model.md). The current missing trusted role claim is
recorded there as implementation follow-up.

Source of truth:

- `api/routes/auth.ts`
- `api/middleware/auth.ts`
- `api/index.ts`
- `supabase/migrations/20260715030000_enforce_server_mediated_data_access.sql`
