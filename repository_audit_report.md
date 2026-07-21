# Maple Rentals Repository Audit Report

Audit date: 21 July 2026 (Australia/Sydney)
Repository: `C:\Users\abuba\maple-rental-clean`
Branch: `main`
Audited commit: `43be9cdf339319a82bd7d587cd6803deed80c826`
Operating mode: read-only source audit; this report is the only file created

## 1. Executive summary

The repository is a production-oriented React/Vite and Express/TypeScript application backed by Supabase and Stripe. The audited source preserves Maple Rentals' deliberate payment-only workflow:

- the admin records `Vehicle / Number Plate` as text;
- payment-link and Checkout APIs do not accept `car_id`;
- signed Checkout tokens use `carId: null`;
- Stripe Checkout uses the approved weekly price read from the application record;
- successful payment updates only the application to `Paid`;
- Checkout fulfillment does not mutate a car or insert a rental;
- rental and agreement operations remain separate admin workflows.

No Critical or High confirmed finding was identified. The strongest controls are server-side Checkout creation, signed and versioned payment links, deterministic Stripe idempotency keys, a unique webhook-event ledger, advisory locks/direct database transactions where available, strict webhook signature verification, admin middleware on private routes, private application-document access through short-lived signed URLs, and append-only agreement history.

The confirmed findings are:

| Severity | Count | IDs |
|---|---:|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 3 | MR-PAY-001, MR-REL-001, MR-DOC-001 |
| Low | 5 | MR-REL-002, MR-SEC-001, MR-UI-001, MR-A11Y-001, MR-OPS-001 |
| Informational | 2 | MR-DB-001, MR-ENV-001 |

The principal remediation priorities are:

1. Persist the Stripe customer identifier with each payment-only Checkout relationship.
2. Make application and rental cancellation resilient to “Stripe succeeded, database finalization failed.”
3. Produce an immutable private PDF artifact for saved lease agreements.
4. Tighten webhook failure recording, cancellation logging, success-page wording, agreement-button accessibility, and retention scheduling.

All requested local checks passed. `npm run lint`, `npm run test`, `npm run validate`, `npm run build`, `git diff --check`, the client bundle budget, and a production dependency audit were green. The suite contains 60 passing test files and 505 passing tests. These commands ran under locally active Node `v24.18.0`; the repository and CI declare Node 20, so Node-20 equivalence remains a release check.

This audit did not connect to production Supabase, Stripe, Render, email, or storage. Production schema history, environment values, webhook delivery, storage privacy, live reconciliation, and deployed asset identity therefore remain runtime-verification items rather than confirmed facts.

## 2. Architecture map

### 2.1 Runtime components

| Layer | Implementation | Evidence |
|---|---|---|
| Public/admin frontend | React 19, React Router, TanStack Query, lazy route modules | `src/App.tsx:8-15`, `src/App.tsx:54-67` |
| Build | Vite client build plus TypeScript server build | `package.json:9-11` |
| API | Express with Helmet, restrictive CORS, rate limiting, Zod validation, and centralized errors | `api/index.ts:195-195`, `api/index.ts:402-432`, `api/index.ts:540-586` |
| Data/auth/storage | Supabase service-role access from the server; encrypted Supabase admin session in cookies | `api/middleware/auth.ts:160-188`, `supabase/migrations/20260715030000_enforce_server_mediated_data_access.sql:8-26` |
| Payment | Stripe hosted subscription Checkout and signed webhooks | `api/services/stripeCheckoutService.ts:314-363`, `api/routes/webhooks.ts:10-33` |
| Documents | Private application uploads, Markdown lease agreements, PDF toll notices/manual invoices | `api/routes/applications.ts:144-164`, `api/routes/applications.ts:235-264`, `api/routes/agreements.ts:144-308` |
| Deployment | One Render web service, auto-deployed from `main` | `render.yaml:1-10` |
| CI | Supabase migration reset plus Node 20 lint/test/build/budget/audit | `.github/workflows/ci.yml:13-51` |

### 2.2 Request and data flow

1. **Customer application submission** — `POST /api/applications` parses multipart data, validates the JSON payload with Zod, checks file count/type/size/content signatures, stores files under random private paths, and inserts a `Pending` application (`api/routes/applications.ts:647-814`).
2. **Admin review** — the protected dashboard loads server-derived application state through `src/lib/api.ts`; server routes require `authenticateAdmin` (`api/routes/applications.ts:817-1278`).
3. **Approval and price locking** — the admin submits registration text, weekly price, manual bond state, and optional start date. The server validates them, uses compare-and-set payment versioning, and writes `Approved` (`api/validation.ts:128-175`, `api/routes/applications.ts:954-987`).
4. **Payment link** — the server increments `payment_link_version`, creates a signed token with `carId: null`, and returns/sends a time-limited link (`api/routes/applications.ts:996-1045`, `api/services/stripeCheckoutService.ts:994-1063`).
5. **Stripe Checkout** — the public signed-link endpoint accepts only application ID and token. The server reads the application, derives the weekly amount, reuses a matching pending session, or creates a Stripe subscription Checkout with a deterministic idempotency key (`api/routes/stripe.ts:252-314`, `api/services/stripeCheckoutService.ts:916-990`).
6. **Webhook processing** — raw-body middleware runs before JSON parsing. Stripe verifies the signature against current/previous webhook secrets, then a unique event ledger claims the event (`api/index.ts:442-442`, `api/routes/webhooks.ts:10-83`, `api/services/stripeWebhookService.ts:465-545`).
7. **Paid-state update** — a valid paid vehicle Checkout invokes payment-only fulfillment. Direct PostgreSQL mode locks the application and records the application update plus fulfillment marker in one transaction (`api/paymentActivation.ts:228-313`, `api/paymentActivation.ts:316-467`).
8. **Manual rental/agreement operations** — no Checkout path inserts a rental. Existing rentals are read/updated by admin routes and subscription lifecycle webhooks. Lease agreements may be generated and saved only for a `Paid` application (`api/routes/rentals.ts:230-740`, `api/routes/agreements.ts:163-258`).
9. **Cancellation** — application cancellation locates and cancels pending/active Stripe resources, then updates the application. Rental cancellation updates/cancels the strictly linked Stripe subscription and then updates the rental (`api/routes/applications.ts:1170-1278`, `api/routes/rentals.ts:641-740`).
10. **Document lifecycle** — application uploads are privately stored and accessed with 15-minute signed URLs; saved lease-agreement content is append-only; orphan cleanup is an audited, dry-run-first manual script (`api/routes/applications.ts:235-264`, `supabase/migrations/20260711215014_production_hardening_audit.sql:128-146`, `docs/document-retention.md:1-17`).

## 3. Payment-only workflow verification

