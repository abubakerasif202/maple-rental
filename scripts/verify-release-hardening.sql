\set ON_ERROR_STOP on

-- Read-only release evidence. Run with a protected PostgreSQL session URL.
-- This script does not print credentials and does not mutate production data.

SELECT
  trigger.tgname AS trigger_name,
  trigger.tgenabled AS enabled,
  pg_get_triggerdef(trigger.oid, TRUE) AS definition
FROM pg_trigger AS trigger
JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public'
  AND relation.relname = 'admin_audit_events'
  AND NOT trigger.tgisinternal
ORDER BY trigger.tgname;

SELECT
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'admin_audit_events'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY grantee, privilege_type;

SELECT
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE id IN ('applications', 'lease-agreements')
ORDER BY id;

SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname IN ('public', 'storage')
  AND tablename IN (
    'admin_audit_events',
    'applications',
    'customers',
    'lease_agreements',
    'manual_invoices',
    'objects',
    'rentals',
    'toll_transfer_notices'
  )
ORDER BY schemaname, tablename;

SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE (schemaname = 'storage' AND tablename = 'objects')
   OR (schemaname = 'public' AND tablename IN ('admin_audit_events', 'applications'))
ORDER BY schemaname, tablename, policyname;

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'applications_stripe_subscription_id_unique',
    'customers_application_id_unique',
    'customers_stripe_customer_id_unique',
    'invoices_stripe_invoice_id_unique',
    'rentals_live_application_unique',
    'rentals_live_stripe_subscription_unique'
  )
ORDER BY indexname;

SELECT
  namespace.nspname AS schema_name,
  procedure.proname AS function_name,
  pg_get_function_identity_arguments(procedure.oid) AS arguments,
  procedure.prosecdef AS security_definer,
  procedure.proacl AS privileges
FROM pg_proc AS procedure
JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
WHERE namespace.nspname = 'public'
  AND procedure.proname = 'persist_verified_stripe_relationship';
