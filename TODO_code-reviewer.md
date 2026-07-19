# Maple Rentals Code Review TODO

## Context

- [x] **CR-CTX-1.1 [Repository Baseline]**:
  - **Repository**: `C:\Users\abuba\maple-rental-clean`
  - **Branch / Commit**: `main` at `a1345b6`
  - **Remote**: `origin` is the Maple Rentals repository; no push or deploy was requested or performed.
  - **Initial State**: Clean worktree. The review was read-only until this TODO was created.

- [x] **CR-CTX-1.2 [Technology Baseline]**:
  - **Language / Framework**: TypeScript 5.8, React 19, React Router 7, Express 4, Vite 7, Vitest 4.
  - **Data / Integrations**: Supabase/PostgreSQL, Stripe Checkout/Billing, Resend, PDFKit/pdf-lib.
  - **Runtime**: Repository requirement is Node `20.x`; verification used Node `20.20.2` and npm `11.18.0`.
  - **Dependency Audit**: `npm audit --omit=dev --audit-level=moderate` reported zero known production dependency vulnerabilities.

- [x] **CR-CTX-1.3 [Purpose And Scope]**:
  - **Purpose**: Production rental SaaS covering public applications, admin operations, paid-only Stripe completion, documents, financial reporting, and maintenance workflows.
  - **Review Scope**: Repository-wide security, payment, data integrity, concurrency, performance, React/TypeScript quality, accessibility, migrations, and test coverage. Critical paths were deep-read; repository-wide searches covered injection sinks, secrets, unsafe HTML, authorization, unbounded queries, blocking operations, and async error paths.
  - **Architectural Constraint**: Preserve Maple's payment-only contract: Checkout metadata uses `carId: null`, successful payment marks the application `Paid`, and no car status or rental row is changed automatically.
  - **Tooling Constraint**: CodeRabbit was not installed, so the review used direct source inspection and repository-native checks.

- [x] **CR-CTX-1.4 [Standards And Integration Points]**:
  - **Standards**: Root `AGENTS.md`, repository skills, Zod validation, authenticated admin routes, Supabase RLS, Stripe signature verification, and additive production migrations.
  - **Integration Points**: Supabase Data API and storage, direct PostgreSQL transactions/advisory locks, Stripe Checkout and webhooks, Resend delivery, Render runtime, and browser CSV/PDF exports.
  - **Existing Checks**: `lint` is TypeScript compilation only; `test` runs Vitest; `validate` combines both. No `.github/workflows` CI workflow exists.

## Review Plan

- [x] **CR-PLAN-1.1 [Security Scan]**:
  - **Scope**: OWASP Top 10, authentication/session handling, authorization/RLS, injection, XSS, CSRF/origin protection, uploads, secrets, security headers, TLS, and data exposure.
  - **Priority**: Critical - complete before merge.

- [x] **CR-PLAN-1.2 [Payment And Concurrency Audit]**:
  - **Scope**: Checkout creation, future billing, idempotency, webhook ordering/replay, database locks, payment-only fulfillment, and duplicate subscription/session prevention.
  - **Priority**: Critical - complete before merge.

- [x] **CR-PLAN-1.3 [Performance Audit]**:
  - **Scope**: Database query bounds, pagination, Stripe pagination, resource lifecycles, blocking locks, network fan-out, and memory growth.
  - **Priority**: High - flag measurable bottlenecks.

- [x] **CR-PLAN-1.4 [Quality And Architecture Audit]**:
  - **Scope**: Type safety, React hooks/state, SOLID/separation of concerns, error propagation, accessibility, documentation, and testability.
  - **Priority**: High - identify defects and maintainability risks.

- [x] **CR-PLAN-1.5 [Data Integrity Audit]**:
  - **Scope**: Schema contracts, transaction boundaries, calculations, imports, audit writes, outbox/idempotency behavior, and partial failure recovery.
  - **Priority**: Critical - prevent inconsistent payment, financial, and legal-document state.

## Review Findings

### Implementation Status

- [x] **CR-IMPL-1.1 [Review Findings Implemented]**:
  - **Status**: All High, Medium, and Low findings below have been remediated in the worktree with focused regression coverage.
  - **Payment Contract**: Checkout fulfillment remains payment-only: `carId: null`, application status becomes `Paid`, and no car or rental row is mutated automatically.
  - **Validation**: Node `20.20.2`; strict TypeScript and ESLint passed; 55 test files and 474 tests passed; client/server production builds passed; production dependency audit reported zero vulnerabilities; `git diff --check` passed.

- [x] **CR-IMPL-1.2 [Apply Migrations To Isolated Local Supabase]**:
  - **Status**: Completed against the isolated WSL2 Supabase stack on 2026-07-14. Supabase CLI `2.109.1` applied every migration through `20260715022000`, and the application schema contract passed against the local Data API.
  - **Security Verification**: Confirmed anonymous application inserts and anonymous invoice-RPC execution are denied, service-role RPC execution is allowed, delivery-attempt RLS is enabled, and all Stripe rental event watermark columns exist.

- [x] **CR-IMPL-1.3 [Apply And Verify Production Supabase Migrations]**:
  - **Status**: Applied repository migrations `20260714033000` through `20260715022000` to the linked Maple production project on 2026-07-14 and reconciled the hosted migration-history versions with the repository filenames.
  - **Verification**: The production schema contract passed from an isolated Render job. Direct database checks confirmed anonymous application inserts are denied, service-role-only invoice RPC access is enforced, toll delivery-attempt RLS and Stripe event watermarks exist, `pg_trgm` is outside `public`, and the new foreign-key index is present.
  - **Data Safety**: The release changed schema, policies, functions, and indexes only. It did not modify application, payment, customer, car, or rental records.

### High Severity

- [x] **CR-ITEM-1.1 [Anonymous Data API Inserts Bypass Application Controls]**:
  - **Severity**: High
  - **Location**: `supabase/migrations/20260304004102_optimized_schema_snake_case.sql:121-123`; `supabase/migrations/20260711215014_production_hardening_audit.sql:221-223`; `api/routes/applications.ts:610-688`; `api/routes/applications.ts:221-229`; `src/pages/AdminDashboard.tsx:711-722`
  - **Description**: `anon` retains table-wide `INSERT` and `public_submit_application` uses `WITH CHECK (true)`. A caller with the public anon key can submit directly through PostgREST, set server-owned status/payment/approval fields, and bypass Express Zod validation, upload checks, duplicate detection, and rate limits. A direct insert can also store an arbitrary absolute document URL; the admin API returns unknown URLs unchanged and the dashboard opens them, enabling admin-targeted phishing.
  - **Reproduction**: Use the Supabase anon key to POST an `applications` row with `status: "Paid"` and an attacker-controlled `license_photo` URL. The RLS policy accepts the insert without traversing the Express route.
  - **Root Cause**: A legacy direct-insert contract remains enabled even though public submissions are now server-mediated.
  - **Recommendation**: Add an additive migration that drops the anonymous insert policy and revokes `INSERT` from `anon`. Return `null` for document references that cannot be resolved to the private application bucket. Add policy and URL-allowlist tests.
  - **Proposed Patch**: See `CR-PATCH-1.1`.

