# Maple Rentals Commercial Deep Review — 2026-08-21

## Executive Summary

**REPOSITORY RELEASE GATE PASS — PRODUCTION CERTIFICATION PENDING**

The repository-wide source, configuration, migration, test, and build review is
complete. Final hardening added trusted admin entitlement support, atomic verified
Stripe identity persistence, route-specific delivered metadata, and a maintainable
Playwright/axe gate. Production certification is still pending because the live
Supabase schema/storage policies were not queried and the three prepared migrations
have not been confirmed against the production migration ledger or applied.

No critical issue or exposed live secret was found. One high-severity payment
identity race was fixed. The deliberate payment-only lifecycle remains intact:
payment marks an application `Paid`; it does not create a rental or mutate a car.

## Original Findings Count

```text
Critical: 0
High: 1
Medium: 8
Low: 6
Fixed: 12
Remaining: 3
```

## Final Hardening Status

```text
Critical: 0
High: 0
Medium: 1
Low: 1
Fixed: 14
Remaining: 2
```

The remaining medium item is F-14 audit atomicity outside the newly transactional
Stripe identity path. The low item is residual malware risk for private uploaded
documents. Production-only verification and entitlement activation are release
blockers, not additional confirmed repository defects.

## Critical / High Findings

### F-01

ID: F-01
Severity: HIGH
Subsystem: Stripe payment lifecycle / concurrency
File(s): `api/paymentActivation.ts`, `api/paymentLifecycle.ts`,
`api/paymentLifecycle.test.ts`, `api/tests/api.test.ts`
Problem: Verified Stripe identity was validated in one read and then written by
application ID alone. Cancellation, payment-link regeneration, or a competing
customer/subscription/Checkout identity could win between the read and write and
be overwritten. The concurrent customer-insert recovery also trusted the winner
without confirming its application ownership.
Evidence: The former update filtered only on `applications.id`; the final path
calls the row-locking `persist_verified_stripe_relationship` database RPC, with
race and rollback regressions in `api/paymentLifecycle.test.ts`.
Root Cause: The persistence boundary lacked compare-and-set predicates for every
state and identity used during validation.
Production Impact: Incorrect financial identity linkage, stale payment activation,
or an application linked to the wrong Stripe customer/subscription.
Fix Implemented: Added pre-existing identity conflicts and moved application
identity, operational customer create/link, concurrency handling, and audit insert
into one PostgreSQL transaction with row locks and database uniqueness guards.
Checkout fulfilment now calls that function from the same transaction as the
`Paid` update and fulfilment-ledger write. If a session-capable PostgreSQL
connection is unavailable, the handler records `Payment Review` and does not
commit a non-atomic `Paid` state. Therefore no earlier financial-link write can
commit before a later persistence failure in this path.
Tests Added/Updated: Cancellation, link-version, subscription, customer, Checkout
session, customer-insert race, and audit-failure rollback tests.
Validation: `npx vitest run api/paymentLifecycle.test.ts` — PASS, 64 tests. Full
suite — PASS, 745 tests.
Status: FIXED

## Medium / Low Findings

### F-02

ID: F-02
Severity: MEDIUM
Subsystem: Agreements / private documents
File(s): `api/routes/agreements.ts`, `api/agreementPdfStatus.ts`,
`src/components/admin/tabs/AgreementsTab.tsx`, `src/lib/api.ts`
Problem: Background status polling minted signed agreement URLs for every ready
artifact, without an explicit download action or access audit.
Evidence: The GET status route formerly called `createAgreementPdfSignedUrl`; it
now returns only `buildAgreementPdfStatusResponse` at
`api/routes/agreements.ts:340`.
Root Cause: Artifact readiness and authorization-to-download were combined in one
response.
Production Impact: Unnecessary private URL issuance and an incomplete access trail.
Fix Implemented: Status is metadata-only. The UI uses the audited POST endpoint for
explicit generate/download actions.
Tests Added/Updated: `api/agreementPdfStatus.test.ts`.
Validation: Focused test, typecheck, full suite, and build — PASS.
Status: FIXED