| Requirement | Status | File-and-line evidence |
|---|---|---|
| Checkout sessions are server-created | Verified | `api/routes/stripe.ts:252-258` delegates to `api/services/stripeCheckoutService.ts:314-363`; the client never calls Stripe with price/session parameters. |
| Weekly price comes from trusted database state | Verified | `api/services/stripeCheckoutService.ts:241-260` reads `application.approved_weekly_price`; `api/services/stripeCheckoutService.ts:263-284` constructs the one recurring line item. |
| Client cannot override approved price | Verified | public session schema accepts application ID/token only (`api/validation.ts:123-126`); admin approval is authenticated and validated (`api/routes/applications.ts:905-1045`, `api/validation.ts:128-175`). |
| Webhook signatures are verified | Verified | raw body at `api/index.ts:442`; current/previous secret verification at `api/routes/webhooks.ts:10-33`; invalid/missing signatures return 400 at `api/routes/webhooks.ts:51-70`. |
| Duplicate Checkout/subscription creation is prevented | Verified in source/tests | reusable pending-session resolution and deterministic idempotency keys at `api/services/stripeCheckoutService.ts:828-879`, `api/services/stripeCheckoutService.ts:916-980`; application-scoped optional advisory lock at `api/services/stripeCheckoutService.ts:923`; tests at `api/services/stripeCheckoutService.test.ts:29-43` and `api/tests/api.test.ts:6881-6920`. |
| Webhook events are idempotent | Verified | unique `stripe_event_id` index in `supabase/migrations/20260326111500_ensure_stripe_webhook_event_ledger.sql:60-61`; atomic claim/reclaim at `api/services/stripeWebhookService.ts:465-545`. |
| Duplicate payment fulfillment is prevented | Verified | Checkout session fulfillment marker plus locked payment version in `api/paymentActivation.ts:251-310`; replay test coverage in `api/tests/api.test.ts:8330-8380`. |
| Successful payment marks only the application `Paid` | Verified | payment payload is only `paid_at`, cleared pending session, and `status: 'Paid'` at `api/paymentActivation.ts:228-248`. |
| Payment completion does not mutate a car | Verified | no production `cars` table query exists; legacy webhook `car_id` is ignored by payment-only tests at `api/tests/api.test.ts:7642-7710`. |
| Payment completion does not insert a rental | Verified | payment fulfillment updates `applications` only at `api/paymentActivation.ts:245-248` and `api/paymentActivation.ts:298-304`; the `rentals` helper at `api/paymentActivation.ts:85-122` only updates an already-existing rental by exact subscription identity for later lifecycle events. |
| Admin uses plain registration text | Verified | validation uses `approved_vehicle` text and rejects `car_id` at `api/validation.ts:128-143`; UI/API payload at `src/lib/api.ts:401-415`; persistence at `api/routes/applications.ts:970-986`. |
| Payment-link creation does not send `car_id` | Verified | client link payload contains only `application_id` at `src/lib/api.ts:394-399`; route schema parsing at `api/routes/stripe.ts:316-321`; tests reject `car_id` at `api/validation.test.ts:376-384` and `api/tests/api.test.ts:7011-7027`. |
| Checkout tokens use `carId: null` | Verified | approval path `api/routes/applications.ts:996-1001`; regenerated link `api/services/stripeCheckoutService.ts:1046-1052`. |
| Future starts use Stripe-supported scheduling | Verified in source/tests | future start creates `billing_cycle_anchor` and `proration_behavior: 'none'` at `api/services/stripeCheckoutService.ts:155-220`; assertions at `api/tests/api.test.ts:6746-6752`. |
| Bond is not charged through Stripe | Verified | billing display marks it manual at `api/services/stripeCheckoutService.ts:241-260`; Checkout has only the weekly recurring item at `api/services/stripeCheckoutService.ts:263-284`; tests assert no bond metadata/catalog item at `api/tests/api.test.ts:6734-6768`, `api/tests/api.test.ts:6802-6827`. |
| Failed/unhandled events are not successful activation | Verified with one hardening gap | transient failures are marked failed and rethrown; permanent/business-blocked cases are `skipped`/`manual_review`; unhandled events receive a non-fulfillment state (`api/services/stripeWebhookService.ts:897-941`). See MR-REL-002 for failure-recording error handling. |
| Stripe identifiers are persisted | Partial | pending Checkout session ID is stored on the application (`api/services/stripeCheckoutService.ts:969-980`); Checkout/subscription relationship is stored in the webhook ledger (`api/services/stripeWebhookService.ts:468-484`); Stripe customer ID is extracted but not persisted. See MR-PAY-001. |
| Stripe secrets/full payloads are not logged | Verified with one separate logging issue | webhook logger removes application/session/event/customer/subscription IDs at `api/services/stripeWebhookService.ts:135-162`; Stripe route errors use safe context at `api/routes/stripe.ts:266-312`. See MR-SEC-001 for the rental-cancellation route. |

## 4. Confirmed findings

### MR-PAY-001 — Stripe customer ID is extracted but not persisted

- **Severity:** Medium
- **Confidence:** High
- **Affected file and line:** `api/services/stripeWebhookService.ts:29-55`, `api/services/stripeWebhookService.ts:106-132`, `api/services/stripeWebhookService.ts:465-484`; `api/schemaContract.ts:93-96`; `supabase/migrations/20260715023000_persist_checkout_subscription_relation.sql:7-12`
- **Concrete evidence:** `StripeWebhookWorkItem` includes `stripeCustomerId`, and the work-item builder extracts `customer` from Stripe. The modern ledger row type and insert persist the Checkout session and subscription IDs but have no customer-ID column. The production schema contract likewise requires only `application_id` and `stripe_subscription_id` on the ledger.
- **Root cause:** payment-only fulfillment stopped creating/updating rentals, but the replacement ledger persistence was extended for subscription identity only.
- **Business impact:** support and reconciliation cannot reliably join a paid application to its Stripe customer without a live Stripe lookup. This increases operational recovery time and makes customer-level subscription reconciliation weaker during a Stripe/API outage.
- **Exact recommended fix:** add nullable `stripe_customer_id TEXT` to `stripe_webhook_events`, index non-null values, include it in the modern row type, claim/reclaim writes, Checkout relationship lookup, and production schema contract. Backfill from stored Checkout session IDs using a one-off read-only plan followed by a reviewed, idempotent backfill job. Do not create a rental or modify the payment-only state machine.
- **Regression tests required:** work-item extraction; ledger insert/reclaim includes customer ID; duplicate events preserve it; null customer remains valid; schema-contract test requires the new column; payment completion still changes only the application.
- **Migration required:** Yes, additive.
- **Deployment action required:** Yes, migration first, then application deployment and a webhook smoke/reconciliation check.

### MR-REL-001 — Cancellation can leave Stripe and the database in different states

