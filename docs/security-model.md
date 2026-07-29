# Maple Rentals security model

Maple Rentals exposes public forms and an Express API; operational data is
server-mediated through the Supabase service role. Supabase Auth establishes admin
identity. Customer identity documents and agreement PDFs are private Storage
objects. Security decisions are enforced by the server and database, never by UI
visibility.

## Authorization and database access

Every table reachable through the Supabase Data API must have RLS enabled,
least-privilege grants, and deny-by-default policies. Exposed views must use
`security_invoker` and RLS-protected base tables, or an equivalently reviewed
deny-by-default design. Grants and RLS are independent controls; service-role bypass
does not make missing RLS or grants acceptable.

| Principal | Allowed boundary |
| --- | --- |
| Anonymous | Public content and rate-limited Express submission routes only; no direct operational Data API access |
| Authenticated customer | Only explicitly designed self-service records owned by the verified user; no cross-customer access |
| Admin | Privileged Express endpoints after Supabase token verification, trusted admin-role authorization, configured Maple admin boundary, and trusted-origin checks for cookie writes |
| Service role | Server/controlled-job operations only; never browser code or public logs |

Admin role must come from a trusted, server-managed claim (for example immutable
Supabase `app_metadata`), not user-editable metadata or a client-supplied value.
Every privileged endpoint rechecks the verified token and role server-side. Maple's
current single-admin email boundary may be an additional restriction, not a
replacement for the trusted role claim. Hidden controls and frontend route guards
are usability features only.

Policy tests must run against an isolated Supabase instance and prove:

- anonymous and ordinary authenticated roles cannot access operational tables;
- a customer cannot read or mutate another customer's records or objects;
- non-admin users cannot call admin mutations or privileged RPCs;
- allowed reads/writes are limited to intended columns and ownership; and
- service-only functions and tables reject `anon` and `authenticated`.

## Private documents

Customer identity documents must never be public.

- Buckets are private and provisioned reproducibly.
- `storage.objects` policies deny by default and scope object operations by bucket,
  principal, and ownership/role. Database record authorization is checked again
  before issuing a URL.
- Object paths use cryptographically random, non-guessable identifiers and do not
  contain original filenames, emails, licence numbers, or other identity data.
- Original filenames are discarded or sanitized for display only; path extension
  is derived from validated content type.
- Enforce file count and byte limits, a MIME allowlist, and magic-byte/content
  validation. Use malware/content inspection or a quarantine-to-approved promotion
  flow where the platform supports it.
- Only the backend issues short-lived signed URLs after object-level authorization.
  Never store signed URLs as durable record values.
- Record document access with actor, object/record target, outcome, timestamp, and
  request/correlation ID without logging the signed URL.
- Define retention by document class. Deletion requires an expired retention period,
  no legal/operational hold, an audit event, and a controlled dry run. Storage
  backups and database backups are separate recovery assets.

The application-document cleanup procedure remains in `docs/document-retention.md`.

## Audit events

Security- and business-significant mutations require an append-only event with:

- actor;
- action;
- target type and identifier;
- redacted before and after values;
- UTC timestamp;
- request/correlation ID; and
- outcome.

Redact secrets, tokens, signed URLs, raw payment objects, identity-document data,
and unnecessary personal/payment identifiers. Prefer a database function/RPC or
direct PostgreSQL transaction that commits the mutation and audit event together.
When a remote side effect prevents one transaction, persist an intent/outbox first
and audit each final outcome.

Immutability must be database-enforced with privileges and a trigger that rejects
`UPDATE` and `DELETE`, including service-role writes. Corrections are new linked
events; they do not rewrite history. Any break-glass export or retention deletion
process must be separately authorized and audited.

## Accessibility

Critical public and admin workflows must meet WCAG 2.2 AA expectations:

- full keyboard operation with logical order and no traps;
- visible focus indicators;
- programmatic labels and accurate accessible names;
- focus trapping/restoration for dialogs and focus movement to validation/error
  summaries where appropriate;
- semantic headings, landmarks, buttons, forms, and data tables;
- status and validation information that does not rely on colour alone; and
- responsive reflow without clipped controls or lost content.

Keep JSX accessibility linting and focused component tests. Add automated
browser-level accessibility regression tests for application submission, admin
login, application approval/payment-link creation, document access, and dialogs.
Automated checks supplement keyboard and assistive-technology review.

## Prioritized implementation follow-up

These are current runtime gaps discovered while defining this contract. They are not
fixed by documentation:

### Critical / High

- No Critical or High runtime finding was confirmed during this documentation
  review.

### Medium

- **Storage object policies are not repository-managed.** The applications bucket
  is made private by `scripts/setup-bucket.ts:14-30`, but no migration defines
  `storage.objects` policies for it. The agreement bucket migration creates only a
  private bucket (`supabase/migrations/20260721092000_add_lease_agreement_pdf_artifacts.sql:51-53`).
  Add deny-by-default object policies, ownership/admin checks, and isolated policy
  tests before adding customer-direct Storage access.

- **Admin authorization has no trusted role claim.** `api/middleware/auth.ts:437-452`
  verifies a Supabase user and authorizes by configured email; the same comparison
  gates refreshed sessions at `api/middleware/auth.ts:455-487`. Add a server-managed
  role claim and denial tests while retaining the single-admin boundary.
- **General admin audit events lack the required schema and immutability.**
  `api/adminAudit.ts:3-23` writes action/actor/target/metadata only.
  `supabase/migrations/20260711215014_production_hardening_audit.sql:72-97` has no
  before/after, correlation ID, outcome, or mutation-blocking trigger. Add an
  append-only v2 event contract and transactional mutation helpers.
- **Application document access is not audited.**
  `api/routes/applications.ts:593-635` authorizes the admin and issues a signed URL
  but does not record access. Add redacted outcome auditing tied to the request ID.

### Low

- **Upload inspection is limited to type signatures.**
  `api/routes/applications.ts:411-464` checks declared MIME, size, and magic bytes,
  but there is no malware scan/quarantine stage. Add one when an operational
  scanner is available; keep unscanned objects private and admin-only.
- **Critical-flow accessibility coverage is component-level, not browser-level.**
  JSX lint and focused tests exist, but no end-to-end accessibility runner is in
  `package.json`. Add automated critical public/admin journey coverage without
  replacing manual keyboard and assistive-technology checks.