### F-03

ID: F-03
Severity: MEDIUM
Subsystem: Audit integrity / database
File(s): `supabase/migrations/20260821120000_make_admin_audit_events_immutable.sql`,
`api/newMigrationsContract.test.ts`
Problem: General admin audit history could be updated, deleted, or truncated by a
privileged server operation; an older browser-admin insert policy could fabricate
events before server-mediated grants were applied.
Evidence: The original audit migration had no mutation trigger.
Root Cause: “Append-only” was a convention, not a database invariant.
Production Impact: Loss or falsification of the administrative evidence trail.
Fix Implemented: Prepared an additive migration revoking browser writes, removing
the insert policy, and blocking UPDATE, DELETE, and TRUNCATE at the database.
Tests Added/Updated: Static migration contract asserts all mutation paths.
Validation: `npx vitest run api/newMigrationsContract.test.ts` — PASS, 5 tests.
Status: FIXED LOCALLY — MIGRATION NOT APPLIED

### F-04

ID: F-04
Severity: LOW
Subsystem: Authentication
File(s): `api/middleware/auth.ts`, `api/middleware/auth.production.test.ts`
Problem: A valid non-admin Supabase identity was always classified as invalid
because the null-user check ran before the `accessDenied` check.
Evidence: Production regression expects `403`, not `401`.
Root Cause: Incorrect branch ordering in both bearer and encrypted-session paths.
Production Impact: Incorrect authorization semantics and confusing operations.
Fix Implemented: Evaluate explicit denial before invalid credentials.
Tests Added/Updated: Valid non-admin bearer denial test.
Validation: Focused test — PASS, 3 tests.
Status: FIXED

### F-05

ID: F-05
Severity: MEDIUM
Subsystem: Date/time / frontend
File(s): `src/lib/australiaDate.ts`, `src/lib/australiaDate.test.ts`, admin tabs,
`src/pages/AdminDashboard.tsx`
Problem: PostgreSQL date-only values were parsed as UTC instants and rendered in
the browser timezone, which can display the previous calendar day.
Evidence: Rental start, invoice, and payout dates used `new Date('YYYY-MM-DD')`.
Root Cause: Date-only business values and exact timestamps shared one client-local
formatting path.
Production Impact: Wrong rental, invoice, or payout date shown/exported.
Fix Implemented: Exact date-only parsing/formatting independent of client timezone;
timestamp presentation uses Australia/Sydney; sorting is chronological.
Tests Added/Updated: DST boundary, timestamp boundary, and sorting tests.
Validation: Focused test — PASS, 6 tests; full suite/build — PASS.
Status: FIXED

### F-06

ID: F-06
Severity: LOW
Subsystem: Health / information disclosure
File(s): `api/healthResponse.ts`, `api/healthResponse.test.ts`, `api/index.ts`
Problem: Public production health responses exposed exact table/column schema issue
strings.
Evidence: The response included `directDatabaseSchemaIssues`.
Root Cause: Diagnostic and public readiness response shapes were identical.
Production Impact: Low-grade infrastructure reconnaissance.
Fix Implemented: Production returns only an issue count; non-production retains
actionable identifiers.
Tests Added/Updated: Production disclosure-boundary tests.
Validation: Focused health tests and full suite — PASS.
Status: FIXED

### F-07

ID: F-07
Severity: MEDIUM
Subsystem: Sensitive document access / audit
File(s): `api/routes/applications.ts`, `api/routes/manualInvoices.ts`,
`api/tests/api.test.ts`
Problem: Application identity-document and manual-invoice PDF downloads had no
redacted access event.
Evidence: The routes authorized access but returned content/URL without
`recordAdminAuditEvent`.
Root Cause: Mutation auditing existed, but read access to sensitive artifacts was
not treated as an auditable action.
Production Impact: No forensic record for sensitive document retrieval.
Fix Implemented: Added request-correlated, redacted access events; URLs, applicant
names, and document contents are excluded.
Tests Added/Updated: API assertions for event target and redaction.
Validation: Focused API tests and full suite — PASS.
Status: FIXED

