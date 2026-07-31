# Admin dashboard deep review

Review date: 31 July 2026. Scope: the current repository's admin React surface, Express routes, schema history, authorization, payment/cancellation paths, storage, pagination, query invalidation, error/loading/empty states, accessibility and the new fleet import workflow.

## Architecture map

`AdminDashboard.tsx` owns tab routing, shared queries and high-level mutations. `Sidebar.tsx` provides responsive navigation. Lazy tab components cover overview, applications, rentals, customers, invoices, financials, agreements, toll notices, maintenance and fleet imports. `src/lib/api.ts` is the credentialed API client and redirects only 401 responses to login.

The Express app mounts authentication, applications, Stripe, rentals, agreements, toll notices, financials, customers, invoices, manual invoices, maintenance and fleet import routers. Admin identity is enforced by `authenticateAdmin`, which checks the configured admin email and encrypted/signed HTTP-only session or bearer token; cookie writes also require a trusted origin. Supabase service-role access is server-side. Transaction-sensitive payment, cancellation, maintenance and fleet operations use direct PostgreSQL transactions and locks.

Authoritative operational fields are `rentals.vehicle_registration`, `rentals.weekly_price`, and `rentals.application_id`. Customer identity is separate. `admin_audit_events` is the shared append-only admin activity source. Customer application documents use private storage and authorized short-lived signed URLs.

## Confirmed findings and fixes

### Medium — admin deep links lost the selected section

Evidence: `handleAdminTabChange` previously routed every section except agreements and toll notices to `/admin/dashboard`; the location effect recognized only those two special paths. Refreshing or directly opening customers, rentals, financials, invoices or maintenance therefore reset the workspace to Overview, and the new fleet workflow would have had the same defect.

Root cause: tab state and URL routing had two partially duplicated hard-coded mappings.

Fix: every tab now uses `/admin/<tab>`, and the location effect recognizes the complete allow-listed admin route set. Unknown paths safely fall back to Overview. A regression test directly opens `/admin/fleet-imports` and verifies that the correct workspace renders.

### High — no safe fleet snapshot ingestion path

Evidence: no XLSX dependency, staged fleet entities or import endpoints existed. Direct use of the workbook would have required ad-hoc writes to active rentals and created an unacceptable risk of name-only identity links, date misuse, duplicate writes and payment/rental coupling.

Root cause: fleet data previously had no dedicated staged domain.

Fix: added inert staging tables, server-side parsing and validation, exact-registration suggestions, explicit rental matching, warning acknowledgement, pagination/filtering, dry run, transactional apply, checksum and idempotency protection, audit events, reject/cancel/export operations, accessible UI and tests. Apply changes only `rentals.weekly_price` for selected, ready, explicitly matched rows after rereading and locking current state.

## Areas reviewed with no validated defect

- Dashboard summary: one PostgreSQL RPC derives cards and recent activity from consistent filtered sources; current callers share the `dashboard-summary` query key.
- Applications: server pagination/search/status filtering is query-keyed; mutations invalidate application, approved-application and summary caches. Recent visibility regression coverage exists for genuine applications versus legacy imports.
- Rentals and cancellation: server pagination is bounded. Cancellation requires admin auth, an exact confirmation phrase, durable operation state, Stripe idempotency and reconciliation tests.
- Customers/invoices/financials: bounded server pages or aggregate RPCs are used; unavailable optional history has an explicit state rather than a false empty result.
- Agreements/documents: agreement writes use transactional RPCs and immutable version/artifact patterns. Customer documents remain private and are opened with fresh signed URLs after object authorization.
- Toll notices and maintenance: admin authorization, validation, confirmation and audit patterns are present; maintenance provides preflight/dry-run semantics and transactional deletion for its narrowly identified legacy records.
- Loading, errors and empty states: each tab inspected exposes a pending, error and empty/unavailable state. Mutation buttons inspected disable during requests.
- Mobile/accessibility: the sidebar is inert when closed, traps/restores focus when open and labels actions; existing dialogs trap focus and close on Escape. Tables use horizontal containment, and the fleet workflow preserves labelled controls and visible text actions.
- Performance: primary operational datasets are paginated, dashboard aggregation runs in PostgreSQL, search inputs are debounced and tab queries are conditionally enabled. No new unbounded fleet row query was added.

## Payment-sensitive verification

The import router never imports or calls Stripe, payment activation, application-status or rental-status code. It does not read or write `car_id`/`carId`, create rentals, or alter registrations. Existing Checkout construction remains server-derived, signed tokens normalize to `carId: null`, webhook signatures and ledgers remain in their dedicated services, and payment activation still writes `applications.status = 'Paid'` only. Fleet snapshot date is stored only in fleet staging records.

## Tests added

- Actual supplied-workbook parsing: 51 rows, $13,982 total, model counts/totals, missing drivers, five review rows, `FTG15R`, `COSWY`, source preservation and date stability.
- CSV normalization, invalid extension/content/MIME/size/columns/empty data, duplicate registration, formula non-execution and rejected CSV sanitization.
- Unauthenticated fleet history/read/apply rejection.
- Cookie-authenticated fleet writes from untrusted origins are rejected by the shared trusted-origin middleware.
- Missing-driver edits update both staged display/source and normalized fields, then transition only after server revalidation.
- Mismatched rental registrations are rejected; normalized exact matches are accepted.
- Apply audit metadata records each staged row, rental, registration, authoritative previous rate, proposed/applied rate, difference and snapshot date.
- Migration privacy, checksum/source-row/idempotency uniqueness, non-unique registration lookup and transaction markers.
- A payment-only contract test prevents fleet imports from mutating applications, rental status/registration, Stripe state or payment activation.
- Fleet navigation accessibility and direct-route restoration.

Transaction/conflict/apply behavior is also enforced structurally by row/import locks, timestamp comparison, one transaction and unique operation keys. A live database integration remains required after the migration is applied to a disposable environment.

## Remaining risks and deferred items

- The repository does not include a disposable local Supabase database fixture in source. Database-level upload → match → dry-run → apply integration and RLS catalog checks require the established Supabase environment and were not simulated by weakening production SQL.
- Browser verification requires a configured local Supabase/admin session and migrated database. Exact blocked steps and evidence are recorded in the completion report.
- Source workbooks are not retained. This is intentional data minimization; a private bucket must be designed only if retention becomes a business/legal requirement.
- Driver-name suggestions are not displayed because name-only candidates cannot safely establish identity. Admins match exact rental records, avoiding a misleading or unsafe customer merge affordance.

## Production verification checklist

- Back up the database and apply the additive migration through the approved workflow.
- Verify table constraints/indexes/grants/RLS and the direct session-capable Postgres connection.
- Sign in as the configured admin; verify unauthenticated and wrong-account denial.
- Upload the supplied workbook and confirm 51 rows, $13,982, model breakdown and five review cases.
- Exercise filters, pagination, warning acknowledgement, exact rental matching, dry run, stale-data conflict and apply retry.
- Confirm the audit event, authoritative rental rate and import result in the database.
- Confirm applications, Checkout/payment, agreements, toll notices and cancellation still pass their smoke flows.
- Check desktop and mobile widths, keyboard operation, console errors and failed network requests.
- Do not push `main` until deployment is explicitly approved because Render auto-deploys it.