- [x] **CR-ITEM-1.2 [Future-Start Checkout Never Marks The Application Paid]**:
  - **Severity**: High
  - **Location**: `api/services/stripeCheckoutService.ts:180-208`; `api/services/stripeWebhookService.ts:621-636`; `api/services/stripeWebhookService.ts:681-690`; `api/services/stripeWebhookService.ts:720-734`; `api/tests/api.test.ts:5891-5945`; `api/tests/api.test.ts:7002-7039`
  - **Description**: Future starts set `billing_cycle_anchor` with `proration_behavior: "none"`. Checkout can complete with `payment_status: "no_payment_required"`, so the completion webhook correctly refuses to mark the application paid. At the first successful invoice, the webhook only updates a rental. Maple intentionally has no auto-created rental, and the missing-rental error is swallowed, leaving a paying customer's application `Approved` indefinitely.
  - **Reproduction**: Complete a future-dated Checkout, then deliver its first `invoice.payment_succeeded` at the anchor. The application remains `Approved`; the success UI remains in processing and no paid state is recorded.
  - **Root Cause**: The future invoice path is not connected to the payment-only application fulfillment path.
  - **Recommendation**: On a verified successful subscription invoice, resolve the vehicle Checkout Session and invoke the existing idempotent payment-only completion handler. Do not create a rental or mutate a car. Add an explicit pre-anchor `scheduled` result and an end-to-end test covering `no_payment_required` through the first paid invoice.
  - **Reference**: <https://docs.stripe.com/payments/checkout/billing-cycle>
  - **Proposed Patch**: See `CR-PATCH-1.2`.

- [x] **CR-ITEM-1.3 [Transient Stripe Read Failure Can Create Two Payable Sessions]**:
  - **Severity**: High
  - **Location**: `api/services/stripeCheckoutService.ts:710-741`; `api/services/stripeCheckoutService.ts:778-845`
  - **Description**: `resolvePendingCheckoutSession()` catches every Stripe retrieval failure and treats the existing session as replaceable. The next create uses a different retry seed and can persist a second Checkout Session. If the retrieve failed after Stripe received it, both sessions remain payable for the same application/version.
  - **Reproduction**: Persist open session S1, make `checkout.sessions.retrieve(S1)` time out, then retry Checkout creation. S2 is created under a new idempotency key while S1 remains open.
  - **Root Cause**: Transport, authentication, and rate-limit failures are conflated with a confirmed `resource_missing` or terminal session.
  - **Recommendation**: Re-throw transient/authentication/rate-limit errors. Replace only after Stripe confirms the old session is missing or terminal. Add tests for timeout, `resource_missing`, expired, complete, and open states.
  - **Proposed Patch**: See `CR-PATCH-1.3`.

- [x] **CR-ITEM-1.4 [Latest Migration References A Function Removed Earlier]**:
  - **Severity**: High
  - **Location**: `supabase/migrations/20260711215014_production_hardening_audit.sql:18-33`; `supabase/migrations/20260711215014_production_hardening_audit.sql:58-70`; `supabase/migrations/20260714033000_stripe_csv_imports.sql:1-32`
  - **Description**: The hardening migration moves the helper to `private.is_admin()` and drops `public.is_admin()`. The later Stripe CSV migration creates its policy with unqualified `is_admin()`. Under the normal search path, migration application fails at policy creation. The new table is also absent from the schema-contract and migration-safety tests.
  - **Reproduction**: Apply migrations in lexical order to a fresh local Supabase database. `20260714033000_stripe_csv_imports.sql` cannot resolve `is_admin()`.
  - **Root Cause**: The new migration copied the pre-hardening RLS pattern instead of the qualified private helper and least-privilege grant pattern.
  - **Recommendation**: Qualify `private.is_admin()`, add `WITH CHECK`, explicit grants/revokes, schema qualification, and a transaction. Extend migration tests to evaluate the final ordered contract.
  - **Proposed Patch**: See `CR-PATCH-1.4`.

- [x] **CR-ITEM-1.5 [External PostgreSQL TLS Is Not Authenticated]**:
  - **Severity**: High
  - **Location**: `api/db/postgres.ts:93-108`; `api/db/postgres.ts:139-159`; `api/db/postgres.ts:192-223`
  - **Description**: Supabase pooler connections force `rejectUnauthorized: false`; other supported external hosts receive no mandatory SSL config. Production validation checks session capability, not authenticated TLS. A misconfigured DSN can therefore accept an untrusted certificate or connect without TLS, exposing database credentials, applicant PII, and payment state.
  - **Root Cause**: Connection mode and SSL trust are inferred separately, and startup does not reject insecure external production configurations.
  - **Recommendation**: Require CA-verified TLS for every external production database host. Permit plaintext only for explicitly recognized localhost/private Render hosts. Reject `sslmode=disable` and fail startup when an external CA/trust configuration is missing.
  - **Reference**: <https://supabase.com/docs/guides/platform/ssl-enforcement>
  - **Proposed Patch**: See `CR-PATCH-1.5`.

- [x] **CR-ITEM-1.6 [Out-Of-Order Webhooks Can Regress Rental Payment State]**:
  - **Severity**: High
  - **Location**: `api/services/stripeWebhookService.ts:621-636`; `api/services/stripeWebhookService.ts:736-775`
  - **Description**: Subscription created/updated/deleted payloads are written directly to rentals without comparing `event.created` with the last applied event. Stripe does not guarantee webhook delivery order. An older `active` update delivered after a newer `past_due` event can incorrectly restore the rental to `Active`.
  - **Reproduction**: Process a newer `customer.subscription.updated` with `past_due`, then an older event for the same subscription with `active`. The second event overwrites `Overdue`.
  - **Root Cause**: Event-level idempotency prevents duplicate event IDs but does not provide per-subscription ordering.
  - **Recommendation**: Persist `stripe_status_event_created_at` and update rental status through one atomic comparison-and-set function. Alternatively retrieve current Stripe state before mutation, while still guarding against an older handler committing last. Add reversed-order concurrency tests.
  - **Reference**: <https://docs.stripe.com/webhooks#event-ordering>
  - **Proposed Patch**: See `CR-PATCH-1.6`.

- [x] **CR-ITEM-1.7 [Blocking Advisory Locks Can Exhaust The Payment Pool]**:
  - **Severity**: High
  - **Location**: `api/db/postgres.ts:210-223`; `api/db/postgres.ts:311-345`; `api/services/stripeCheckoutService.ts:778-845`
  - **Description**: The session pool defaults to ten connections and has no statement/lock timeout. `withPostgresAdvisoryLock()` uses blocking `pg_advisory_lock`, while Checkout holds the lock across Stripe network calls. Ten concurrent same-application requests can occupy all connections: one performs Stripe I/O and nine wait indefinitely, starving webhook/payment transactions.
  - **Reproduction**: Send ten concurrent Checkout-create requests with the same valid application token while delaying Stripe. Observe the pool become unavailable to unrelated transactional work.
  - **Root Cause**: Unbounded session locks are held around external network I/O.
  - **Recommendation**: Use `pg_try_advisory_lock` with a short deadline and return `409`/`503` on contention. Configure statement/lock timeouts, avoid holding DB resources across Stripe calls where possible, and add a pool-starvation test.
  - **Proposed Patch**: See `CR-PATCH-1.7`.

