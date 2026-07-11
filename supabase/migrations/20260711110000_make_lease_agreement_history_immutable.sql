-- Preserve every generated lease agreement as an immutable historical record.
--
-- Backup requirement:
--   Take and verify a database backup before applying this migration.
-- Rollback limitation:
--   Re-adding one-row-per-application uniqueness is impossible while duplicate
--   application_id rows exist. A rollback must first choose which historical
--   agreement to retain for each application.

BEGIN;

DO $$
DECLARE
  required_column TEXT;
BEGIN
  IF to_regclass('public.lease_agreements') IS NULL THEN
    RAISE EXCEPTION 'Required table public.lease_agreements does not exist';
  END IF;

  IF to_regclass('public.applications') IS NULL THEN
    RAISE EXCEPTION 'Required table public.applications does not exist';
  END IF;

  FOREACH required_column IN ARRAY ARRAY['application_id', 'created_at']
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'lease_agreements'
        AND column_name = required_column
    ) THEN
      RAISE EXCEPTION 'Required column public.lease_agreements.% does not exist', required_column;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'applications'
      AND column_name = 'agreement_template_version'
  ) THEN
    RAISE EXCEPTION 'Required source column public.applications.agreement_template_version does not exist';
  END IF;
END $$;

ALTER TABLE public.lease_agreements
  ADD COLUMN IF NOT EXISTS agreement_template_version INTEGER;

UPDATE public.lease_agreements AS agreement
SET agreement_template_version = COALESCE(application.agreement_template_version, 1)
FROM public.applications AS application
WHERE agreement.application_id = application.id
  AND agreement.agreement_template_version IS NULL;

DO $$
DECLARE
  missing_version_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO missing_version_count
  FROM public.lease_agreements
  WHERE agreement_template_version IS NULL;

  RAISE NOTICE 'lease_agreements missing agreement_template_version after backfill: %',
    missing_version_count;

  IF missing_version_count > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce immutable agreement history: % agreement rows have no template version',
      missing_version_count;
  END IF;
END $$;

ALTER TABLE public.lease_agreements
  ALTER COLUMN agreement_template_version SET NOT NULL;

-- Migration history created lease_agreements_application_id_unique, but this
-- catalog-driven removal also handles a renamed unique constraint or index.
-- Only unpredicated, single-column uniqueness on application_id is removed.
DO $$
DECLARE
  application_attnum SMALLINT;
  uniqueness_object RECORD;
BEGIN
  SELECT attnum
  INTO application_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.lease_agreements'::regclass
    AND attname = 'application_id'
    AND NOT attisdropped;

  FOR uniqueness_object IN
    SELECT constraint_row.conname
    FROM pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.lease_agreements'::regclass
      AND constraint_row.contype = 'u'
      AND constraint_row.conkey = ARRAY[application_attnum]::SMALLINT[]
  LOOP
    RAISE NOTICE 'Dropping lease agreement uniqueness constraint: %', uniqueness_object.conname;
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      'public',
      'lease_agreements',
      uniqueness_object.conname
    );
  END LOOP;

  FOR uniqueness_object IN
    SELECT index_namespace.nspname AS schema_name,
           index_class.relname AS index_name
    FROM pg_index AS index_row
    JOIN pg_class AS index_class
      ON index_class.oid = index_row.indexrelid
    JOIN pg_namespace AS index_namespace
      ON index_namespace.oid = index_class.relnamespace
    LEFT JOIN pg_constraint AS owning_constraint
      ON owning_constraint.conindid = index_row.indexrelid
    WHERE index_row.indrelid = 'public.lease_agreements'::regclass
      AND index_row.indisunique
      AND NOT index_row.indisprimary
      AND index_row.indnkeyatts = 1
      AND index_row.indnatts = 1
      AND index_row.indkey[0] = application_attnum
      AND index_row.indpred IS NULL
      AND index_row.indexprs IS NULL
      AND owning_constraint.oid IS NULL
  LOOP
    RAISE NOTICE 'Dropping lease agreement uniqueness index: %.%',
      uniqueness_object.schema_name,
      uniqueness_object.index_name;
    EXECUTE format(
      'DROP INDEX %I.%I',
      uniqueness_object.schema_name,
      uniqueness_object.index_name
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.lease_agreements'::regclass
      AND constraint_row.contype = 'u'
      AND constraint_row.conkey = ARRAY[application_attnum]::SMALLINT[]
  ) OR EXISTS (
    SELECT 1
    FROM pg_index AS index_row
    WHERE index_row.indrelid = 'public.lease_agreements'::regclass
      AND index_row.indisunique
      AND NOT index_row.indisprimary
      AND index_row.indnkeyatts = 1
      AND index_row.indnatts = 1
      AND index_row.indkey[0] = application_attnum
      AND index_row.indpred IS NULL
      AND index_row.indexprs IS NULL
  ) THEN
    RAISE EXCEPTION 'Single-column uniqueness on lease_agreements.application_id still exists';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lease_agreements_application_created_at
  ON public.lease_agreements (application_id, created_at DESC);

COMMIT;