### F-08

ID: F-08
Severity: MEDIUM
Subsystem: Supabase Storage / uploads
File(s): `supabase/migrations/20260821121000_harden_application_document_bucket.sql`,
`scripts/setup-bucket.ts`, `api/newMigrationsContract.test.ts`
Problem: The private applications bucket and upload limits were only an operational
script assumption; that script allowed 10 MB while the API allowed 7 MB.
Evidence: No prior applications-bucket migration; conflicting constants.
Root Cause: Storage infrastructure and server validation had separate sources of
truth.
Production Impact: Environment drift, accidental public bucket configuration, or
uploads accepted by storage but rejected by the API contract.
Fix Implemented: Prepared a private, 7 MB, MIME-bounded bucket migration and reused
shared upload constants in setup tooling.
Tests Added/Updated: Migration contract.
Validation: Focused migration test and typecheck — PASS.
Status: FIXED LOCALLY — MIGRATION NOT APPLIED

### F-09

ID: F-09
Severity: MEDIUM
Subsystem: Deployment / operational email
File(s): `render.yaml`, `api/renderConfig.test.ts`
Problem: Render configuration did not declare `RESEND_API_KEY`, while inquiries,
payment links, and notices depend on it.
Evidence: Runtime routes check the variable; the Blueprint omitted it.
Root Cause: Deployment environment contract drifted from runtime integrations.
Production Impact: Customer/admin email workflows can be disabled after Blueprint
provisioning.
Fix Implemented: Declared an operator-supplied secret and added a required-secret
contract test.
Tests Added/Updated: Seven Render secret declarations.
Validation: `api/renderConfig.test.ts` — PASS, 7 tests.
Status: FIXED LOCALLY — VALUE STILL REQUIRES OPERATOR CONFIGURATION

### F-10

ID: F-10
Severity: LOW
Subsystem: Dependencies
File(s): `package-lock.json`
Problem: Four vulnerable dev-only transitive packages were present: two
`brace-expansion` lines, `js-yaml`, and `undici`. Production dependency audit was
already clean.
Evidence: Initial full `npm audit` reported three high advisories; dry-run showed
compatible patch releases.
Root Cause: Stale transitive lock entries.
Production Impact: Development/CI toolchain exposure; no proven production runtime
reachability.
Fix Implemented: Non-forced compatible lock update only.
Tests Added/Updated: None required.
Validation: Full and production-only `npm audit` — zero vulnerabilities; full
suite/build — PASS.
Status: FIXED

### F-11

ID: F-11
Severity: LOW
Subsystem: Public routing / SEO
File(s): `api/frontendRouting.ts`, `api/frontendRouting.test.ts`, `api/index.ts`
Problem: Unknown HTML routes returned the SPA entry with HTTP 200, creating soft
404s.
Evidence: Generic safe paths were indistinguishable from known client routes.
Root Cause: SPA fallback and HTTP route validity were represented by one predicate.
Production Impact: Search indexing and monitoring can treat missing pages as valid.
Fix Implemented: Added an explicit known-route registry and serve the client
NotFound UI with HTTP 404 for safe unknown navigation paths.
Tests Added/Updated: Known versus missing route status classification.
Validation: Focused frontend-routing test and build — PASS.
Status: FIXED

### F-12

ID: F-12
Severity: LOW
Subsystem: Configuration maintainability
File(s): `scripts/setup-bucket.ts`, shared upload contract
Problem: Bucket bootstrap duplicated stale size/type configuration.
Evidence: 10 MB in the script versus 7 MB in the API.
Root Cause: Duplicate constants.
Production Impact: Operator confusion and inconsistent enforcement.
Fix Implemented: Reused shared size and MIME constants.
Tests Added/Updated: Covered by typecheck and storage migration contract.
Validation: Typecheck/lint — PASS.
Status: FIXED