- [x] **CR-ITEM-1.8 [CSV Exports Permit Spreadsheet Formula Injection]**:
  - **Severity**: High
  - **Location**: `src/components/admin/tabs/ApplicationsTab.tsx:67-89`; `src/components/admin/tabs/RentalsTab.tsx:114-136`; `src/components/admin/tabs/InvoicesTab.tsx:219-252`
  - **Description**: Exporters quote cells but do not neutralize values beginning with `=`, `+`, `-`, or `@`. Public applicant fields flow into admin exports, so opening an exported file in Excel or similar software can evaluate attacker-controlled formulas.
  - **Reproduction**: Submit an applicant name such as `=HYPERLINK("https://example.invalid","Open")`, export applications, and open the CSV in a spreadsheet application.
  - **Root Cause**: CSV escaping is duplicated and handles delimiters/quotes, not formula-capable prefixes.
  - **Recommendation**: Centralize CSV encoding and prefix formula-like cells with an apostrophe. Cover leading spaces/tabs and all dangerous prefixes in unit tests; use the helper for every exporter.
  - **Proposed Patch**: See `CR-PATCH-1.8`.

- [x] **CR-ITEM-1.9 [Manual Invoice Creation Can Persist Corrupt Partial Records]**:
  - **Severity**: High
  - **Location**: `api/manualInvoices.ts:51-70`; `api/manualInvoices.ts:85-111`; `api/manualInvoices.ts:186-243`; `api/routes/manualInvoices.ts:39-52`
  - **Description**: The server accepts client-provided item `amount`, allowing totals to disagree with quantity, unit price, and GST. It then inserts the invoice header and line items in separate Supabase requests. If the item insert fails, a header with stored totals remains while the endpoint returns 500; a retry can collide on the invoice number or create a second generated number.
  - **Reproduction**: Submit quantity `1`, unit price `100`, GST `10`, amount `1`, then force the item insert to fail. The stored header can report subtotal `100`, GST `10`, total `1`, with no items.
  - **Root Cause**: Derived financial values are trusted from the client and related writes lack a transaction boundary.
  - **Recommendation**: Remove client-controlled `amount`, calculate all values server-side, and insert header/items/audit through one PostgreSQL transaction or transactional RPC. Test rollback on item/audit failure and concurrent invoice-number conflicts.
  - **Proposed Patch**: See `CR-PATCH-1.9`.

- [x] **CR-ITEM-1.10 [Failed Logout Hides A Still-Valid Admin Session]**:
  - **Severity**: High
  - **Location**: `src/pages/AdminDashboard.tsx:484-493`; `api/routes/auth.ts:108-110`
  - **Description**: The client swallows logout failures, clears its cache, and navigates to login. If the request was blocked or failed, the HttpOnly session cookie remains valid. Restoring connectivity and reopening the dashboard reuses the authenticated session while the UI previously implied logout succeeded.
  - **Root Cause**: Local navigation is treated as proof that the server invalidated the session.
  - **Recommendation**: Clear client state and redirect only after a successful server response. On failure, keep the authenticated view, show an explicit warning that the session remains active, and provide retry. Add an interaction test with a rejected logout request.
  - **Proposed Patch**: See `CR-PATCH-1.10`.

### Medium Severity

- [x] **CR-ITEM-2.1 [Delayed Expiration Can Clear A Replacement Checkout Session]**:
  - **Severity**: Medium
  - **Location**: `api/services/stripeCheckoutService.ts:710-741`; `api/services/stripeCheckoutService.ts:821-835`; `api/services/stripeWebhookService.ts:596-609`; `api/applicationPaymentState.ts:59-87`; `api/applicationPaymentState.ts:121-138`
  - **Description**: Replacement sessions retain the payment-link version. A termination webhook checks application/version but not whether the stored pending session ID equals the expired event's ID. A delayed S1 expiration can therefore clear active replacement S2.
  - **Recommendation**: Make session clearing a compare-and-set on application ID, link version, and expected current session ID. Test delayed S1 and current S2 events.
  - **Proposed Patch**: Included with `CR-PATCH-1.3`.

- [x] **CR-ITEM-2.2 [Financial CSV Totals Use Only Ten Rows And Ignore End Date]**:
  - **Severity**: Medium
  - **Location**: `api/routes/financials.ts:114-130`; `api/routes/financials.ts:141-159`; `src/components/admin/tabs/FinancialsTab.tsx:69-85`; `src/components/admin/tabs/FinancialsTab.tsx:126-132`
  - **Description**: The query applies `gte`, omits `lte`, sorts, and limits to ten rows. The API then sums those ten rows as `imported_balance_gross/net`. Any range with more than ten transactions is understated, and a historical range can include transactions after its requested end date.
  - **Reproduction**: Insert eleven matching rows and request the range; the oldest row is excluded from totals. Set an end date before the newest row; the newer row remains included.
  - **Recommendation**: Use a bounded database aggregate/RPC for full-range totals and a separate `gte`/`lte` limited query for the recent list. Add tests for eleven rows and end-date exclusion.
  - **Proposed Patch**: See `CR-PATCH-2.2`.

- [x] **CR-ITEM-2.3 [Customer Pagination Loads The Entire Dataset First]**:
  - **Severity**: Medium
  - **Location**: `api/routes/customers.ts:57-68`; `api/routes/customers.ts:85-115`; `api/routes/customers.ts:117-164`
  - **Description**: Each page request loads all current customers, sends all customer IDs through an `.in(...)` invoice query, aggregates every row in memory, and only then slices one page. Cost is `O(customers + invoices)` per request; the encoded ID list can exceed URL/filter limits.
  - **Recommendation**: Move visibility filtering and invoice aggregates into a SQL view/RPC, apply search and ordering in SQL, request only the page range, and return an exact count separately. Add a query-shape test proving page 1 does not fetch later rows.
  - **Proposed Patch**: See `CR-PATCH-2.3`.

- [x] **CR-ITEM-2.4 [Weekly Financials Fetch Unbounded Stripe Payout History]**:
  - **Severity**: Medium
  - **Location**: `api/routes/financials.ts:45-71`; `api/routes/financials.ts:114-123`; `api/routes/financials.ts:146-151`
  - **Description**: An admin-controlled range can start arbitrarily far in the past. The route sequentially fetches every Stripe payout page and retains all payouts before summing/slicing. Runtime is `O(payouts / 100)` network round trips with `O(payouts)` memory, creating timeout and rate-limit risk.
  - **Recommendation**: Validate `start <= end`, enforce a documented maximum range, aggregate incrementally, and use pagination/caching for history. Reject invalid dates rather than silently falling back.
  - **Proposed Patch**: See `CR-PATCH-2.4`.

- [x] **CR-ITEM-2.5 [Stripe Customer Import Stores Country In State]**:
  - **Severity**: Medium
  - **Location**: `scripts/import-stripe-admin-csv.js:139-152`; `scripts/import-stripe-admin-csv.js:165-174`; `api/routes/rentals.ts:588-590`
  - **Description**: The importer inserts `$7` into `customers.state` but supplies `row['Address Country']`. An Australian customer is stored with state `AU` instead of `NSW`, and the incorrect value later prefills toll notices.
  - **Root Cause**: CSV column mapping does not match the destination column.
  - **Recommendation**: Map `Address State` to `state`; add a separate country column only through an explicit schema change. Extract parsing/mapping into a testable function and add a representative Stripe CSV fixture.
  - **Proposed Patch**: See `CR-PATCH-2.5`.