- **Severity:** Medium
- **Confidence:** High
- **Affected file and line:** `api/routes/applications.ts:1195-1235`; `api/routes/rentals.ts:689-717`
- **Concrete evidence:** application cancellation completes `cancelApplicationStripeResources` before the compare-and-set database update. Rental cancellation updates/cancels the Stripe subscription before updating `rentals`. If Stripe succeeds and the subsequent database operation fails or loses its compare-and-set race, the API returns an error while Stripe is already changed.
- **Root cause:** a remote side effect and local state transition are performed synchronously without a durable cancellation-intent/outbox state or guaranteed reconciliation record.
- **Business impact:** the dashboard may show an active/approved record for a cancelled or scheduled-to-cancel subscription. Operators may retry unnecessarily, send stale links, or misstate billing status. Rental webhooks reduce but do not eliminate this window; application-only payment subscriptions have no rental row to reconcile.
- **Exact recommended fix:** introduce a durable cancellation state machine: transactionally record `cancellation_requested` plus target Stripe IDs/idempotency key, execute the Stripe operation, then finalize local status. A retry/reconciliation worker must resume non-final attempts idempotently. For a minimal interim fix, when the post-Stripe database write fails, synchronously retrieve Stripe state, write an auditable reconciliation event, and return a specific `202 reconciliation_pending` state rather than a generic conflict/500.
- **Regression tests required:** Stripe success + application compare-and-set miss; Stripe success + database error; retry after each partial failure; already-cancelled Stripe resource; period-end cancellation; concurrent cancellation and payment webhook; reconciliation after process termination.
- **Migration required:** Yes if implementing the recommended durable intent/outbox fields/table; no for the weaker interim reconciliation-only patch.
- **Deployment action required:** Yes; deploy application/worker after any additive migration and run a Stripe-to-database cancellation reconciliation.

### MR-DOC-001 — Saved lease agreements have no immutable PDF artifact

- **Severity:** Medium
- **Confidence:** High
- **Affected file and line:** `api/routes/agreements.ts:144-207`, `api/routes/agreements.ts:260-306`; `src/components/admin/tabs/AgreementsTab.tsx:460-479`, `src/components/admin/tabs/AgreementsTab.tsx:526-543`
- **Concrete evidence:** the server renders and stores Markdown `content`, template version, vehicle label, status, and timestamps. The retrieval endpoints return the same text. The admin action opens the saved text in a modal. No lease-agreement PDF generation, storage path, content hash, MIME type, or signed-download route exists; PDF code in the repository is for other document types.
- **Root cause:** agreement history and template versioning were completed before durable document rendering/export was added.
- **Business impact:** staff cannot retrieve the exact agreement as a paginated, printable, immutable file. Legal/audit evidence depends on re-rendering text and lacks an independently hashed artifact. Long names, addresses, and multi-page layout are not validated in a final PDF medium.
- **Exact recommended fix:** generate the PDF server-side from the exact saved agreement content; calculate SHA-256; upload to a private `agreements` bucket; store storage path, hash, byte size, MIME type, source agreement ID, template version, generator version, and creation time; expose an authenticated short-lived signed URL. PDF generation must wrap long names/addresses, tolerate optional blanks, paginate, embed the manual registration/bond state, and never add a Stripe bond charge.
- **Regression tests required:** optional DOB/fields; very long names and addresses; multi-page content; registration text; all manual bond states/methods; immutable hash/path after template revisions; private signed URL authorization/expiry; rendering retry idempotency; failed upload does not mark artifact complete.
- **Migration required:** Yes, additive PDF artifact metadata (on `lease_agreements` or a dedicated document table) plus private bucket provisioning.
- **Deployment action required:** Yes; migrate/provision storage, deploy, generate a test artifact, and verify signed access as an admin and denial as an unauthenticated user.

### MR-REL-002 — Webhook “mark failed” database errors are ignored

- **Severity:** Low
- **Confidence:** High
- **Affected file and line:** `api/services/stripeWebhookService.ts:321-333`, `api/services/stripeWebhookService.ts:912-928`
- **Concrete evidence:** `markModernLedgerFailed` awaits the Supabase update but does not inspect `error` or confirm a row was updated. The caller then rethrows the original transient error. A failed finalization can leave the row in `processing` until stale-claim recovery.
- **Root cause:** failure-state persistence has weaker write verification than the processed and classified-terminal paths.
- **Business impact:** retries may receive an in-flight response or wait for the stale threshold, delaying payment processing and hiding the true failure reason.
- **Exact recommended fix:** select the updated row, throw/log a redacted compound error if persistence fails, and emit a metric for ledger-finalization failures. Preserve the original processing error as the primary cause and make stale reclaim observable.
- **Regression tests required:** failed update result; zero-row update; retry before and after stale threshold; original error preserved; no event is reported as fulfilled.
- **Migration required:** No.
- **Deployment action required:** Yes.

### MR-SEC-001 — Rental cancellation logs payment identifiers and raw provider errors

- **Severity:** Low
- **Confidence:** High
- **Affected file and line:** `api/routes/rentals.ts:720-737`
- **Concrete evidence:** the success log includes admin email, rental ID, and full Stripe subscription ID. The catch block logs the raw error object. Elsewhere, webhook and Checkout routes deliberately use redacted/safe log context.
- **Root cause:** the cancellation route predates the repository's centralized redaction conventions.
- **Business impact:** operational logs contain linkable staff and payment-resource identifiers and may capture provider request metadata. This expands sensitive-data exposure to anyone with log access.
- **Exact recommended fix:** use the repository's safe error context and structured redaction. Log a request/correlation ID, cancellation mode, and normalized Stripe status; omit or irreversibly fingerprint subscription/admin identifiers. Keep detailed audit attribution in the protected audit table.
- **Regression tests required:** logger does not receive raw subscription/customer/request IDs, admin email, Stripe error object, or secret-shaped values; API response remains safe; audit event retains permitted attribution.
- **Migration required:** No.
- **Deployment action required:** Yes.

### MR-UI-001 — Success copy implies payment automatically updates rental status

- **Severity:** Low
- **Confidence:** High
- **Affected file and line:** `src/lib/checkoutSessionStatus.ts:147-178`
- **Concrete evidence:** manual-review state is titled `Activation Pending`, and direct-debit processing says “We'll update your rental status once Stripe confirms the payment.” The actual backend records the application as `Paid` only and requires separate manual rental activation.
- **Root cause:** customer-facing copy retained language from an automatic-activation model.
- **Business impact:** customers may reasonably expect the rental to activate automatically and may misunderstand handover/onboarding timing.
- **Exact recommended fix:** change the title to `Payment Review Pending` or `Payment Confirmation Pending`; replace “rental status” with “application payment status”; explicitly state that Maple Rentals will contact the customer separately to finalize rental activation/handover.
- **Regression tests required:** presentation tests for `manual_review` and direct-debit `processing` must prohibit “rental status”/automatic activation wording and require manual follow-up language.
- **Migration required:** No.
- **Deployment action required:** Yes, frontend deployment and live asset verification.

### MR-A11Y-001 — Saved-agreement icon buttons have no accessible name

- **Severity:** Low
- **Confidence:** High
- **Affected file and line:** `src/components/admin/tabs/AgreementsTab.tsx:470-479`, `src/components/admin/tabs/AgreementsTab.tsx:533-543`
- **Concrete evidence:** both buttons contain only a decorative `FileText` icon and provide no visible text, `aria-label`, or title.
- **Root cause:** compact mobile/table actions were implemented as icon-only controls without an accessibility name.
- **Business impact:** screen-reader users cannot determine the button purpose; voice-control selection is also impaired.
- **Exact recommended fix:** add `type="button"` and a specific `aria-label` such as `View saved agreement for {applicant}`; mark the icon `aria-hidden="true"`. Keep the 44px touch target.
- **Regression tests required:** React Testing Library/axe assertion that each saved-agreement action has a unique accessible name on mobile-card and desktop-table renderings.
- **Migration required:** No.
- **Deployment action required:** Yes, frontend deployment.

