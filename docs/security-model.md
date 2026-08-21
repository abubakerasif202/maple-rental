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

Admin role comes from trusted Supabase `app_metadata.maple_role`, not
user-editable metadata or a client-supplied value. `hybrid` rollout mode accepts
the exact configured email only while the existing production admin is being
provisioned; an explicit `revoked` claim overrides that fallback. After operator
verification, `ADMIN_AUTHORIZATION_MODE=entitlement` removes email fallback.
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

- **Storage remains server-mediated.** The applications and agreement buckets are
  migration-managed as private. No browser role receives an object policy; the
  service-role API performs uploads and creates short-lived signed URLs only after
  admin authorization. Add ownership policies and isolated policy tests before any
  future customer-direct Storage access.

- **Admin entitlement activation is production-coordinated.** The backend checks
  live trusted `app_metadata.maple_role` for bearer and encrypted-session flows,
  ignores `user_metadata`, and supports immediate explicit revocation. Production
  remains in `hybrid` compatibility mode until the operator provisions and tests
  the existing admin claim, then switches to `entitlement` mode.
- **General admin audit events need richer transactional context.**
  `20260821120000_make_admin_audit_events_immutable.sql` makes the table
  server-authored and blocks update, delete, and truncate. Access events include a
  request ID in redacted metadata. The generic contract still lacks normalized
  before/after values and some business mutations do not commit their audit event
  in the same database transaction; migrate those flows through transactional RPCs.

### Low

- **Upload inspection is limited to type signatures.**
  `api/routes/applications.ts:411-464` checks declared MIME, size, and magic bytes,
  but there is no malware scan/quarantine stage. Add one when an operational
  scanner is available; keep unscanned objects private and admin-only.
- **Automated accessibility is not full WCAG proof.** Playwright now covers public
  routes, five viewports, labels, keyboard reachability, overflow, and axe WCAG
  A/AA rules. Authenticated admin journeys and manual keyboard, screen-reader,
  zoom, reflow, and colour-independent-state checks remain release activities.