- [x] **CR-ITEM-2.6 [Toll Email Can Be Sent Twice After A Database Failure]**:
  - **Severity**: Medium
  - **Location**: `api/routes/tollNotices.ts:291-343`
  - **Description**: Resend delivery occurs before notice delivery state is persisted. If Resend accepts the email and the subsequent database update fails, the endpoint reports failure while the notice remains unsent in the database; retrying sends a duplicate.
  - **Recommendation**: Add an outbox/send-attempt row with a unique `(notice_id, recipient, content_hash)` key, compare-and-set `pending -> sending`, use the provider idempotency key, then finalize notice and audit state transactionally. Test accepted-email/database-failure recovery.
  - **Proposed Patch**: See `CR-PATCH-2.6`.

- [x] **CR-ITEM-2.7 [Agreement Template Activation Is Non-Atomic]**:
  - **Severity**: Medium
  - **Location**: `api/routes/adminAgreements.ts:90-128`; `api/routes/adminAgreements.ts:139-170`; `supabase/migrations/20260509090000_add_agreement_templates.sql:13-18`
  - **Description**: Create/activate first deactivates all templates and then performs a separate insert/update. Failure between writes leaves no active template. Concurrent creates can also choose the same next version before the unique index rejects one after deactivation.
  - **Recommendation**: Use one transactional database function with a per-template advisory/row lock to allocate the next version, deactivate the prior version, and activate the target. Test second-write failure and two concurrent saves.
  - **Proposed Patch**: See `CR-PATCH-2.7`.

- [x] **CR-ITEM-2.8 [Completed Maintenance Reset Can Be Reported Failed And Stay Cached]**:
  - **Severity**: Medium
  - **Location**: `src/components/admin/tabs/MaintenanceTab.tsx:40-55`; `src/App.tsx:18-23`
  - **Description**: `onSuccess` awaits a follow-up dry run. If refresh fails, TanStack Query can surface an error after destructive deletion already succeeded. Affected application, rental, customer, invoice, stats, and financial caches are not invalidated and can remain visible for the five-minute stale period.
  - **Recommendation**: Treat reset completion and refresh as separate outcomes; invalidate every affected query after success and catch refresh failure without relabeling the deletion. Add interaction tests for successful reset/failed refresh.
  - **Proposed Patch**: See `CR-PATCH-2.8`.

- [x] **CR-ITEM-2.9 [Server-Paginated Tables Sort And Filter Only One Page]**:
  - **Severity**: Medium
  - **Location**: `src/components/admin/DataTable.tsx:168-204`; `src/components/admin/tabs/InvoicesTab.tsx:421-454`
  - **Description**: Local sort/filter logic still runs in server-pagination mode. A status filter can show no matches on page one even when later server pages contain matches, and sorting reorders only the current page while totals remain global.
  - **Recommendation**: Send sort/filter state to the API and include it in React Query keys. Until server support exists, disable local sort/filter controls when `isServerPagination` is true. Add multi-page component/API tests.
  - **Proposed Patch**: See `CR-PATCH-2.9`.

- [x] **CR-ITEM-2.10 [Manual Invoice Date Uses UTC Instead Of Sydney]**:
  - **Severity**: Medium
  - **Location**: `src/components/admin/tabs/InvoicesTab.tsx:65`; `src/components/admin/tabs/InvoicesTab.tsx:94-105`
  - **Description**: The default uses `new Date().toISOString().slice(0, 10)`. During Sydney morning hours this can be the prior calendar day, creating a legally relevant invoice date one day early.
  - **Recommendation**: Use the repository's Australia/Sydney date helper and add tests immediately before and after UTC/Sydney day boundaries.
  - **Proposed Patch**: See `CR-PATCH-2.10`.

- [x] **CR-ITEM-2.11 [Type, Hook, Accessibility, And Migration Checks Are Not Enforced]**:
  - **Severity**: Medium
  - **Location**: `tsconfig.json:2-29`; `tsconfig.server.json:2-18`; `package.json:28-30`; `src/components/admin/tabs/AgreementsTab.tsx:18-25`; `src/components/admin/tabs/AgreementsTab.tsx:443`; `src/components/admin/tabs/AgreementsTab.tsx:506`; `.github/`
  - **Description**: Frontend/server configs omit `strict`; production-adjacent code contains `any`; `lint` is only `tsc --noEmit`; React Hooks and accessibility rules are absent. No CI workflow enforces lint, tests, build, or ordered migration checks, which allowed `CR-ITEM-1.4` to remain green across 416 tests.
  - **Recommendation**: Introduce strictness in stages, replace agreement/payment `any` types first, add ESLint React Hooks/accessibility rules, and add Node 20 CI with an ordered migration-contract check. Do not enable strict mode globally until its resulting errors are triaged and fixed.
  - **Proposed Patch**: See `CR-PATCH-2.11`.

- [x] **CR-ITEM-2.12 [Admin Modals Lack Dialog Semantics And Focus Control]**:
  - **Severity**: Medium
  - **Location**: `src/pages/AdminDashboard.tsx:1057-1075`; `src/pages/AdminDashboard.tsx:1579-1601`; `src/pages/AdminDashboard.tsx:1655-1669`; `src/components/admin/tabs/AgreementsTab.tsx:559-580`
  - **Description**: Custom modals do not trap focus, restore focus, handle Escape consistently, or expose dialog names/roles. Some icon-only close controls lack accessible names. Keyboard and screen-reader users can interact with obscured background controls.
  - **Recommendation**: Replace custom wrappers with the already-installed Fluent UI `Dialog`, `DialogSurface`, `DialogTitle`, and `DialogBody`; add accessible names and keyboard interaction tests.

### Low Severity

- [x] **CR-ITEM-3.1 [Production Error Boundary Displays Raw Exception Messages]**:
  - **Severity**: Low
  - **Location**: `src/components/ErrorBoundary.tsx:136-149`
  - **Description**: The fallback renders `error.message` to end users. Chunk, route, or unexpected API errors can expose internal implementation details without helping recovery.
  - **Recommendation**: Show a generic production message and diagnostic ID; retain raw details only in development/telemetry.

- [x] **CR-ITEM-3.2 [Toll Generation Can Produce An Unhandled Rejection]**:
  - **Severity**: Low
  - **Location**: `src/components/admin/tabs/TollStatDecTab.tsx:540-547`
  - **Description**: The event handler awaits `mutateAsync()` without a catch even though `onError` updates UI state, leaving a browser `unhandledrejection`.
  - **Recommendation**: Use `mutate()` or catch the rejected promise and keep a single error-reporting path.

- [x] **CR-ITEM-3.3 [Contact Navigation Is Marked Current On Unrelated Routes]**:
  - **Severity**: Low
  - **Location**: `src/components/Navbar.tsx:27-28`; `src/components/Navbar.tsx:45-50`
  - **Description**: Splitting `/#contact` produces `/`, and every path starts with `/`, so Contact can receive `aria-current="page"` on Pricing, Apply, and other routes.
  - **Recommendation**: Match both `location.pathname === '/'` and `location.hash === '#contact'` for the contact anchor.

## Proposed Code Changes