### MR-OPS-001 — Document cleanup is implemented but not scheduled in Render

- **Severity:** Low
- **Confidence:** High for repository configuration; external scheduler status unknown
- **Affected file and line:** `package.json:14-16`; `docs/document-retention.md:1-17`; `render.yaml:1-35`
- **Concrete evidence:** dry-run and apply scripts exist and are intentionally audited/safe, but `render.yaml` declares only one web service and no cron service. No `fleet-sync` script or Render cron exists. The current architecture no longer has a fleet table, so absence of fleet sync is consistent with registration-text operation.
- **Root cause:** retention cleanup is documented as an operator-run procedure rather than automated maintenance.
- **Business impact:** unreferenced identity documents may accumulate indefinitely if the procedure is not run, increasing storage cost and privacy-retention exposure.
- **Exact recommended fix:** after legal retention approval, add a scheduled dry-run/report job and a separately controlled apply job or worker. Alert on candidates, holds, audit-write failure, and deletion failure. Do not invent a fleet-sync job; document explicitly that it is not applicable to the cars-free design.
- **Regression tests required:** cron command existence; dry-run remains default; retention holds block apply; audit write failure blocks deletion; reruns are idempotent; external job smoke with test storage.
- **Migration required:** No for scheduling; only if operational job-state metadata is added.
- **Deployment action required:** Yes, explicit infrastructure/config change after approval.

### MR-DB-001 — Two historical agreement-idempotency migrations are equivalent

- **Severity:** Informational
- **Confidence:** High
- **Affected file and line:** `supabase/migrations/20260709231806_fix_lease_agreement_idempotency.sql:1-5`; `supabase/migrations/20260710103000_fix_lease_agreement_idempotency.sql:1-9`; `supabase/migrations/20260711110000_make_lease_agreement_history_immutable.sql:79-163`
- **Concrete evidence:** the 9 July and 10 July migrations both drop the legacy NOT NULL requirement and create the same single-application unique index. The later history migration deliberately removes single-column uniqueness to permit immutable repeated generations.
- **Root cause:** a follow-up migration repeated an idempotent production repair before the agreement model changed to append-only history.
- **Business impact:** no final-schema conflict is visible because the later migration explicitly resolves it, but the chain is harder to reason about and remote-history drift must be checked before any repair/squash.
- **Exact recommended fix:** retain already-applied migrations unchanged. Add a migration-history note documenting the duplicate and superseding migration. Never delete or rename remote-applied files. For a brand-new baseline only, generate a reviewed snapshot separate from production history.
- **Regression tests required:** clean `supabase db reset`; assertion that repeated agreement rows are allowed; update/delete are blocked; no single-column unique constraint remains.
- **Migration required:** No corrective production migration is currently indicated.
- **Deployment action required:** No.

### MR-ENV-001 — Audit validation ran on Node 24 while the repository declares Node 20

- **Severity:** Informational
- **Confidence:** High
- **Affected file and line:** `package.json:93-95`; `.nvmrc:1`; `.github/workflows/ci.yml:19-36`
- **Concrete evidence:** the local commands reported Node `v24.18.0` and npm `12.0.1`; package engines and `.nvmrc` require Node 20, while CI pins `20.20.2`.
- **Root cause:** the active workstation shell was not using the repository runtime.
- **Business impact:** green local checks provide strong evidence but are not exact runtime parity; Node-version behavior could differ.
- **Exact recommended fix:** repeat release validation with Node 20.20.2 (or the exact production Node 20 patch), using `npm ci`, then lint/test/build/budget. Keep CI and Render runtime aligned.
- **Regression tests required:** existing full suite under Node 20; optionally add a preflight script/CI assertion for the supported major.
- **Migration required:** No.
- **Deployment action required:** No application change; release validation action only.

## 5. Likely findings requiring runtime verification

These are not reported as confirmed production defects.

### MR-RUN-001 — Production migration history may not match the audited chain

- **Severity:** High if drift exists; Informational until verified
- **Confidence:** Medium that verification is necessary; no evidence that production is currently drifted
- **Affected file and line:** `supabase/migrations/20260304004102_optimized_schema_snake_case.sql:7-12`; `supabase/migrations/20260711113000_replace_cars_with_registration_text.sql:110-115`, `supabase/migrations/20260711113000_replace_cars_with_registration_text.sql:730`; `api/schemaContract.ts:190-255`
- **Concrete evidence:** the chain contains a historical destructive rebuild and a later irreversible cars-to-registration migration. Production boot checks current columns, but this audit did not query remote migration history.
- **Root cause:** long-lived production history includes legacy and modernization migrations rather than a single baseline.
- **Business impact:** applying a migration with an unexpected remote history can fail or, for historical destructive steps, cause data loss.
- **Exact recommended fix:** before any future `db push`, compare local/remote migration lists, take database and storage backups, run the chain on a production-shaped clone, confirm the destructive historical migration is already recorded remotely, and run `verify:schema-contract`.
- **Regression tests required:** clean reset plus upgrade test from the current production schema snapshot; cars removal/manual registration; agreement history; Stripe ledger and rental status RPCs.
- **Migration required:** No action until history is verified; any repair must be additive and reviewed.
- **Deployment action required:** Production verification only; no deploy in this audit.

### MR-RUN-002 — Live Stripe configuration and identifier reconciliation are unknown

- **Severity:** High if misconfigured; Informational until verified
- **Confidence:** High that source controls are present; no live evidence
- **Affected file and line:** `api/index.ts:91-155`; `api/routes/webhooks.ts:10-70`; `render.yaml:28-34`
- **Concrete evidence:** production requires Stripe and checkout secrets and verifies signatures, but no live Stripe endpoint, event-delivery record, API version, or payment-only reconciliation was queried.
- **Root cause:** read-only source audit deliberately excluded live provider access.
- **Business impact:** a wrong webhook secret/event selection or missing live product can prevent paid-state recording even when local code is correct.
- **Exact recommended fix:** run the repo's guarded Stripe handoff/readiness tooling with live credentials in an approved session; verify endpoint URL, current/previous secret transition, required event types, recent 2xx deliveries, one test-mode payment-only flow, and application/ledger/customer/subscription linkage.
- **Regression tests required:** provider smoke plus existing webhook retry/idempotency suite.
- **Migration required:** Only MR-PAY-001's additive identifier migration.
- **Deployment action required:** Configuration verification; change only if a mismatch is confirmed.

### MR-RUN-003 — Production application-document bucket privacy is unverified

