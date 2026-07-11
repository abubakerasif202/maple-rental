-- Read-only preflight for the registration-only and immutable-agreement migrations.
-- Run with psql and ON_ERROR_STOP before taking the production backup.

BEGIN TRANSACTION READ ONLY;

DO $$
DECLARE
  legacy_column TEXT;
  legacy_count BIGINT;
  missing_count BIGINT;
  registration_column TEXT;
  table_name TEXT;
  table_regclass REGCLASS;
  target RECORD;
BEGIN
  IF to_regclass('public.cars') IS NULL THEN
    RAISE NOTICE 'cars: table absent';
  ELSE
    EXECUTE 'SELECT COUNT(*) FROM public.cars' INTO legacy_count;
    RAISE NOTICE 'cars: % rows', legacy_count;
  END IF;

  FOR target IN
    SELECT *
    FROM (
      VALUES
        ('rentals', 'car_id', 'vehicle_registration'),
        ('bookings', 'car_id', 'vehicle_registration'),
        ('lease_agreements', 'car_id', 'vehicle_label'),
        ('toll_transfer_notices', 'car_id', 'vehicle_registration'),
        ('stripe_webhook_events', 'car_id', 'vehicle_registration'),
        ('applications', 'assigned_car_id', 'approved_vehicle')
    ) AS configured(table_name, legacy_column, registration_column)
  LOOP
    table_name := target.table_name;
    legacy_column := target.legacy_column;
    registration_column := target.registration_column;
    table_regclass := to_regclass(format('%I.%I', 'public', table_name));

    IF table_regclass IS NULL THEN
      RAISE NOTICE '%: table absent', table_name;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns AS available
      WHERE available.table_schema = 'public'
        AND available.table_name = target.table_name
        AND available.column_name = target.legacy_column
    ) THEN
      EXECUTE format(
        'SELECT COUNT(*) FROM %I.%I WHERE %I IS NOT NULL',
        'public',
        table_name,
        legacy_column
      ) INTO legacy_count;
    ELSE
      legacy_count := 0;
      RAISE NOTICE '%: legacy column % absent', table_name, legacy_column;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns AS available
      WHERE available.table_schema = 'public'
        AND available.table_name = target.table_name
        AND available.column_name = target.registration_column
    ) THEN
      EXECUTE format(
        'SELECT COUNT(*) FROM %I.%I '
        || 'WHERE LENGTH(REGEXP_REPLACE(UPPER(COALESCE(%I::TEXT, '''')), ''[^A-Z0-9]'', '''', ''g'')) NOT BETWEEN 2 AND 10 '
        || 'OR REGEXP_REPLACE(UPPER(COALESCE(%I::TEXT, '''')), ''[^A-Z0-9]'', '''', ''g'') !~ ''[0-9]''',
        'public',
        table_name,
        registration_column,
        registration_column
      ) INTO missing_count;
    ELSE
      EXECUTE format('SELECT COUNT(*) FROM %I.%I', 'public', table_name)
        INTO missing_count;
      RAISE NOTICE '%: registration column % absent', table_name, registration_column;
    END IF;

    RAISE NOTICE '%: legacy IDs %, missing/implausible registrations %',
      table_name,
      legacy_count,
      missing_count;

    IF table_name IN ('lease_agreements', 'toll_transfer_notices') THEN
      RAISE NOTICE '% unresolved vehicle references: %', table_name, missing_count;
    END IF;
  END LOOP;
END $$;

-- Every row returned here is a dependency that must be understood before the
-- registration migration is applied. Expected legacy foreign keys are included.
SELECT
  'foreign_key' AS dependency_type,
  source_namespace.nspname AS schema_name,
  source_table.relname AS object_name,
  constraint_row.conname AS dependency_name,
  pg_get_constraintdef(constraint_row.oid) AS definition
FROM pg_constraint AS constraint_row
JOIN pg_class AS source_table
  ON source_table.oid = constraint_row.conrelid
JOIN pg_namespace AS source_namespace
  ON source_namespace.oid = source_table.relnamespace
WHERE constraint_row.contype = 'f'
  AND constraint_row.confrelid = to_regclass('public.cars')

UNION ALL

SELECT
  'pg_depend' AS dependency_type,
  NULL AS schema_name,
  pg_describe_object(dependency.classid, dependency.objid, dependency.objsubid) AS object_name,
  NULL AS dependency_name,
  'dependency type ' || dependency.deptype::TEXT AS definition
FROM pg_depend AS dependency
WHERE dependency.refclassid = 'pg_class'::regclass
  AND dependency.refobjid = to_regclass('public.cars')
ORDER BY dependency_type, schema_name, object_name;

-- Report every unique constraint/index involving application_id. The migration
-- removes only unpredicated single-column uniqueness on application_id.
SELECT
  'constraint' AS object_type,
  constraint_row.conname AS object_name,
  pg_get_constraintdef(constraint_row.oid) AS definition
FROM pg_constraint AS constraint_row
JOIN pg_attribute AS application_column
  ON application_column.attrelid = constraint_row.conrelid
 AND application_column.attname = 'application_id'
 AND NOT application_column.attisdropped
WHERE constraint_row.conrelid = to_regclass('public.lease_agreements')
  AND constraint_row.contype = 'u'
  AND application_column.attnum = ANY(constraint_row.conkey)

UNION ALL

SELECT
  'index' AS object_type,
  index_class.relname AS object_name,
  pg_get_indexdef(index_definition.indexrelid) AS definition
FROM pg_index AS index_definition
JOIN pg_class AS index_class
  ON index_class.oid = index_definition.indexrelid
JOIN pg_attribute AS application_column
  ON application_column.attrelid = index_definition.indrelid
 AND application_column.attname = 'application_id'
 AND NOT application_column.attisdropped
WHERE index_definition.indrelid = to_regclass('public.lease_agreements')
  AND index_definition.indisunique
  AND application_column.attnum = ANY(index_definition.indkey::SMALLINT[])
ORDER BY object_type, object_name;

ROLLBACK;