### F-13

ID: F-13
Severity: MEDIUM
Subsystem: Admin authorization
File(s): `api/middleware/auth.ts`, `docs/security-model.md`
Problem: Server authorization is bound to one configured email, not a
server-managed role/entitlement claim.
Evidence: Supabase identity is verified server-side and then compared with
`ADMIN_EMAIL`; no trusted role claim is required.
Root Cause: Single-admin deployment evolved without a coordinated claim migration.
Production Impact: Identity governance and revocation depend on configuration and
email ownership rather than an explicit role assignment.
Fix Implemented: The server checks live trusted `app_metadata.maple_role` for both
bearer and encrypted-session authentication. `user_metadata` is ignored, explicit
`revoked` overrides the compatibility fallback, and `hybrid` mode preserves the
existing configured-email admin until the operator activates `entitlement` mode.
Tests Added/Updated: Entitled admin, missing role, forged user metadata, revoked
admin, legacy email fallback, expired/invalid bearer token, and encrypted-session
refresh coverage.
Validation: Focused auth tests and the full suite pass.
Status: FIXED LOCALLY — PRODUCTION ENTITLEMENT ACTIVATION REQUIRED

### F-14

ID: F-14
Severity: MEDIUM
Subsystem: Audit atomicity
File(s): `api/adminAudit.ts`, admin mutation routes, transactional RPC migrations
Problem: Some general admin mutations and their audit inserts are separate database
operations.
Evidence: Agreement/application actions update first and call the generic audit
helper afterward; several newer workflows already use transactional RPCs.
Root Cause: Audit capability was added after some business mutations.
Production Impact: A database/network failure can commit a mutation without its
corresponding general audit event.
Fix Implemented: Access paths fail closed before disclosure; audit history is
database-immutable; and verified Stripe application identity, customer create/link,
and audit insertion now commit in one `persist_verified_stripe_relationship` RPC.
The full mutation matrix is recorded in
`docs/audits/admin-mutation-atomicity-2026-08-21.md`.
Tests Added/Updated: Atomic rollback at application, customer, and audit boundaries,
plus static RPC privilege/payment-only contracts.
Validation: Focused payment/migration tests and the full suite pass.
Status: PARTIALLY FIXED — LISTED ADMIN MUTATIONS STILL NEED TRANSACTIONAL RPCS

### F-15

ID: F-15
Severity: LOW
Subsystem: SEO / browser verification
File(s): `index.html`, `src/components/Seo.tsx`, public routes
Problem: Pricing and Apply route metadata is client-applied, so a crawler that does
not execute JavaScript initially sees homepage metadata.
Evidence: One static `index.html`; route metadata is applied in React effects.
Root Cause: Vite SPA architecture has no route prerender/server metadata injection.
Production Impact: Reduced search snippet reliability for non-home pages.
Fix Implemented: The client build now generates route-specific HTML for `/`,
`/pricing`, and `/apply`; the Express production fallback selects those files while
preserving SPA behavior and correct unknown-route 404 status.
Tests Added/Updated: Routing unit contract and delivered-HTML Playwright assertions
for title, description, canonical, and Open Graph tags.
Validation: Build and five-viewport browser gate — PASS.
Status: FIXED

## Coverage Matrix