- **Severity:** High if the bucket is public; Informational until verified
- **Confidence:** High that source intends private storage; no live storage evidence
- **Affected file and line:** `scripts/setup-bucket.ts:12-31`; `api/routes/applications.ts:235-264`, `api/routes/applications.ts:592-645`
- **Concrete evidence:** setup code configures private buckets and the API returns short-lived signed URLs through an admin route. The actual production bucket policy/configuration was not inspected.
- **Root cause:** bucket configuration is an external resource, not proven by source alone.
- **Business impact:** a public or overly permissive identity-document bucket would expose highly sensitive applicant files.
- **Exact recommended fix:** inspect bucket `public` state, MIME/size policy, object RLS, service-role-only writes, and anonymous URL denial; test one random object without credentials and through the authenticated signed route; rotate any exposed paths only if exposure is confirmed.
- **Regression tests required:** unauthenticated denial, non-admin denial, 15-minute signed URL expiry, MIME/signature rejection, random path isolation.
- **Migration required:** Storage policy migration/config may be required only if drift is found.
- **Deployment action required:** External storage verification; configuration change only if needed.

### MR-RUN-004 — Existing cancellation drift cannot be excluded

- **Severity:** Medium if records are mismatched; Informational until verified
- **Confidence:** Medium
- **Affected file and line:** `api/routes/applications.ts:1199-1235`; `api/routes/rentals.ts:689-717`
- **Concrete evidence:** MR-REL-001 exposes a partial-failure window, but no live application/rental/Stripe comparison was authorized.
- **Root cause:** absence of durable cross-system cancellation finalization.
- **Business impact:** a historical record may disagree with its actual subscription state.
- **Exact recommended fix:** run a read-only reconciliation of nonterminal applications, webhook-ledger subscription IDs, rentals, and Stripe subscriptions; produce a reviewed discrepancy report before any repair.
- **Regression tests required:** reconciliation fixture for missing application/rental/subscription and each cancellation status.
- **Migration required:** No for the audit; MR-REL-001 remediation may require one.
- **Deployment action required:** No unless discrepancies or code changes are approved.

### MR-RUN-005 — An external retention scheduler may exist outside `render.yaml`

- **Severity:** Low
- **Confidence:** Medium
- **Affected file and line:** `render.yaml:1-35`; `package.json:14-16`; `docs/document-retention.md:1-17`
- **Concrete evidence:** repository deployment configuration contains no cron, but an external scheduler cannot be disproven from source.
- **Root cause:** infrastructure state is external to the repository.
- **Business impact:** either cleanup is not running, or undocumented external automation has an unclear owner/audit trail.
- **Exact recommended fix:** inspect Render and any external scheduler inventory read-only; record job owner, command, cadence, environment, last success, alert path, and dry-run/apply policy in repository operations documentation.
- **Regression tests required:** scheduled dry-run smoke and failure alert; apply remains confirmation/policy gated.
- **Migration required:** No.
- **Deployment action required:** Only if no approved scheduler exists.

## 6. Security findings

### 6.1 Confirmed security-related finding

MR-SEC-001 is the only confirmed security-hygiene finding. It is not a demonstrated exploit and is intentionally classified Low. No hard-coded live secret was found. A tracked-file name/pattern scan found only `.env.example`; secret-shaped strings occur only in test fixtures and were redacted during review. `npm audit --omit=dev --audit-level=moderate` reported zero vulnerabilities on 21 July 2026.

### 6.2 Verified controls

- **Authentication/authorization:** admin routes use server middleware, validate the configured admin email, and do not rely on hidden UI (`api/middleware/auth.ts:34-41`, `api/middleware/auth.ts:490-576`).
- **Cookies:** production cookies are HTTP-only and secure, with strict SameSite by default and `none` only for an explicitly trusted HTTPS cross-site configuration (`api/middleware/auth.ts:154-188`).
- **CSRF/origin:** cookie-authenticated writes require a trusted `Origin`/`Referer` (`api/middleware/auth.ts:193-257`).
- **CORS:** only configured origins are accepted; non-browser/no-origin requests are allowed for server integrations (`api/index.ts:376-429`).
- **Rate limits:** global API, application, inquiry, CSP, performance, and login limits are present (`api/index.ts:195-201`, `api/index.ts:447-541`, `api/routes/auth.ts:24-42`).
- **Input validation:** Zod schemas cover payment/admin payloads; multipart upload bounds are enforced (`api/validation.ts:1-267`, `api/routes/applications.ts:144-164`).
- **Uploads:** allowed extension/MIME and magic-byte checks are applied before private upload, random object names prevent user-controlled paths, and partial uploads are cleaned on failure (`api/routes/applications.ts:410-499`, `api/routes/applications.ts:647-814`).
- **Signed URLs:** document retrieval is admin-protected and returns a 15-minute signed URL (`api/routes/applications.ts:235-264`, `api/routes/applications.ts:592-645`).
- **Injection/XSS:** database values use Supabase filters or parameterized PostgreSQL queries; no production `dangerouslySetInnerHTML`, `eval`, `new Function`, or `document.write` was found. Agreement content is rendered as React text rather than raw HTML.
- **SSRF:** IndexNow submission validates URLs against the configured application host before requesting the provider (`api/routes/indexNowAdmin.ts:1-117`).
- **Webhooks:** raw body and Stripe signature verification are correct (`api/index.ts:442`, `api/routes/webhooks.ts:10-70`).
- **Maintenance/reset:** the endpoint is authenticated, feature-flagged, plan-hash/confirmation gated, audited, and uses a transaction/advisory lock in direct-database mode (`api/routes/adminMaintenance.ts:1-212`, `api/adminMaintenanceReset.ts:1-610`).
- **Database exposure:** the final hardening migration revokes data/function privileges from `anon` and `authenticated`, granting server `service_role` access (`supabase/migrations/20260715030000_enforce_server_mediated_data_access.sql:8-26`).

### 6.3 Defensive improvements, not confirmed vulnerabilities

- Restrict/disable Supabase public signup and strengthen hosted password/CAPTCHA settings if the project does not require customer Supabase accounts (`supabase/config.toml:118-170`). Data-table access is separately revoked by the final migration, so source alone does not establish exposure.
- If CSP reporting is enabled, normalize and strip query strings from untrusted report fields before logging (`api/index.ts:444-461`).
- Add explicit timeouts/abort handling and provider-latency metrics consistently around email, IndexNow, and long Stripe reconciliation calls. Existing safe retries/idempotency reduce but do not remove slow-dependency risk.

## 7. Database and migration findings

The repository contains 46 SQL migration files. No duplicate 14-digit timestamp prefix was found. The chain starts with legacy unnumbered migrations and ends at `20260719090000_add_admin_dashboard_summary_rpc.sql`.

Confirmed migration observations:

- MR-DB-001 documents the equivalent agreement migrations; the effective final state is intentionally append-only history.
- Historical `cars`/`car_id` references remain in old migrations, but `20260711113000_replace_cars_with_registration_text.sql` maps affected records to registration text and drops `public.cars` with `RESTRICT`. No production source query to `cars` was found.
- The destructive 2026 optimized-schema migration drops core tables and must never be replayed against populated production. MR-RUN-001 covers remote-history verification.
- Current application assumptions are guarded at production startup by `api/schemaContract.ts:8-115` and `api/schemaContract.ts:190-255`.
- Unique subscription protection exists on non-null `rentals.stripe_subscription_id` (`supabase/migrations/01_schema.sql:169-171`) and ordered status reconciliation adds a subscription/event index (`supabase/migrations/20260715021000_order_stripe_rental_status_events.sql:7-12`).
- Webhook ledger uniqueness is based on `stripe_event_id` (`supabase/migrations/20260326111500_ensure_stripe_webhook_event_ledger.sql:60-61`).
- Application payment-link versioning and pending-session compare-and-set logic protect lost updates (`api/services/applicationPaymentState.ts:1-176`).
- Agreement history is immutable: single-application uniqueness is removed, application/time index added, and update/delete are blocked by trigger (`supabase/migrations/20260711110000_make_lease_agreement_history_immutable.sql:79-163`, `supabase/migrations/20260711215014_production_hardening_audit.sql:128-146`).
- Manual bond status/method pairs have database checks (`supabase/migrations/20260701090000_add_manual_bond_tracking.sql:1-45`, `supabase/migrations/20260701091000_enforce_manual_bond_state_pairs.sql:1-70`).
- Nullable compatibility is handled through `schemaCompat` for legacy camel/snake layouts. Production should converge on the newest snake-case schema rather than rely indefinitely on compatibility fallbacks.
- MR-PAY-001 is the missing persisted identifier/schema-contract requirement.

No migration was applied during this audit.

## 8. Reliability and concurrency findings

The confirmed reliability findings are MR-REL-001 and MR-REL-002.

Positive controls:

- payment-link replacement and Checkout creation use payment versions and compare-and-set writes;
- production direct-database Checkout creation uses an application-scoped advisory lock;
- Stripe Checkout creation has a deterministic idempotency key and reuses a valid pending session;
- stale sessions are expired if their database persistence loses a race;
- payment fulfillment locks the application and writes its fulfillment marker transactionally;
- webhook claims rely on a unique event ID, distinguish processed/in-flight/failed states, and reclaim stale processing rows;
- rental subscription events update only an existing rental with the exact subscription ID and apply Stripe event ordering/terminal-state rules;
- agreement template creation/activation uses database RPCs and agreement rows are append-only;
- document cleanup is dry-run-first, hold-aware, audit-gated, and idempotent for missing objects.

Additional observations:

- Public application submission performs a duplicate email check before insert (`api/routes/applications.ts:647-814`). A database unique constraint remains the final concurrency guard. A concurrent duplicate can surface a generic insert failure rather than the friendly duplicate response; this is a minor error-mapping improvement, not classified as a separate production defect without runtime evidence.
- Email delivery after approval/paid recording is outside the core database transaction by design. Failure is surfaced/audited without rolling back payment state, which is the safer financial behavior.
- Subscription lifecycle webhooks do not create rentals. If no exact rental exists, they log/skip, preserving the manual-activation business rule.

## 9. Frontend/admin findings

Confirmed frontend findings are MR-UI-001 and MR-A11Y-001.

Verified strengths:

- public and admin routes are lazy loaded (`src/App.tsx:8-15`);
- the protected admin route verifies the server session before loading the dashboard (`src/pages/AdminDashboardRoute.tsx:16-103`);
- query/mutation states disable high-risk actions and invalidate server queries rather than fabricating billing state (`src/pages/AdminDashboard.tsx:420-710`);
- approval exposes registration text, weekly price, manual bond state, and optional start date, with confirmation/error feedback (`src/pages/AdminDashboard.tsx:597-710`, `src/pages/AdminDashboard.tsx:1360-1520`);
- cancellation and maintenance actions use explicit typed confirmations;
- client bundle budget passes, and homepage startup JavaScript is below the configured threshold.

Maintainability observation:

- `src/pages/AdminDashboard.tsx` is 1,772 lines and still coordinates a wide range of tab state, modals, queries, and mutations, although major tab views are already split. Future changes should continue moving domain-specific controllers into typed hooks/components without changing business behavior. This is not a current correctness defect.

Performance observation:

- the build emits route chunks; the largest raw chunks are `AreaChart` (~285 kB), vendor (~232 kB), and `AdminDashboard` (~165 kB). They do not violate the homepage budget because admin/chart modules are lazy. Add an admin-route budget if dashboard startup becomes a measured problem.

## 10. Document/agreement findings

MR-DOC-001 is the primary agreement finding. MR-A11Y-001 affects its admin controls; MR-OPS-001 affects uploaded-document retention.

Verified behavior:

- the customer accepts the active legal template version when applying; the version is stored on the application;
- template edits create versions through database RPCs rather than overwriting the active historical version;
- generated agreements can only be saved for a `Paid` application;
- each saved generation appends a new row and records template version plus manual vehicle label;
- database triggers prevent agreement update/delete;
- the renderer handles missing DOB and manual bond fields in tests;
- Checkout excludes bond charges;
- application uploads enforce count, size, MIME/extension, and magic bytes;
- uploaded identity documents are intended to be private and use signed admin URLs;
- cleanup honors retention holds and aborts when audit/hold storage cannot be read.

Coverage gap:

- existing agreement tests validate Markdown substitution and optional fields but cannot prove page wrapping, multi-page layout, font embedding, or immutable artifact hashing because no agreement PDF artifact exists.

## 11. Deployment and cron findings

Render configuration:

- service: one Node web service on `main`;
- auto-deploy trigger: commit;
- build: `npm ci --include=dev && npm run validate && npm run build`;
- start: `npm start`;
- health check: `/api/health`;
- required environment names are declared with unsynced secret values;
- package engine: Node `20.x`;
- liveness endpoint exists at `/api/live`; dependency-aware health exists at `/api/health` (`api/index.ts:463-539`).

Cron/maintenance:

- `clean:documents` and `clean:documents:apply` exist;
- no fleet-sync script exists, which is consistent with the removed fleet/cars model;
- no cron service is declared in `render.yaml`;
- MR-OPS-001 and MR-RUN-005 cover retention scheduling.

Deployment cautions:

- pushing `main` is deployment-affecting because Render auto-deploys commits;
- configuration cannot establish production health or deployed commit identity;
- a release must verify migrations first, then `/api/live`, `/api/health`, deployed commit/assets, webhook delivery, admin authentication, and one payment-only test path.

No commit, push, deployment, Render change, Stripe change, environment change, or production smoke request occurred during this audit.

## 12. Test and build results

All commands were anchored with `Set-Location -LiteralPath 'C:\Users\abuba\maple-rental-clean'`.

Available npm scripts were listed before validation:

```text
dev
start
build
build:client
build:server
check:bundle-budget
preview
clean
clean:documents
clean:documents:apply
migrate:payment-workflow
migrate:legacy-snake-payment-workflow
migrate:stripe-webhook-ledger
migrate:operational-history
migrate:application-indexes
verify:schema-contract
verify-production-schema-contract
import:stripe-admin-csv
smoke:production:admin
stripe:setup
stripe:handoff
stripe:reset
typecheck
lint:code
lint
test
validate
```

