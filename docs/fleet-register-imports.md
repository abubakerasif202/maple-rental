# Fleet register imports

Fleet register imports stage an operational snapshot for admin review. They do not create customers, applications or rentals, change registration text, change rental status, or alter Stripe prices, subscriptions, Checkout metadata or payment state.

## Supported source

- `.xlsx` workbooks with a `Fleet Register` sheet, and `.csv` files.
- Required columns: `Driver`, `Rego`, `Make`, `Model`, `Weekly Rate`, and `Date`.
- Optional columns: `Notes` and `Data Quality`.
- Maximum file size: 2 MB; maximum 1,000 data rows and 20 columns.
- The current Maple snapshot is dated `2026-09-30`. This is stored as a PostgreSQL `date`; it is not a rental start, approval, payment, activation or subscription date.

Files are validated and parsed only by the API. XLSX ZIP magic bytes, extension and a conservative MIME allow-list are checked. CSV is rejected when it contains binary NUL bytes. Formulas are not evaluated. The API keeps staged source values and normalized comparison values separately. Source files are deliberately not retained: only the checksum and staged values are stored, reducing the private-document surface. If source-file retention becomes a legal requirement, add a dedicated private Supabase bucket and short-lived, object-authorized signed access before enabling retention.

`read-excel-file` is used because the repository had no XLSX parser, version 9.x is actively published, supports Node 20, and its parser dependency tree produced no production `npm audit` findings when added. The server limits file size, rows, columns and parse wall time around the parser.

## Normalization and matching

Registration comparison trims, uppercases and removes display whitespace. The exact source registration is retained and never silently corrected. Custom registrations are allowed; `COSWY` remains unchanged and is warned for human verification. Driver names are whitespace-normalized for display only. Name-only matching never links or merges a customer.

An exact normalized registration can suggest a rental only when it resolves to one record. Multiple rentals using a registration remain unresolved. An admin can choose an exact rental ID, after which the API records the rental update timestamp and proposed rate difference. Matching does not update the rental.

Known review cases in the 30 September workbook are the three missing drivers (`YPB79M`, `FZS37Y`, `FZS37Z`), `FTG15R` (the `$257` interpretation with the `RTO` note retained), and `COSWY`. Warnings require explicit acknowledgement; validation errors cannot be acknowledged.

## Admin workflow

1. Open **Fleet Imports**, upload an XLSX or CSV, and wait for the authoritative server response.
2. Review summary values and filter staged rows by readiness, match and apply state.
3. Resolve or reject warnings and select the exact rental when a row is unmatched or ambiguous.
4. Select ready rows and run **Dry run selected**. The API rereads the rental and reports the exact current rate, proposed rate, difference and any stale conflict.
5. Review the successful dry run and use **Apply selected**. The confirmation explains the limited mutation.
6. The API locks the import and rows, checks the rental timestamps again, and updates only `rentals.weekly_price` in one database transaction. It then records row results, import totals, an idempotent operation result and an append-only admin audit event in that transaction.
7. Download rejected/error rows when needed. Exported cells beginning with `=`, `+`, `-` or `@` are prefixed to prevent spreadsheet formula injection.

The browser never shows apply success until the committed server response arrives. Query caches for import history, import detail, rows, rentals and dashboard summary are invalidated afterward.

## Retry, recovery and duplicate handling

The file SHA-256 checksum is unique, so identical uploads return a conflict and refer the admin to import history. Source row numbers are unique inside an import. Normalized registrations are deliberately indexed but not unique: duplicate source rows are retained and marked for review instead of failing the staged insert. Apply requests use a UUID idempotency key unique per import; a retry returns the committed authoritative result instead of applying twice. Stale rental changes fail the full batch and roll back all selected rate changes.

Unapplied imports may be cancelled. Applied changes are intentionally not auto-rolled back from a historical snapshot. To reverse one, identify exact rental IDs and before/after values in the `fleet_import.rows_applied` audit event, then execute a separately reviewed admin rate change.

## Production migration

1. Take and verify a current database backup.
2. Check that `rentals.vehicle_registration`, `rentals.weekly_price`, `rentals.updated_at`, `customers`, and `admin_audit_events` exist.
3. Apply `20260731100000_add_fleet_register_imports.sql` through the established Supabase migration workflow. Do not run it from the browser or against production during ordinary development.
4. Verify all three tables have RLS enabled, no `anon` or `authenticated` grants, and service-role access only.
5. Deploy the API and UI only after migration verification. No new environment secret or storage bucket is required because source files are not retained.
