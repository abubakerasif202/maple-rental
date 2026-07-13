-- Resolve repository-owned Supabase advisor findings without modifying
-- platform-managed Stripe objects or weakening existing RLS policies.
-- Rollback notes:
--   DROP INDEX IF EXISTS public.idx_document_retention_holds_application_id;
--   ALTER EXTENSION pg_trgm SET SCHEMA public;
--   Do not restore public execution of public.rls_auto_enable().

BEGIN;

CREATE INDEX IF NOT EXISTS idx_document_retention_holds_application_id
  ON public.document_retention_holds (application_id);

DO $$
DECLARE
  current_schema TEXT;
  is_relocatable BOOLEAN;
BEGIN
  SELECT namespace.nspname, extension.extrelocatable
  INTO current_schema, is_relocatable
  FROM pg_catalog.pg_extension AS extension
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'pg_trgm';

  IF current_schema IS NOT NULL
     AND current_schema <> 'extensions'
     AND is_relocatable
     AND to_regnamespace('extensions') IS NOT NULL THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rls_auto_enable()
      FROM PUBLIC, anon, authenticated, service_role;
  END IF;
END;
$$;

COMMIT;