| Command | Result | Evidence/result |
|---|---|---|
| `git status --short --branch` | Completed | `main...origin/main`; pre-existing modified/untracked files listed below |
| `git diff --check` | Passed | exit 0 |
| `npm run lint` | Passed | TypeScript `--noEmit` and ESLint `--max-warnings=0`, exit 0 |
| `npm run test` | Passed | 60 files, 505 tests, exit 0 |
| `npm run validate` | Passed | lint plus 60 files/505 tests, exit 0 |
| `npm run build` | Passed | Vite client: 5,075 modules; server TypeScript build; exit 0 |
| `npm run check:bundle-budget` | Passed | homepage startup JS `160,043 / 170,000` gzip bytes |
| `npm audit --omit=dev --audit-level=moderate` | Passed | zero vulnerabilities |
| tracked secret-pattern filename scan | Passed with test-fixture matches only | no tracked key/private-key file; `.env.example` only; Stripe-like strings only in tests |
| migration filename inventory | Passed | 46 SQL files; no duplicate 14-digit timestamp |

Environment:

- Node: `v24.18.0`
- npm: `12.0.1`
- declared Node: `20.x`
- CI Node: `20.20.2`

Pre-existing worktree state preserved:

```text
 M api/routes/applications.ts
 M api/routes/invoices.ts
 M api/routes/rentals.ts
 M api/tests/api.test.ts
 M src/lib/performanceMetrics.test.ts
 M src/lib/performanceMetrics.ts
 M src/pages/Home.tsx
?? api/pagination.ts
?? session_analysis_report.md
```

After this report is created, `repository_audit_report.md` is the only additional untracked file.

## 13. Prioritised remediation plan

### Priority 1 — payment reconciliation and cancellation integrity

1. Implement MR-PAY-001 as an additive migration/code release while preserving payment-only behavior.
2. Implement MR-REL-001 with durable cancellation intent/reconciliation.
3. Harden MR-REL-002 failure-state persistence.
4. Run the read-only production checks in MR-RUN-001, MR-RUN-002, and MR-RUN-004 before any deployment.

Exit criteria:

- application, Checkout session, customer, and subscription are queryable without a live Stripe lookup;
- Stripe-success/database-failure cancellation tests recover automatically;
- no payment test creates/updates a rental or car;
- all local checks pass under Node 20.20.2.

### Priority 2 — immutable agreement artifact

1. Design MR-DOC-001's additive PDF artifact metadata and private storage policy.
2. Implement idempotent server PDF rendering and signed admin access.
3. Add long-field, optional-field, multi-page, hash, retry, and access-control tests.

Exit criteria:

- each saved agreement can have a stable private PDF with source/hash/template provenance;
- repeated generations stay append-only;
- no Stripe bond line item is introduced.

### Priority 3 — privacy, UX, accessibility, and operations

1. Redact cancellation logs (MR-SEC-001).
2. Correct payment-only wording (MR-UI-001).
3. Name icon-only agreement controls (MR-A11Y-001).
4. Confirm/document retention scheduling and implement MR-OPS-001 only after retention-owner approval.

Exit criteria:

- structured logs contain no raw payment identifiers;
- customer copy never promises automatic rental activation;
- saved agreement controls have unique accessible names;
- retention job ownership and last-success evidence are documented.

## 14. Production verification checklist

This checklist is intentionally unexecuted.

### Release identity and schema

- [ ] Confirm intended commit and clean release worktree.
- [ ] Confirm production Node 20 patch and npm version.
- [ ] Compare `supabase migration list` local versus linked production.
- [ ] Confirm destructive historical migrations are already recorded and will not replay.
- [ ] Back up PostgreSQL and Supabase Storage before any migration.
- [ ] Test upgrade on a production-shaped clone.
- [ ] Run `npm run verify:schema-contract` with approved production read access.
- [ ] Verify no live `cars` table dependency or required `car_id` remains.
- [ ] Verify indexes/constraints: subscription uniqueness, event ID uniqueness, agreement append-only, bond state pairs.

### Stripe

- [ ] Confirm live/test mode and account.
- [ ] Confirm webhook URL and current/previous signing-secret transition.
- [ ] Confirm required Checkout, invoice, and subscription event types.
- [ ] Review recent deliveries for 2xx, retry, and duplicate behavior.
- [ ] Verify application ↔ Checkout session ↔ customer ↔ subscription persistence.
- [ ] Reconcile nonterminal application/rental cancellation state to Stripe.
- [ ] Test future-start billing anchor and first non-zero invoice behavior.
- [ ] Prove Checkout contains weekly rental only and no bond/setup charge.
- [ ] Prove paid completion changes application to `Paid` only.
- [ ] Prove no car mutation/rental insertion occurs.

### Auth, API, and storage

- [ ] Confirm production environment requirements without printing values.
- [ ] Confirm CORS/trusted cookie origin matches the deployed frontend.
- [ ] Confirm admin cookie flags and origin rejection from an untrusted site.
- [ ] Confirm anonymous/authenticated direct table privileges are revoked.
- [ ] Confirm application document buckets are private.
- [ ] Confirm anonymous/non-admin object access is denied.
- [ ] Confirm signed document URL expires after configured TTL.
- [ ] Confirm upload MIME, magic-byte, size, and path isolation.
- [ ] Confirm maintenance reset is disabled unless deliberately needed.

### Render and smoke

- [ ] Confirm Render service is attached to the intended repository/branch.
- [ ] Confirm deployed commit equals the intended release.
- [ ] Confirm build command, start command, and Node runtime.
- [ ] `curl.exe https://www.maplerentals.com.au/api/live`
- [ ] `curl.exe https://www.maplerentals.com.au/api/health`
- [ ] Verify dependency-aware health, not liveness alone.
- [ ] Verify frontend asset hashes correspond to the new build.
- [ ] Run approved admin smoke without exposing cookie/token values.
- [ ] Confirm Stripe webhook delivery after deployment.
- [ ] Confirm rollback path and previous deploy are available.

### Retention and documents

- [ ] Identify any external cleanup scheduler and owner.
- [ ] Run `npm run clean:documents` dry-run only; review candidates and holds.
- [ ] Confirm legal/insurance/dispute/tax retention policy before apply.
- [ ] Verify audit write and alerting.
- [ ] Verify private agreement PDF generation/access after MR-DOC-001.

## 15. File-and-line evidence appendix

### Core configuration and routing

- `package.json:6-33` — complete script surface, including build, validation, cleanup, migration, smoke, and Stripe tooling.
- `package.json:93-95` — Node 20 engine.
- `render.yaml:1-35` — one web service; main auto-deploy; build/start/health/env configuration; no cron.
- `.github/workflows/ci.yml:13-51` — Supabase reset, Node 20 validation/build/budget/audit.
- `src/App.tsx:8-15`, `src/App.tsx:54-67` — lazy frontend routes.
- `api/index.ts:437-586` — middleware order and API route mounts.
- `api/index.ts:463-539` — liveness and dependency-aware health endpoints.