- [x] **CR-PATCH-1.1 [Retire Anonymous Inserts And Reject External Document URLs]**:

```diff
--- /dev/null
+++ b/supabase/migrations/20260715000000_retire_anonymous_application_inserts.sql
@@
+BEGIN;
+
+DROP POLICY IF EXISTS public_submit_application ON public.applications;
+REVOKE INSERT ON TABLE public.applications FROM anon;
+
+COMMIT;
```

```diff
--- a/api/routes/applications.ts
+++ b/api/routes/applications.ts
@@
   const storagePath = extractStoragePath(path);
   if (!storagePath) {
-    return path;
+    return null;
   }
```

- [x] **CR-PATCH-1.2 [Fulfill Future-Start Payment From The First Paid Invoice]**:

```diff
--- a/api/services/stripeWebhookService.ts
+++ b/api/services/stripeWebhookService.ts
@@
       case 'invoice.payment_succeeded': {
         const invoice = event.data.object as Stripe.Invoice;
         const subscriptionReference = (
           invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }
         ).subscription;
         const subscriptionId =
           typeof subscriptionReference === 'string'
             ? subscriptionReference
             : subscriptionReference?.id || null;
         if (subscriptionId) {
           const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
+          if (subscription.metadata.checkout_kind === 'vehicle') {
+            const sessions = await getStripe().checkout.sessions.list({
+              subscription: subscriptionId,
+              limit: 10,
+            });
+            const session = sessions.data.find((candidate) =>
+              candidate.metadata?.checkout_kind === 'vehicle' &&
+              candidate.metadata?.application_id === subscription.metadata.application_id
+            );
+            if (!session) {
+              throw new Error(`No vehicle Checkout Session found for ${subscriptionId}`);
+            }
+            fulfillmentOutcome = await handleVehicleCheckoutCompletion(session);
+          }
           if (subscription.status === 'active') {
             await updateRentalBySubscriptionIdentityOrSkip(/* existing arguments */);
           }
         }
```

  - Keep `handleVehicleCheckoutCompletion()` payment-only and idempotent. Extract the repeated invoice subscription-ID compatibility cast into a typed helper during implementation.

- [x] **CR-PATCH-1.3 [Classify Session Retrieval Errors And Use Compare-And-Set]**:

```diff
--- a/api/services/stripeCheckoutService.ts
+++ b/api/services/stripeCheckoutService.ts
@@
   } catch (error) {
-    console.warn(`Unable to reuse checkout session ${pendingSessionId}:`, error);
+    if (!(error instanceof Stripe.errors.StripeInvalidRequestError) || error.code !== 'resource_missing') {
+      throw error;
+    }
+    console.warn(`Pending checkout session ${pendingSessionId} no longer exists in Stripe.`);
   }
```

```diff
--- a/api/applicationPaymentState.ts
+++ b/api/applicationPaymentState.ts
@@
 export const clearPendingCheckoutSessionIfCurrent = async ({
   applicationId,
   expectedPaymentLinkVersion,
+  expectedSessionId,
 }: ClearPendingCheckoutSessionInput) =>
   db.from('applications')
     .update({ pending_checkout_session_id: null })
     .eq('id', applicationId)
     .eq('payment_link_version', expectedPaymentLinkVersion)
+    .eq('pending_checkout_session_id', expectedSessionId);
```

- [x] **CR-PATCH-1.4 [Repair Stripe CSV Migration RLS]**:

```diff
--- a/supabase/migrations/20260714033000_stripe_csv_imports.sql
+++ b/supabase/migrations/20260714033000_stripe_csv_imports.sql
@@
-CREATE TABLE IF NOT EXISTS stripe_balance_transactions (
+BEGIN;
+
+CREATE TABLE IF NOT EXISTS public.stripe_balance_transactions (
@@
-ALTER TABLE stripe_balance_transactions ENABLE ROW LEVEL SECURITY;
+ALTER TABLE public.stripe_balance_transactions ENABLE ROW LEVEL SECURITY;
+REVOKE ALL ON public.stripe_balance_transactions FROM anon, authenticated;
+GRANT SELECT, INSERT, UPDATE, DELETE ON public.stripe_balance_transactions TO authenticated;
+GRANT ALL ON public.stripe_balance_transactions TO service_role;

-DROP POLICY IF EXISTS admin_full_access ON stripe_balance_transactions;
-CREATE POLICY admin_full_access ON stripe_balance_transactions FOR ALL TO authenticated USING (is_admin());
+DROP POLICY IF EXISTS admin_full_access ON public.stripe_balance_transactions;
+CREATE POLICY admin_full_access
+  ON public.stripe_balance_transactions FOR ALL TO authenticated
+  USING (private.is_admin())
+  WITH CHECK (private.is_admin());
+
+COMMIT;
```

- [x] **CR-PATCH-1.5 [Require Authenticated External PostgreSQL TLS]**:

```diff
--- a/api/db/postgres.ts
+++ b/api/db/postgres.ts
@@
-const getPostgresSslConfig = (connectionString: string) =>
-  shouldUseRelaxedPostgresSsl(connectionString)
-    ? { rejectUnauthorized: false as const }
-    : undefined;
+const getPostgresSslConfig = (connectionString: string) => {
+  const hostname = new URL(connectionString).hostname;
+  const isPrivate = hostname === 'localhost' || hostname.endsWith('.internal');
+  if (isPrivate) return undefined;
+
+  const ca = (process.env.DATABASE_SSL_CA || '').replace(/\\n/g, '\n').trim();
+  if (process.env.NODE_ENV === 'production' && !ca) {
+    throw new Error('DATABASE_SSL_CA is required for external PostgreSQL hosts.');
+  }
+  return { ca: ca || undefined, rejectUnauthorized: true as const };
+};
```

- [x] **CR-PATCH-1.6 [Guard Webhook Status By Event Time]**:

```diff
--- /dev/null
+++ b/supabase/migrations/20260715001000_order_subscription_status_events.sql
@@
+BEGIN;
+ALTER TABLE public.rentals
+  ADD COLUMN IF NOT EXISTS stripe_status_event_created_at TIMESTAMPTZ;
+CREATE INDEX IF NOT EXISTS idx_rentals_stripe_status_event_created_at
+  ON public.rentals (stripe_subscription_id, stripe_status_event_created_at);
+COMMIT;
```

```ts
// Execute as one guarded UPDATE/RPC, not a read followed by a write.
await updateRentalStatusFromStripe({
  subscriptionId,
  status: nextStatus,
  eventCreatedAt: new Date(event.created * 1000).toISOString(),
  onlyIfNewer: true,
});
```

- [x] **CR-PATCH-1.7 [Bound Advisory-Lock Waits]**:

```diff
--- a/api/db/postgres.ts
+++ b/api/db/postgres.ts
@@
-    await client.query('SELECT pg_advisory_lock($1, $2)', [keyPartOne, keyPartTwo]);
+    const lockResult = await client.query<{ acquired: boolean }>(
+      'SELECT pg_try_advisory_lock($1, $2) AS acquired',
+      [keyPartOne, keyPartTwo]
+    );
+    if (!lockResult.rows[0]?.acquired) {
+      const error = new Error('Checkout is already being prepared. Please retry shortly.');
+      (error as Error & { status?: number }).status = 409;
+      throw error;
+    }
```