| Subsystem | Files Reviewed | Risks Checked | Findings | Fix Status |
| --- | --- | --- | ---: | --- |
| Architecture | README, docs, runtime/config entrypoints | boundaries, sources of truth, lifecycle | 0 | Reviewed |
| Auth | auth route/middleware/tests | expiry, refresh, logout, cookie, token validation | 2 | 2 fixed locally |
| Authorization | all route mounts and admin middleware | server checks, object access, role source | 1 | F-13 fixed locally; activation pending |
| Applications | Apply, route, schema, tests | validation, duplicates, uploads, state | 1 | Fixed F-07 |
| Admin APIs | every mounted admin router | auth, validation, retries, atomicity | 1 | Remaining F-14 |
| Stripe Checkout | routes/service/tokens/tests | price authority, idempotency, stale links | 1 | Fixed F-01 |
| Stripe Webhooks | raw route/service/ledger/tests | signature, replay, ordering, recovery | 0 | Reviewed |
| Payment Lifecycle | activation/lifecycle/docs/tests | Paid-only, historical metadata, concurrency | 1 | Fixed F-01 |
| Reconciliation | discovery/script/tests | dry-run, ambiguity, apply scope | 0 | Reviewed |
| Customers | routes/lifecycle/schema | durable identity, ambiguity, pagination | 1 | Fixed F-01 |
| Rentals | routes/lifecycle/migrations/UI | explicit activation, uniqueness, cancellation | 0 | Reviewed |
| Fleet | imports/service/migration/UI | upload, matching, stale rows, apply locks | 0 | Reviewed |
| Database | 56 migrations/schema contract | keys, FKs, uniqueness, indexes, checks | 2 | F-03/F-08 prepared |
| Migrations | all ordered SQL files | destructive history, additive safety, recovery | 2 | New migrations unapplied |
| Supabase/RLS | clients, hardening migrations, config | service role, anon/auth grants, RLS | 2 | F-08 fixed; live check blocked |
| Storage | upload/signing/artifacts/buckets | privacy, TTL, ownership, retention | 3 | F-02/F-07/F-08 fixed |
| Agreements | templates/routes/PDF/UI/migrations | versioning, idempotency, retrieval | 1 | Fixed F-02 |
| PDFs | agreement/toll/manual templates/tests | blanks, Unicode, multipage, access | 2 | F-02/F-07 fixed |
| Notices | route/template/delivery RPC/tests | mapping, send idempotency, audit | 0 | Reviewed |
| Uploads | application/fleet parsing/storage | size, MIME, magic, filename, timeout | 1 | Fixed F-08 |
| Maintenance | routes/reset service/tests | confirmation, dry-run, rollback, scope | 0 | Reviewed |
| Public UI | Home/Pricing/Apply/Checkout/Success | actions, SEO, errors, links | 2 | F-11/F-15 fixed |
| Admin UI | all tabs/dashboard/components | server truth, invalidation, actions, empty/error | 1 | Fixed F-05 |
| Forms | application/inquiry/admin forms | client/server parity, double submit, bounds | 0 | Reviewed |
| Accessibility | dialogs, tables, focus, labels, tests | keyboard, names, focus, status, motion | 0 | Browser automation added; manual audit remains |
| Mobile | responsive variants/tables/dialogs | overflow, mobile actions, touch targets | 0 | Five automated viewports pass; physical-device check remains |
| Performance | Vite chunks/queries/pagination/budget | startup, N+1, bounds, caching | 0 | Budget passed |
| Security | headers/CORS/CSRF/logging/secrets/errors | OWASP practical pass | 4 | 4 fixed locally; entitlement activation pending |
| Dependencies | package/lock/audits/outdated | prod/dev reachability, patch safety | 1 | Fixed F-10 |
| Logging | logger/error/email/Stripe paths | PII, tokens, payloads, redaction | 0 | Reviewed |
| Error Handling | middleware/routes/external services | raw errors, false success, recovery | 1 | Fixed F-04 |
| Health | live/health/schema checks/tests | liveness/readiness, disclosure, cache | 1 | Fixed F-06 |
| Deployment | Render/env/docs/CI/build | commands, Node, secrets, health | 1 | Fixed F-09 locally |
| Tests | 82 unit/integration files plus Playwright | auth, payment, schema, PDF, UI, migrations | 0 | 745 unit/integration and 40 E2E pass |

### Final Required Area Matrix