### Application, approval, and client boundary

- `api/routes/applications.ts:647-814` — public submission, upload, duplicate handling, insert/cleanup.
- `api/routes/applications.ts:905-1045` — admin approval, registration/price lock, versioning, token/link, audit.
- `api/validation.ts:128-175` — approval validation and `car_id` rejection.
- `src/lib/api.ts:394-415` — client Checkout-link and approval payloads contain no `car_id`.
- `src/pages/AdminDashboard.tsx:597-710` — admin registration, manual bond, weekly price, date, and payment-link workflow.

### Checkout and Stripe identifiers

- `api/routes/stripe.ts:252-346` — public signed Checkout session and authenticated payment-link routes.
- `api/routes/stripe.ts:348-408` — signed session-status context.
- `api/services/stripeCheckoutService.ts:155-220` — future start scheduling.
- `api/services/stripeCheckoutService.ts:241-284` — trusted weekly billing and manual bond presentation.
- `api/services/stripeCheckoutService.ts:314-363` — server-created hosted subscription Checkout.
- `api/services/stripeCheckoutService.ts:828-990` — idempotency, session reuse, locking, compare-and-set persistence.
- `api/services/stripeCheckoutService.ts:994-1063` — versioned payment link with `carId: null`.
- `api/services/stripeWebhookService.ts:29-55`, `api/services/stripeWebhookService.ts:106-132` — customer/session/subscription extraction.
- `api/services/stripeWebhookService.ts:465-484` — persisted ledger fields omit customer ID.
- `supabase/migrations/20260715023000_persist_checkout_subscription_relation.sql:7-12` — subscription relationship persistence/index.

### Webhooks and payment-only fulfillment

- `api/index.ts:442` — raw webhook body.
- `api/routes/webhooks.ts:10-83` — signature verification and safe responses.
- `api/services/stripeWebhookService.ts:295-378` — processed/failed/classified ledger finalization.
- `api/services/stripeWebhookService.ts:465-545` — unique claim and stale reclaim.
- `api/services/stripeWebhookService.ts:693-949` — event routing, failure classification, unhandled behavior.
- `api/paymentActivation.ts:228-313` — application-only paid write and fulfillment marker.
- `api/paymentActivation.ts:316-467` — completion status/version validation and payment-only result.
- `api/paymentActivation.ts:85-122` — existing-rental-only subscription lifecycle update.

### Cancellation

- `api/routes/applications.ts:1170-1278` — application Stripe cleanup followed by database status update.
- `api/routes/rentals.ts:641-740` — exact subscription cancellation followed by rental update and raw logging.
- `api/tests/api.test.ts:6322-6450` — payment-only subscription cancellation and cleanup-failure coverage.

### Agreements and documents

- `api/routes/agreements.ts:144-258` — authenticated render/save, Paid gate, Markdown storage.
- `api/routes/agreements.ts:260-308` — saved agreement text retrieval.
- `api/routes/adminAgreements.ts:46-181` — versioned template CRUD/activation/preview through RPCs.
- `src/components/admin/tabs/AgreementsTab.tsx:292-322` — named template actions.
- `src/components/admin/tabs/AgreementsTab.tsx:460-479`, `src/components/admin/tabs/AgreementsTab.tsx:526-543` — unnamed saved-agreement icon actions.
- `api/routes/applications.ts:144-164`, `api/routes/applications.ts:410-499` — upload limits/content validation/random paths.
- `api/routes/applications.ts:235-264`, `api/routes/applications.ts:592-645` — signed private document URLs.
- `docs/document-retention.md:1-17` — dry-run/apply cleanup workflow.
- `supabase/migrations/20260711110000_make_lease_agreement_history_immutable.sql:79-163` — repeated immutable history and index.
- `supabase/migrations/20260711215014_production_hardening_audit.sql:128-146` — append-only trigger.

### Security and database hardening

- `api/middleware/auth.ts:154-257` — secure cookie and trusted-origin behavior.
- `api/middleware/auth.ts:490-576` — admin authentication/authorization.
- `api/index.ts:195-201`, `api/index.ts:376-429`, `api/index.ts:447-541` — rate limit, CORS, Helmet, public endpoint limits.
- `supabase/migrations/20260326111500_ensure_stripe_webhook_event_ledger.sql:60-67` — event-ledger uniqueness/indexes.
- `supabase/migrations/20260715021000_order_stripe_rental_status_events.sql:7-81` — ordered subscription lifecycle updates.
- `supabase/migrations/20260715030000_enforce_server_mediated_data_access.sql:8-26` — revoke client data access/grant service role.
- `api/schemaContract.ts:8-115`, `api/schemaContract.ts:190-255` — production column contract and fail-fast behavior.

### Key regression evidence

- `api/validation.test.ts:279-280`, `api/validation.test.ts:376-384` — `car_id` rejection.
- `api/services/stripeCheckoutService.test.ts:29-43` — deterministic Checkout idempotency.
- `api/tests/api.test.ts:6734-6768`, `api/tests/api.test.ts:6802-6827` — no Stripe bond charge.
- `api/tests/api.test.ts:7011-7027` — payment-link `car_id` rejection without vehicle mutation.
- `api/tests/api.test.ts:7642-7710` — legacy/no-`car_id` webhook remains payment-only.
- `api/tests/api.test.ts:7772-7838` — payment-only fulfillment with different database modes.
- `api/tests/api.test.ts:8020-8135` — future-start first paid invoice behavior.
- `api/tests/api.test.ts:8330-8380` — duplicate webhook/fulfillment protection.
- `api/tests/api.test.ts:8728-8768` — Payment Review replay without rental activation.
- `api/tests/api.test.ts:2647-3047` — agreement auth, versioning, Paid gate, append-only history, optional values, manual registration, and safe failures.
- `api/migrationSafety.test.ts:19-67` — bond constraints, append-only agreements, least privilege.

## Audit close-out

- **Summary:** payment-only invariants are preserved; no Critical/High confirmed source defect; three Medium, five Low, and two Informational confirmed findings documented.
- **Files created or changed:** created `repository_audit_report.md` only.
- **Commands executed:** repository/root checks, Git status/diff checks, source/migration searches, Node/npm version checks, `npm run lint`, `npm run test`, `npm run validate`, `npm run build`, `npm run check:bundle-budget`, and `npm audit --omit=dev --audit-level=moderate`.
- **Tests and build results:** all passed; 60 test files/505 tests; client/server build passed; homepage bundle budget passed.
- **Migration status:** inspected only; 46 files, no duplicate 14-digit timestamps; no migration was applied.
- **Deployment status:** no production access, smoke, commit, push, Render action, Stripe mutation, or deploy was performed.
- **Remaining blockers:** production migration history, Node-20 parity, live Stripe configuration/reconciliation, storage privacy, deployed asset identity, and external scheduler state require approved runtime verification.
- **Change confirmation:** no source code, production data, migration, secret, database, commit, push, or deployment was changed.