- [x] **CR-PATCH-1.8 [Centralize Formula-Safe CSV Encoding]**:

```ts
// Proposed: src/lib/csv.ts
const CSV_FORMULA_PREFIX = /^[\t\r ]*[=+\-@]/;

export const encodeCsvCell = (value: unknown) => {
  const raw = String(value ?? '');
  const safe = CSV_FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
};
```

  - Replace all three tab-local encoders with this helper and add a single parameterized unit suite.

- [x] **CR-PATCH-1.9 [Derive Invoice Amounts And Make Creation Transactional]**:

```diff
--- a/api/manualInvoices.ts
+++ b/api/manualInvoices.ts
@@
 export const manualInvoiceItemInputSchema = z.object({
   description: z.string().trim().min(1).max(500),
   quantity: z.coerce.number().finite().positive(),
   unit_price: moneySchema,
   gst: moneySchema.default(0),
-  amount: moneySchema.optional(),
 });
@@
-    const amount = roundMoney(item.amount ?? quantity * unitPrice + gst);
+    const amount = roundMoney(quantity * unitPrice + gst);
```

```ts
// Replace the two Supabase inserts with one transactional RPC/direct-PG operation.
const invoice = await createManualInvoiceTransaction({
  invoice: invoicePayload,
  items,
  audit: { actor: adminEmail, action: 'manual_invoice.created' },
});
```

- [x] **CR-PATCH-1.10 [Do Not Claim Logout Succeeded After Failure]**:

```diff
--- a/src/pages/AdminDashboard.tsx
+++ b/src/pages/AdminDashboard.tsx
@@
   const handleLogout = async () => {
     try {
       await api.logoutAdmin();
-    } catch (error) {
-      console.error('Logout error:', error);
+      queryClient.clear();
+      navigate('/admin/login', { replace: true });
+    } catch (error) {
+      showNotification(
+        getApiErrorMessage(error, 'Logout failed. Your admin session is still active.'),
+        'error'
+      );
     }
-    queryClient.clear();
-    navigate('/admin/login', { replace: true });
   };
```

- [x] **CR-PATCH-2.2 [Separate Full-Range Balance Aggregates From Recent Rows]**:

```ts
const range = {
  start: new Date(created.gte * 1000).toISOString(),
  end: created.lte ? new Date(created.lte * 1000).toISOString() : null,
};

const [totals, recent] = await Promise.all([
  db.rpc('aggregate_stripe_balance_transactions', range),
  applyCreatedAtRange(
    db.from('stripe_balance_transactions').select('*'),
    range
  ).order('created_at', { ascending: false }).limit(10),
]);
```

- [x] **CR-PATCH-2.3 [Move Customer Aggregation And Pagination Into SQL]**:
  - Add a `current_customer_invoice_summary` view or security-invoker RPC returning one row per customer with invoice totals.
  - Apply `search`, stable ordering, `range(offset, offset + pageSize - 1)`, and exact count at the database layer.
  - Remove the all-customer `.in('customer_id', customerIds)` request and in-memory slice.

- [x] **CR-PATCH-2.4 [Bound Payout Reports]**:

```ts
const MAX_REPORT_DAYS = 366;
if (created.lte && created.lte < created.gte) {
  return res.status(400).json({ error: 'endDate must not precede startDate.' });
}
if ((created.lte ?? Math.floor(Date.now() / 1000)) - created.gte > MAX_REPORT_DAYS * 86400) {
  return res.status(400).json({ error: `Date range cannot exceed ${MAX_REPORT_DAYS} days.` });
}
```

- [x] **CR-PATCH-2.5 [Correct Stripe CSV State Mapping]**:

```diff
--- a/scripts/import-stripe-admin-csv.js
+++ b/scripts/import-stripe-admin-csv.js
@@
-      nullable(row['Address Country']),
+      nullable(row['Address State']),
```

- [x] **CR-PATCH-2.6 [Persist Toll Delivery Through An Outbox]**:
  - Add `toll_notice_delivery_attempts` with a unique `notice_id`, normalized recipient, and content hash.
  - Claim an attempt atomically before Resend, pass the stable attempt ID as the provider idempotency key, and finalize attempt/notice/audit in one transaction.
  - A retry must resume or reconcile the same attempt instead of issuing a new email.

- [x] **CR-PATCH-2.7 [Activate Agreement Versions Transactionally]**:
  - Add a database function that locks `template_key`, allocates `max(version) + 1`, inserts/activates the new row, and deactivates the previous row in one transaction.
  - Reuse the function for both create and activate routes; keep the unique active-template index as the final invariant.

- [x] **CR-PATCH-2.8 [Separate Reset Completion From Refresh]**:

```ts
onSuccess: async (data) => {
  setLastDeletedCounts(data.deleted || null);
  await Promise.all([
    'applications', 'approved-applications', 'rentals', 'operational-customers',
    'operational-invoices', 'stats', 'weekly-financials',
  ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));

  try {
    const refreshed = await api.resetImportedDataDryRun();
    setDryRunResult(refreshed);
    setStatusMessage('Reset complete. Counts refreshed from the database.');
  } catch {
    setStatusMessage('Reset complete, but refreshed counts could not be loaded.');
  }
}
```

- [x] **CR-PATCH-2.9 [Disable Local Sort And Filter In Server Mode]**:

```ts
const visibleRows = useMemo(
  () => isServerPagination ? rows : sortAndFilterRows(rows, columns, sort, filters),
  [isServerPagination, rows, columns, sort, filters]
);
const isSortable = !isServerPagination && column.sortable !== false;
```

  - This is the safe interim behavior. The complete fix is server-side sort/filter with those values included in the query key.

- [x] **CR-PATCH-2.10 [Use Sydney Date For Manual Invoices]**:

```diff
--- a/src/components/admin/tabs/InvoicesTab.tsx
+++ b/src/components/admin/tabs/InvoicesTab.tsx
@@
-const today = () => new Date().toISOString().slice(0, 10);
+const today = () => getTodayInAustralia();
```

- [x] **CR-PATCH-2.11 [Add Enforced CI Before Enabling Strict Mode]**:

```yaml
# Proposed: .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20.20.2
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build
      - run: npm audit --omit=dev --audit-level=moderate
```

  - Add an ordered migration-contract test before relying on CI. Introduce TypeScript strictness by module, starting with payment, agreement, and admin mutation types.

## Commands

- [x] **CR-CMD-1.1 [Checks Executed During Review]**:

```powershell
Set-Location -LiteralPath "C:\Users\abuba\maple-rental-clean"
$env:PATH = "$env:NVM_HOME\v20.20.2;$env:PATH"

npm run lint
npm run test
npm run validate
npm audit --omit=dev --audit-level=moderate
```

  - `npm run lint`: Passed.
  - `npm run test`: Passed, 41 files and 416 tests.
  - `npm run validate`: Passed, including a second clean TypeScript and 416-test run.
  - `npm audit --omit=dev --audit-level=moderate`: Passed, zero known production dependency vulnerabilities.
  - `npm run build`: Not run during the review because it writes generated `dist`/`server-dist` output and the user limited file creation/editing to this TODO.

- [x] **CR-CMD-1.2 [Required Local Verification After Fixes]**:

```powershell
Set-Location -LiteralPath "C:\Users\abuba\maple-rental-clean"
$env:PATH = "$env:NVM_HOME\v20.20.2;$env:PATH"

npm install
npm run lint
npm run test
npm run validate
npm run build
npm audit --omit=dev --audit-level=moderate
git diff --check
git status --short
```

- [x] **CR-CMD-1.3 [Required Isolated Migration Verification]**:

```powershell
Set-Location -LiteralPath "C:\Users\abuba\maple-rental-clean"
# Docker runs inside WSL2 on this workstation.
wsl.exe -d Ubuntu-24.04 -u root -- bash -lc 'cd /mnt/c/Users/abuba/maple-rental-clean && npx --yes supabase@2.109.1 start'
wsl.exe -d Ubuntu-24.04 -u root -- bash -lc 'cd /mnt/c/Users/abuba/maple-rental-clean && npx --yes supabase@2.109.1 db reset --local'
$localSupabaseEnv = wsl.exe -d Ubuntu-24.04 -u root -- bash -lc 'cd /mnt/c/Users/abuba/maple-rental-clean && npx --yes supabase@2.109.1 status -o env'
$localConfig = @{}
foreach ($line in $localSupabaseEnv) {
  if ($line -match '^([A-Z0-9_]+)="(.*)"$') { $localConfig[$matches[1]] = $matches[2] }
}
$env:SUPABASE_URL = $localConfig.API_URL
$env:SUPABASE_SERVICE_ROLE_KEY = $localConfig.SERVICE_ROLE_KEY
npm run verify:schema-contract
Remove-Item Env:SUPABASE_URL, Env:SUPABASE_SERVICE_ROLE_KEY
```

  - Run only against the local Supabase instance. Do not reset or mutate production.
  - **Current Result**: Passed. The clean reset applied the full migration chain, the local migration ledger is aligned through `20260715021000`, direct PostgreSQL security assertions passed, and `npm run verify:schema-contract` passed against the local Supabase API.

- [x] **CR-CMD-1.4 [Required Targeted Regression Coverage]**:
  - Add and run tests for anonymous RLS denial, future-start first payment, Stripe retrieve timeout, delayed session expiration, out-of-order subscription events, advisory-lock contention, invoice transaction rollback, formula-safe CSV, financial ranges over ten rows, customer server pagination, Sydney date boundaries, and failed logout/reset refresh.

## Effort & Priority Assessment

- [x] **CR-EFFORT-1.1 [Prioritization Matrix]**:

| Priority | Findings | Implementation Effort | Complexity | Dependencies |
|---|---|---:|---|---|
| P0 / 10 | CR-ITEM-1.1, 1.2, 1.3, 1.4 | 2-4 days total | Complex | Supabase migration test environment; Stripe test-mode fixtures |
| P1 / 9 | CR-ITEM-1.5, 1.6, 1.7, 1.8, 1.9, 1.10 | 4-7 days total | Moderate-Complex | Database CA/env coordination; transactional SQL/RPC; browser tests |
| P2 / 7 | CR-ITEM-2.1 through 2.7 | 4-7 days total | Moderate-Complex | Stripe mocks; SQL views/RPC; Resend idempotency/outbox |
| P2 / 6 | CR-ITEM-2.8 through 2.12 | 3-6 days total | Moderate | React interaction tests; CI; staged typing; Fluent UI dialogs |
| P3 / 3 | CR-ITEM-3.1 through 3.3 | 2-4 hours total | Simple | Frontend unit/accessibility tests |

- [x] **CR-EFFORT-1.2 [Recommended Sequence]**:
  - **Phase 1**: Block anonymous writes, repair the broken migration, fix future-start fulfillment, and prevent duplicate payable sessions.
  - **Phase 2**: Add ordered webhook state, bounded locks, authenticated DB TLS, transactional invoice creation, and CSV neutralization.
  - **Phase 3**: Correct financial/import data, move pagination/aggregates server-side, and add delivery/template transactions.
  - **Phase 4**: Fix admin state/accessibility issues and establish CI/strictness gates.

## Positive Practices

- [x] **CR-POS-1.1 [Payment Safety]**: Checkout tokens use HMAC, constant-time comparison, expiry, purpose/application/version binding, and `carId: null` (`api/checkoutTokens.ts:80-128`).
- [x] **CR-POS-1.2 [Payment-Only Fulfillment]**: Paid Checkout fulfillment is transactionally idempotent and does not mutate cars or create rentals (`api/paymentActivation.ts:228-313`; `api/paymentActivation.ts:316-471`).
- [x] **CR-POS-1.3 [Webhook Authenticity]**: Stripe signatures are verified against the raw request body before JSON parsing (`api/index.ts:436-442`; `api/routes/webhooks.ts:27-52`).
- [x] **CR-POS-1.4 [Input And Upload Controls]**: Public application payloads use Zod and uploads enforce count, size, MIME allowlists, and magic bytes (`api/routes/applications.ts:396-446`).
- [x] **CR-POS-1.5 [Frontend Injection Controls]**: No `dangerouslySetInnerHTML`, `eval`, or `document.write` usage was found; agreement preview content is escaped/rendered as text.
- [x] **CR-POS-1.6 [Resource Cleanup]**: Toll preview requests use abort signals and object URLs are revoked.
- [x] **CR-POS-1.7 [Performance Foundations]**: Large routes/admin tabs are lazy-loaded and React Query keys generally include owned search/page/filter inputs.
- [x] **CR-POS-1.8 [Regression Baseline]**: Existing tests explicitly verify that paid completion does not mutate a car or create a rental (`api/tests/api.test.ts:6763-6831`).

## Quality Assurance Task Checklist

- [x] **CR-QA-1.1 [Security Classification]**: Confirmed security vulnerabilities are classified High and appear first; no evidence-supported Critical issue was found.
- [x] **CR-QA-1.2 [Performance Evidence]**: Performance findings identify measurable row, request, memory, or connection-pool growth; micro-optimizations were excluded.
- [x] **CR-QA-1.3 [Actionable Remediation]**: Every finding has a concrete remediation path; non-trivial changes include code, SQL, or file-level patch guidance.
- [x] **CR-QA-1.4 [Bug Reproduction]**: High-impact bugs include a reproduction or failure interleaving where practical.
- [x] **CR-QA-1.5 [Framework Practices]**: React hooks/query state, Express request handling, PostgreSQL transactions/RLS, Stripe webhook/idempotency behavior, TypeScript, and accessibility were checked.
- [x] **CR-QA-1.6 [Location Accuracy]**: File paths and line references were checked against commit `a1345b6`; re-check lines after implementation changes shift the files.
- [x] **CR-QA-1.7 [Scope Coverage]**: Security, performance, quality, bugs, data integrity, input handling, data flow, error paths, architecture, and test coverage are represented.
- [x] **CR-QA-1.8 [Positive Controls]**: Existing secure and well-structured behavior is acknowledged separately.
- [x] **CR-QA-1.9 [False-Positive Control]**: The historic `applications_status_check` cancellation concern was excluded after a later schema-recreation migration proved that constraint is not present in the migration end state.
- [x] **CR-QA-1.10 [Release Controls]**: Production operations began only after the explicit `do all` instruction. Target identity was verified before mutation, migrations were applied sequentially and checked directly, Stripe endpoint rotation uses overlapping secrets for deployment safety, and no customer/payment/rental business records were changed.