| Area | Reviewed | Findings | Fixed | Evidence |
| --- | ---: | ---: | ---: | --- |
| Architecture | Yes | 0 | 0 | docs and entrypoints |
| Auth | Yes | 2 | 2 | auth middleware/tests |
| Authorization | Yes | 1 | 1 | trusted live app metadata with migration gate |
| Stripe | Yes | 1 | 1 | Stripe routes/services/tests |
| Webhooks | Yes | 0 | 0 | raw-body route and event ledger |
| Payment lifecycle | Yes | 1 | 1 | payment tests, F-01 |
| Reconciliation | Yes | 0 | 0 | discovery/apply script and tests |
| Database | Yes | 2 | 2 | migration contracts |
| Migrations | Yes | 3 | 3 | 56 ordered files; three unapplied hardening migrations |
| Supabase | Yes | 1 | 1 | server-mediated migration/storage code |
| Rental lifecycle | Yes | 0 | 0 | explicit activation and cancellation |
| Agreements | Yes | 1 | 1 | artifact status/access separation |
| Documents | Yes | 3 | 3 | signed access/audit/buckets |
| Uploads | Yes | 1 | 1 | MIME, magic, size, private bucket |
| Admin | Yes | 2 | 1 | all tabs/routes; atomicity remains |
| Public UI | Yes | 2 | 2 | routes/SEO/sitemap/robots and delivered HTML tests |
| Accessibility | Yes | 0 | 0 | lint/component tests plus automated axe checks |
| Mobile | Yes | 0 | 0 | five responsive Playwright projects |
| Performance | Yes | 0 | 0 | 149,991/170,000-byte startup budget |
| Security | Yes | 4 | 4 | OWASP searches, auth/storage/audit |
| Tests | Yes | 0 | 0 | 82 files / 733 tests |
| Deployment | Yes | 1 | 1 | render contract/build/smoke |

## Stripe Certification

```text
Webhook signature verification: PASS — Stripe constructEvent over raw body
Webhook duplicate-event safety: PASS — durable ledger/claim/retry handling
Checkout idempotency: PASS — stable keys plus locked application processing
Duplicate subscription prevention: PASS — pending-session retirement, locks, DB uniqueness, identity CAS
Server-owned pricing: PASS — approved database price builds Checkout
Customer reuse: PASS — durable Stripe/application identity, ambiguity rejected
Future start-date behavior: PASS — trusted start date and billing anchor, covered tests
Stale Checkout protection: PASS — payment_link_version and pending session gates
Canceled application protection: PASS — completion skipped/reviewed; CAS blocks race
Historical metadata safety: PASS — legacy car_id/carId does not allocate or activate
carId:null preserved: PASS
Payment completion marks Paid only: PASS
Automatic rental creation: NO
Automatic car mutation: NO
Reconciliation safety: PASS — default dry-run, uncertain/cancelled records skipped
```

## Authentication / Authorization Review

- Admin routes are protected server-side; fleet imports apply auth/origin middleware
  to the whole router.
- Bearer credentials are verified with Supabase; encrypted cookie sessions are
  authenticated, refreshed, origin-checked for writes, and cleared on failure.
- Exact configured email authorization remains the production boundary.
- Unauthenticated, invalid, expired/refresh-failure, cross-origin, and wrong-email
  paths have tests. A trusted role-claim migration remains F-13.
- Private document routes are admin-only and now audited; no predictable public
  document URL is returned.

## Database / Migration Review

- Reviewed all 55 ordered migration files and searched destructive operations,
  foreign keys, uniqueness, indexes, checks, RLS, grants, and security-definer
  functions.
- Historical bootstrap/reset migrations are intentionally destructive and must
  never be rerun ad hoc against production. New changes are additive.
- Existing constraints protect one Stripe subscription per application, one
  operational customer per application/Stripe customer, and one live rental per
  application/subscription.
- Two production migrations are prepared but not applied: immutable admin audit
  history and private bounded application storage.