## Final Independent Fix Verification

Verified against the current checkout at `b81da3b18516a72476d088d55881248655a5f8c5`, not from the historical checkbox state. The focused remediation in this pass added a persisted Stripe subscription-to-Checkout Session relation so future invoice fulfillment resolves the exact session before using the pre-migration compatibility fallback.

| Finding | Verification status | Evidence | Regression test | Files changed in final pass | Remaining limitation |
| --- | --- | --- | --- | --- | --- |
| CR-ITEM-1.1 | Verified fixed | Anonymous application INSERT is retired; document endpoints reject external URLs; server mediation remains the public path. | `api/tests/securityPolicy.test.ts`, application/document API tests, migration checks | None in final pass | Live RLS assertion requires isolated Supabase. |
| CR-ITEM-1.2 | Verified fixed | Future `no_payment_required` checkout remains scheduled; first paid invoice resolves the persisted Checkout Session and records `Paid` only. | Future-start invoice test in `api/tests/api.test.ts` | `api/services/stripeWebhookService.ts`, `api/tests/api.test.ts`, schema/migration files | Legacy rows use a narrow Stripe-list fallback. |
| CR-ITEM-1.3 | Verified fixed | Transient Stripe reads rethrow; replacement requires `resource_missing` or terminal state; idempotency seed is stable. | `api/services/stripeCheckoutService.test.ts`, checkout API tests | None in final pass | None identified in source/tests. |
| CR-ITEM-1.4 | Verified fixed | Later migrations qualify `private.is_admin()` and final policies include `WITH CHECK`; migration safety covers the repaired chain. | `api/dataWorkflowMigrations.test.ts`, `api/migrationSafety.test.ts` | `api/migrationSafety.test.ts` | Clean DB execution was blocked by Docker permission. |
| CR-ITEM-1.5 | Verified fixed | External DSNs enforce verified TLS; insecure `sslmode` is rejected; localhost/private/Render internal hosts are explicit. | `api/db/postgres.test.ts` | `api/db/postgres.ts`, `api/db/postgres.test.ts` | Certificate-chain acceptance needs a live DB connection. |
| CR-ITEM-1.6 | Verified fixed | Rental status writes use atomic event-created watermarks and deterministic terminal tie handling. | Reversed-order webhook tests and migration checks | None in final pass | None identified in source/tests. |
| CR-ITEM-1.7 | Verified fixed | Advisory locks use non-blocking `pg_try_advisory_lock` and release clients on contention/failure. | `api/db/postgres-advisory-lock.test.ts`, checkout lock tests | None in final pass | Live pool-starvation load test not run. |
| CR-ITEM-1.8 | Verified fixed | All admin CSV exporters use the centralized formula-safe encoder. | `src/lib/csv.test.ts` | None in final pass | None identified in source/tests. |
| CR-ITEM-1.9 | Verified fixed | Invoice totals are server-derived and header/items/audit are written by one transaction RPC. | `api/manualInvoices.transaction.test.ts`, API invoice rollback tests | None in final pass | Database rollback execution needs local Supabase. |
| CR-ITEM-1.10 | Verified fixed | Logout clears state only after server success and preserves authenticated UI on failure. | `src/lib/adminLogout.test.ts`, auth API tests | None in final pass | Browser-level cookie invalidation not run. |
| CR-ITEM-2.1 | Verified fixed | Pending session clearing compares application, version, and expected session ID. | Delayed-expiration webhook test | None in final pass | None identified in source/tests. |
| CR-ITEM-2.2 | Verified fixed | Financial aggregates are full-range and recent rows are separately limited with inclusive end date. | Financial API range/pagination tests | None in final pass | None identified in source/tests. |
| CR-ITEM-2.3 | Verified fixed | Customer search, count, invoice totals, and page slicing are in the SQL RPC. | Customer pagination tests | None in final pass | SQL execution needs local Supabase for query-plan proof. |
| CR-ITEM-2.4 | Verified fixed | Stripe payout pagination is incremental, bounded by date range, and retains only recent display rows. | Financial payout pagination tests | None in final pass | None identified in source/tests. |
| CR-ITEM-2.5 | Verified fixed | Stripe `Address State` maps to customer state. | `scripts/import-stripe-admin-csv.test.ts` | None in final pass | None identified in source/tests. |
| CR-ITEM-2.6 | Verified fixed | Toll delivery claims, stable provider idempotency, and finalization use server-only outbox RPCs. | `api/routes/tollNotices.delivery.test.ts` | None in final pass | Provider/database reconciliation still needs operational monitoring. |
| CR-ITEM-2.7 | Verified fixed | Agreement version allocation/activation uses transactional RPCs and advisory transaction locks. | `api/routes/adminAgreements.atomic.test.ts` | None in final pass | Concurrent execution needs local PostgreSQL. |
| CR-ITEM-2.8 | Verified fixed | Maintenance reset success is separated from refresh failure and caches are invalidated. | `api/tests/adminMaintenanceReset.test.ts`, admin API tests | None in final pass | None identified in source/tests. |
| CR-ITEM-2.9 | Verified fixed | Server-paginated tables carry query state in keys and avoid local whole-dataset filtering. | Data table/admin pagination tests | None in final pass | None identified in source/tests. |
| CR-ITEM-2.10 | Verified fixed | Manual invoice dates use date-only values and Sydney-aware generation paths. | Manual invoice and Australia-date tests | None in final pass | None identified in source/tests. |
| CR-ITEM-2.11 | Verified fixed | Strict TypeScript, React Hooks, JSX accessibility lint, migration safety, and full validation are enforced locally. | `npm run validate`; 55 files/477 tests | `api/schemaContract.ts`, `api/schemaContract.test.ts`, migration test files | No CI workflow was added in this pass. |
| CR-ITEM-2.12 | Verified fixed | Admin dialogs use dialog semantics, accessible names, focus trapping/restoration, Escape, and labeled controls. | `src/components/admin/AccessibleDialog.test.tsx` | None in final pass | Full browser assistive-tech audit not run. |
| CR-ITEM-3.1 | Verified fixed | Production error boundaries return generic safe messaging. | `src/components/ErrorBoundary.test.tsx` | None in final pass | None identified in source/tests. |
| CR-ITEM-3.2 | Verified fixed | Toll generation async failures are handled by mutation callbacks. | Toll generation/API tests | None in final pass | None identified in source/tests. |
| CR-ITEM-3.3 | Verified fixed | Navbar `aria-current` is route-specific, including contact fragment behavior. | `src/components/Navbar.test.ts` | None in final pass | None identified in source/tests. |

### Final validation evidence

- Node `v20.20.2`; npm `11.17.0`; Supabase CLI `2.109.1`.
- `npm ci`: passed after removing the incomplete ignored `node_modules` tree and rerunning with dev/optional dependencies.
- `npm run lint`: passed; `npm run validate`: passed.
- Tests: 55 files, 477 tests passed.
- Client build: passed; server build: passed.
- `npm audit --omit=dev --audit-level=moderate`: passed, 0 vulnerabilities.
- `git diff --check`: passed.
- `npx supabase start` and `npx supabase db reset`: not runnable because Docker access was denied by the current environment.
- `npm run verify:schema-contract`: not runnable because the isolated Supabase service-role environment was not present; it failed closed with the required-variable message.