- Live `verify:schema-contract` is blocked because production Supabase credentials
  are absent from this checkout.

## Security Review

- No confirmed live secret pattern was found. Matches were synthetic PostgreSQL
  URLs in database unit tests; untracked agent worktrees repeat those fixtures.
- Service-role credentials remain server-only. Later migrations revoke anon and
  authenticated access to public application tables/functions.
- Helmet/CSP, constrained CORS, cookie security, trusted write origins, body limits,
  global/per-route rate limits, and sanitized API errors are present.
- Uploads reject unsupported declared types and mismatched magic bytes. Remaining
  low risk: there is no malware scanner/quarantine service.
- Health schema identifiers are redacted in production.

## Frontend / Admin Review

- Reviewed every public route and every dashboard tab: overview, applications,
  rentals, customers, invoices, financials, agreements, toll notices, maintenance,
  and fleet imports.
- Mutations use server endpoints and query invalidation; payment state is not
  inferred from client state.
- Loading, error, empty, pending, and responsive table/card variants exist.
- Unknown safe navigation paths now render the NotFound UI with HTTP 404.

## Accessibility / Mobile Review

- Source/component review covered labels, accessible names, focusable actions,
  dialog trapping/restoration, status/error roles, table semantics, reduced motion,
  focus indicators, touch targets, and mobile card alternatives.
- The pre-existing user change in `src/pages/Apply.tsx` adds a justified focusable
  scroll-region lint exception and was preserved untouched.
- Browser automation is not configured. Actual checks at 390x844, 430x932,
  768x1024, 1440x900, and 1920x1080, screenshots, console capture, screen-reader,
  and physical keyboard/device verification remain unavailable.

## Performance Review

- Public/admin routes and admin tabs are lazy split. Data tables are paginated and
  backend list endpoints cap page sizes.
- Homepage startup JavaScript: 149,991 bytes gzip against a 170,000-byte budget.
- Largest emitted optional chart chunk: 285.19 kB raw / 89.33 kB gzip; it is split
  from initial startup.
- Health probes are coalesced/cached; Stripe and database workflow calls use locks,
  idempotency, and bounded queries in critical paths.

## Changed Files

- `api/paymentActivation.ts`, `api/paymentLifecycle.ts`, and lifecycle/API tests —
  atomic payment, Stripe identity, operational-customer, and audit persistence.
- `api/middleware/auth.ts`, `api/routes/auth.ts`, and auth tests — trusted live
  admin entitlement with a revocable compatibility gate.
- `api/routes/applications.ts`, `api/routes/manualInvoices.ts`,
  `api/tests/api.test.ts` — sensitive document access audit.
- `api/routes/agreements.ts`, `api/agreementPdfStatus.ts` and test,
  `src/components/admin/tabs/AgreementsTab.tsx`, `src/lib/api.ts` — metadata-only
  polling and explicit signed access.
- `api/healthResponse.ts` and test, `api/index.ts` — production health redaction and
  soft-404 status.
- `api/frontendRouting.ts` and test — known SPA route classification.
- `src/lib/australiaDate.ts`, existing `src/lib/australiaDate.test.ts`,
  `AdminDashboard.tsx`, Rentals/Invoices/Financials tabs — DST-safe date display.
- `supabase/migrations/20260821120000_make_admin_audit_events_immutable.sql` —
  append-only audit invariant.
- `supabase/migrations/20260821121000_harden_application_document_bucket.sql`,
  `scripts/setup-bucket.ts` — private bounded storage contract.
- `api/newMigrationsContract.test.ts` — migration safety assertions.
- `playwright.config.ts`, `e2e/public-routes.spec.ts`, and
  `scripts/serve-e2e.ts` — five-viewport browser, accessibility, navigation,
  resource, 404, and anonymous-admin coverage without an auth bypass.
- `scripts/route-metadata.mjs`, `scripts/generate-route-html.mjs`,
  `api/frontendRouting.ts`, and metadata tests — delivered route-specific HTML.
- `docs/audits/admin-mutation-atomicity-2026-08-21.md`,
  `docs/release-hardening-operator-runbook.md`, and
  `scripts/verify-release-hardening.sql` — remaining atomicity matrix and secure
  production-only verification procedure.
- `render.yaml`, `api/renderConfig.test.ts` — email secret deployment contract.
- `package-lock.json` — compatible vulnerable transitive patches.
- `docs/security-model.md` — current resolved and remaining security posture.

`src/pages/Apply.tsx` was already modified before this audit and was not edited by
the audit. Untracked `.claude/worktrees/`, the spreadsheet lock file, and
`_to_delete/` were also pre-existing and untouched.

## Tests

Runtime: Node `v20.20.2`, npm `10.8.2`.

| Command | PASS / FAIL / NOT AVAILABLE | Notes |
| --- | --- | --- |
| `npm run lint` | PASS | Includes `tsc --noEmit` and ESLint, zero warnings |
| `npm run test` | PASS | 82 files, 745 tests |
| `npm run validate` | PASS | Re-ran lint and the same 745-test suite |
| `npm run build` | PASS | Vite client + TypeScript server |
| `npm audit --omit=dev --audit-level=high` | PASS | 0 vulnerabilities |
| `npm audit` | PASS | 0 vulnerabilities after compatible lock update |
| `git diff --check` | PASS | Final result recorded after report creation |
| `npm run typecheck` | PASS | Also included in lint/validate |
| `npm run check:bundle-budget` | PASS | 149,991 / 170,000 bytes gzip |
| built `/api/live` smoke | PASS | HTTP 200 from `server-dist` app |
| built `/api/health` smoke | PASS | HTTP 200 from `server-dist` app |
| `npm run verify:schema-contract` | NOT RUN | Operator-only; production credentials intentionally not used |
| `npm run test:integration` | NOT AVAILABLE | No script in `package.json` |
| `npm run test:e2e` | PASS | 40 checks across 390x844, 430x932, 768x1024, 1440x900, and 1920x1080 |
| CodeRabbit CLI review | NOT AVAILABLE | CLI not installed; manual second diff review completed |

## Remaining Risks

1. F-14: the mutations listed in the atomicity matrix still have separate business
   and audit writes or cross-system saga boundaries.
2. Uploaded identity documents have MIME/magic validation but no malware scanner;
   the accepted residual risk and operational option are documented.
3. Production admin entitlement must be provisioned and `entitlement` mode activated.
4. Production schema, RLS/object-policy state, Stripe settings, email domain, and
   Render environment were not live-verified.
5. Authenticated admin dashboard journeys and manual assistive-technology/device
   checks were not executed; authentication was not weakened for E2E.

## Production Manual Steps

1. Back up and stage-test the Supabase project.
2. Confirm the production migration ledger, then stage-test and apply in order:
   `20260821093210_make_verified_stripe_identity_atomic.sql`,
   `20260821120000_make_admin_audit_events_immutable.sql`, and
   `20260821121000_harden_application_document_bucket.sql`; do not edit history.
3. Run `npm run verify:schema-contract` with protected production credentials.
4. Verify both Storage buckets are private and no anon/authenticated object policy
   grants direct identity-document reads.
5. Set/verify `RESEND_API_KEY` in Render and verify the sending domain outside live
   customer flows.
6. Follow `docs/release-hardening-operator-runbook.md` to provision and revoke-test
   the trusted admin role before switching to `entitlement` mode.
7. Perform authenticated admin and manual accessibility/device checks.
8. Perform staging Stripe Checkout/webhook/retry/reconciliation smoke tests with
   test-mode Stripe before release.

## Deployment Status

```text
NOT DEPLOYED
```

No commit, push, Render deployment, production migration, Stripe live mutation,
secret rotation, or production data mutation was performed.
