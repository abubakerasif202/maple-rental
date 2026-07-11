-- Replace the legacy fleet catalogue with registration text.
--
-- Backup requirement:
--   Take and verify a full database backup immediately before applying this
--   migration. Keep the backup until registration history has been audited.
-- Rollback limitation:
--   Failures before COMMIT roll back automatically. After COMMIT, the removed
--   car_id columns and public.cars rows can only be restored from backup.
--   Recreating an empty cars table is not a data rollback.

BEGIN;

-- Keep accidental lock waits bounded. The data backfill itself may take longer,
-- so only lock_timeout is constrained here.
SET LOCAL lock_timeout = '10s';

CREATE OR REPLACE FUNCTION pg_temp.maple_normalize_registration(input_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  compact_value TEXT;
  raw_value TEXT;
BEGIN
  raw_value := UPPER(BTRIM(COALESCE(input_value, '')));

  IF raw_value = '' OR raw_value !~ '^[A-Z0-9][A-Z0-9 -]*$' THEN
    RETURN NULL;
  END IF;

  compact_value := REGEXP_REPLACE(raw_value, '[^A-Z0-9]', '', 'g');

  -- Conservative Australian registration shape. Requiring at least one digit
  -- prevents ordinary make/model words from being accepted as registrations.
  IF LENGTH(compact_value) BETWEEN 2 AND 10
     AND compact_value ~ '[0-9]'
  THEN
    RETURN compact_value;
  END IF;

  RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION pg_temp.maple_registration_from_text(
  input_value TEXT,
  allow_plain_value BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  candidate TEXT;
  match_parts TEXT[];
BEGIN
  IF input_value IS NULL OR BTRIM(input_value) = '' THEN
    RETURN NULL;
  END IF;

  IF allow_plain_value THEN
    candidate := pg_temp.maple_normalize_registration(input_value);
    IF candidate IS NOT NULL THEN
      RETURN candidate;
    END IF;
  END IF;

  -- Vehicle descriptions are never accepted wholesale. Only a clearly
  -- delimited trailing token is considered, and it must pass normalization.
  match_parts := REGEXP_MATCH(
    UPPER(input_value),
    '\(([A-Z0-9 -]{2,14})\)[[:space:]]*$'
  );
  IF match_parts IS NULL THEN
    match_parts := REGEXP_MATCH(
      UPPER(input_value),
      '\[([A-Z0-9 -]{2,14})\][[:space:]]*$'
    );
  END IF;
  IF match_parts IS NULL THEN
    match_parts := REGEXP_MATCH(
      UPPER(input_value),
      '[-:/][[:space:]]*([A-Z0-9][A-Z0-9 -]{1,13})[[:space:]]*$'
    );
  END IF;

  IF match_parts IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN pg_temp.maple_normalize_registration(match_parts[1]);
END
$function$;

CREATE TEMP TABLE maple_legacy_vehicle_targets (
  table_name TEXT PRIMARY KEY,
  legacy_column TEXT NOT NULL,
  registration_column TEXT NOT NULL,
  application_column TEXT
) ON COMMIT DROP;

INSERT INTO maple_legacy_vehicle_targets (
  table_name,
  legacy_column,
  registration_column,
  application_column
)
VALUES
  ('applications', 'assigned_car_id', 'approved_vehicle', NULL),
  ('rentals', 'car_id', 'vehicle_registration', 'application_id'),
  ('bookings', 'car_id', 'vehicle_registration', 'application_id'),
  ('lease_agreements', 'car_id', 'vehicle_label', 'application_id'),
  ('toll_transfer_notices', 'car_id', 'vehicle_registration', 'application_id'),
  ('stripe_webhook_events', 'car_id', 'vehicle_registration', 'application_id');

CREATE TEMP TABLE maple_car_registration_map (
  car_id TEXT PRIMARY KEY,
  explicit_registration TEXT,
  parsed_registration TEXT
) ON COMMIT DROP;

-- Build a guarded car-to-registration map. Explicit registration columns are
-- preferred. cars.name is parsed only for a delimited, plausible plate token.
DO $$
DECLARE
  explicit_column TEXT;
BEGIN
  IF to_regclass('public.cars') IS NULL THEN
    RAISE NOTICE 'public.cars does not exist; car-based backfill will be skipped';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cars'
      AND column_name = 'id'
  ) THEN
    RAISE EXCEPTION 'public.cars exists without the required id column';
  END IF;

  EXECUTE
    'INSERT INTO maple_car_registration_map (car_id) '
    || 'SELECT id::TEXT FROM public.cars';

  SELECT candidate.column_name
  INTO explicit_column
  FROM (
    VALUES
      ('vehicle_registration', 1),
      ('registration', 2),
      ('registration_number', 3),
      ('rego', 4),
      ('number_plate', 5),
      ('license_plate', 6),
      ('plate_number', 7)
  ) AS candidate(column_name, priority)
  JOIN information_schema.columns AS available
    ON available.table_schema = 'public'
   AND available.table_name = 'cars'
   AND available.column_name = candidate.column_name
  ORDER BY candidate.priority
  LIMIT 1;

  IF explicit_column IS NOT NULL THEN
    EXECUTE format(
      'UPDATE maple_car_registration_map AS target '
      || 'SET explicit_registration = pg_temp.maple_registration_from_text(source.%I::TEXT, TRUE) '
      || 'FROM public.cars AS source '
      || 'WHERE target.car_id = source.id::TEXT',
      explicit_column
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cars'
      AND column_name = 'name'
  ) THEN
    EXECUTE
      'UPDATE maple_car_registration_map AS target '
      || 'SET parsed_registration = pg_temp.maple_registration_from_text(source.name::TEXT, FALSE) '
      || 'FROM public.cars AS source '
      || 'WHERE target.car_id = source.id::TEXT '
      || 'AND target.explicit_registration IS NULL';
  END IF;
END $$;

-- Guard every optional table and legacy column before referencing it. Target
-- registration columns are additive and are created only where legacy IDs exist.
DO $$
DECLARE
  target RECORD;
  target_regclass REGCLASS;
BEGIN
  FOR target IN
    SELECT *
    FROM maple_legacy_vehicle_targets
    ORDER BY table_name
  LOOP
    target_regclass := to_regclass(format('%I.%I', 'public', target.table_name));

    IF target_regclass IS NULL THEN
      RAISE NOTICE 'Skipping absent table public.%', target.table_name;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target.table_name
        AND column_name = target.legacy_column
    ) THEN
      RAISE NOTICE 'Skipping public.%.% because the legacy column is absent',
        target.table_name,
        target.legacy_column;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target.table_name
        AND column_name = target.registration_column
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.%I ADD COLUMN %I TEXT',
        'public',
        target.table_name,
        target.registration_column
      );
    END IF;

    EXECUTE format(
      'UPDATE %I.%I '
      || 'SET %I = pg_temp.maple_registration_from_text(%I::TEXT, TRUE) '
      || 'WHERE %I IS NOT NULL '
      || 'AND pg_temp.maple_registration_from_text(%I::TEXT, TRUE) IS NOT NULL '
      || 'AND %I::TEXT IS DISTINCT FROM pg_temp.maple_registration_from_text(%I::TEXT, TRUE)',
      'public',
      target.table_name,
      target.registration_column,
      target.registration_column,
      target.registration_column,
      target.registration_column,
      target.registration_column,
      target.registration_column
    );

    IF target.application_column IS NOT NULL
       AND to_regclass('public.applications') IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = target.table_name
           AND column_name = target.application_column
       )
       AND EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'applications'
           AND column_name = 'approved_vehicle'
       )
       AND EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'applications'
           AND column_name = 'id'
       )
    THEN
      EXECUTE format(
        'UPDATE %I.%I AS target '
        || 'SET %I = source.registration '
        || 'FROM ('
        || '  SELECT id::TEXT AS application_id, '
        || '         pg_temp.maple_registration_from_text(approved_vehicle::TEXT, TRUE) AS registration '
        || '  FROM public.applications'
        || ') AS source '
        || 'WHERE target.%I::TEXT = source.application_id '
        || 'AND pg_temp.maple_registration_from_text(target.%I::TEXT, TRUE) IS NULL '
        || 'AND source.registration IS NOT NULL',
        'public',
        target.table_name,
        target.registration_column,
        target.application_column,
        target.registration_column
      );
    END IF;

    EXECUTE format(
      'UPDATE %I.%I AS target '
      || 'SET %I = COALESCE(map.explicit_registration, map.parsed_registration) '
      || 'FROM maple_car_registration_map AS map '
      || 'WHERE target.%I::TEXT = map.car_id '
      || 'AND pg_temp.maple_registration_from_text(target.%I::TEXT, TRUE) IS NULL '
      || 'AND COALESCE(map.explicit_registration, map.parsed_registration) IS NOT NULL',
      'public',
      target.table_name,
      target.registration_column,
      target.legacy_column,
      target.registration_column
    );
  END LOOP;
END $$;

-- Produce pre-drop counts and abort before any destructive statement if a
-- historical vehicle reference cannot be represented by registration text.
DO $$
DECLARE
  legacy_count BIGINT;
  missing_registration_count BIGINT;
  target RECORD;
  target_regclass REGCLASS;
  total_unresolved BIGINT := 0;
BEGIN
  IF to_regclass('public.cars') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM public.cars' INTO legacy_count;
    RAISE NOTICE 'public.cars rows before drop: %', legacy_count;
  ELSE
    RAISE NOTICE 'public.cars rows before drop: table absent';
  END IF;

  FOR target IN
    SELECT *
    FROM maple_legacy_vehicle_targets
    ORDER BY table_name
  LOOP
    target_regclass := to_regclass(format('%I.%I', 'public', target.table_name));

    IF target_regclass IS NULL OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target.table_name
        AND column_name = target.legacy_column
    ) THEN
      RAISE NOTICE 'public.% legacy reference count: not applicable', target.table_name;
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT COUNT(*) FROM %I.%I WHERE %I IS NOT NULL',
      'public',
      target.table_name,
      target.legacy_column
    ) INTO legacy_count;

    EXECUTE format(
      'SELECT COUNT(*) FROM %I.%I '
      || 'WHERE %I IS NOT NULL '
      || 'AND pg_temp.maple_registration_from_text(%I::TEXT, TRUE) IS NULL',
      'public',
      target.table_name,
      target.legacy_column,
      target.registration_column
    ) INTO missing_registration_count;

    RAISE NOTICE 'public.% legacy IDs: %, unresolved registrations: %',
      target.table_name,
      legacy_count,
      missing_registration_count;

    total_unresolved := total_unresolved + missing_registration_count;
  END LOOP;

  IF total_unresolved > 0 THEN
    RAISE EXCEPTION
      'Registration migration aborted: % historical rows still have a legacy vehicle ID without a usable registration',
      total_unresolved;
  END IF;
END $$;

-- Abort before changing dependencies if an unknown table/column references
-- public.cars, or if a view/function has a tracked pg_depend dependency.
DO $$
DECLARE
  dependency_details TEXT;
  unexpected_foreign_keys BIGINT;
  unexpected_normal_dependencies BIGINT;
  unexpected_routines BIGINT;
  unexpected_views BIGINT;
BEGIN
  IF to_regclass('public.cars') IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*)
  INTO unexpected_foreign_keys
  FROM pg_constraint AS constraint_row
  JOIN pg_class AS source_table
    ON source_table.oid = constraint_row.conrelid
  JOIN pg_namespace AS source_namespace
    ON source_namespace.oid = source_table.relnamespace
  WHERE constraint_row.contype = 'f'
    AND constraint_row.confrelid = 'public.cars'::regclass
    AND NOT EXISTS (
      SELECT 1
      FROM maple_legacy_vehicle_targets AS target
      JOIN pg_attribute AS source_column
        ON source_column.attrelid = constraint_row.conrelid
       AND source_column.attname = target.legacy_column
       AND NOT source_column.attisdropped
      WHERE source_namespace.nspname = 'public'
        AND source_table.relname = target.table_name
        AND constraint_row.conkey = ARRAY[source_column.attnum]::SMALLINT[]
    );

  SELECT COUNT(DISTINCT rewrite_row.oid)
  INTO unexpected_views
  FROM pg_depend AS dependency
  JOIN pg_rewrite AS rewrite_row
    ON dependency.classid = 'pg_rewrite'::regclass
   AND dependency.objid = rewrite_row.oid
  WHERE dependency.refclassid = 'pg_class'::regclass
    AND dependency.refobjid = 'public.cars'::regclass
    AND rewrite_row.ev_class <> 'public.cars'::regclass;

  SELECT COUNT(DISTINCT routine.oid)
  INTO unexpected_routines
  FROM pg_depend AS dependency
  JOIN pg_proc AS routine
    ON dependency.classid = 'pg_proc'::regclass
   AND dependency.objid = routine.oid
  WHERE dependency.refclassid = 'pg_class'::regclass
    AND dependency.refobjid = 'public.cars'::regclass;

  SELECT STRING_AGG(
    DISTINCT pg_describe_object(
      dependency.classid,
      dependency.objid,
      dependency.objsubid
    ),
    '; '
  )
  INTO dependency_details
  FROM pg_depend AS dependency
  WHERE dependency.refclassid = 'pg_class'::regclass
    AND dependency.refobjid = 'public.cars'::regclass
    AND dependency.deptype = 'n';

  SELECT COUNT(*)
  INTO unexpected_normal_dependencies
  FROM pg_depend AS dependency
  WHERE dependency.refclassid = 'pg_class'::regclass
    AND dependency.refobjid = 'public.cars'::regclass
    AND dependency.deptype = 'n'
    AND NOT (
      (
        dependency.classid = 'pg_constraint'::regclass
        AND EXISTS (
          SELECT 1
          FROM pg_constraint AS allowed_constraint
          WHERE allowed_constraint.oid = dependency.objid
            AND (
              allowed_constraint.conrelid = 'public.cars'::regclass
              OR allowed_constraint.confrelid = 'public.cars'::regclass
            )
        )
      )
      OR (
        dependency.classid = 'pg_policy'::regclass
        AND EXISTS (
          SELECT 1
          FROM pg_policy AS allowed_policy
          WHERE allowed_policy.oid = dependency.objid
            AND allowed_policy.polrelid = 'public.cars'::regclass
        )
      )
      OR (
        dependency.classid = 'pg_rewrite'::regclass
        AND EXISTS (
          SELECT 1
          FROM pg_rewrite AS allowed_rewrite
          WHERE allowed_rewrite.oid = dependency.objid
            AND allowed_rewrite.ev_class = 'public.cars'::regclass
        )
      )
      OR (
        dependency.classid = 'pg_trigger'::regclass
        AND EXISTS (
          SELECT 1
          FROM pg_trigger AS allowed_trigger
          WHERE allowed_trigger.oid = dependency.objid
            AND allowed_trigger.tgrelid = 'public.cars'::regclass
        )
      )
      OR (
        dependency.classid = 'pg_attrdef'::regclass
        AND EXISTS (
          SELECT 1
          FROM pg_attrdef AS allowed_default
          WHERE allowed_default.oid = dependency.objid
            AND allowed_default.adrelid = 'public.cars'::regclass
        )
      )
      OR (
        dependency.classid = 'pg_class'::regclass
        AND (
          dependency.objid = 'public.cars'::regclass
          OR EXISTS (
            SELECT 1
            FROM pg_index AS allowed_index
            WHERE allowed_index.indexrelid = dependency.objid
              AND allowed_index.indrelid = 'public.cars'::regclass
          )
        )
      )
    );

  RAISE NOTICE
    'public.cars dependency check: unexpected foreign keys %, unexpected normal dependencies %, dependent views %, dependent routines %',
    unexpected_foreign_keys,
    unexpected_normal_dependencies,
    unexpected_views,
    unexpected_routines;
  RAISE NOTICE 'public.cars normal dependency details: %', COALESCE(dependency_details, 'none');

  IF unexpected_foreign_keys > 0
     OR unexpected_normal_dependencies > 0
     OR unexpected_views > 0
     OR unexpected_routines > 0
  THEN
    RAISE EXCEPTION
      'Registration migration aborted: unexpected dependencies on public.cars remain';
  END IF;
END $$;

-- Explicitly remove every known foreign key to public.cars. Dependency removal
-- is deliberately restricted to the catalog objects inspected above.
DO $$
DECLARE
  foreign_key RECORD;
BEGIN
  IF to_regclass('public.cars') IS NULL THEN
    RETURN;
  END IF;

  FOR foreign_key IN
    SELECT source_namespace.nspname AS schema_name,
           source_table.relname AS table_name,
           constraint_row.conname AS constraint_name
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS source_table
      ON source_table.oid = constraint_row.conrelid
    JOIN pg_namespace AS source_namespace
      ON source_namespace.oid = source_table.relnamespace
    JOIN maple_legacy_vehicle_targets AS target
      ON target.table_name = source_table.relname
    JOIN pg_attribute AS source_column
      ON source_column.attrelid = constraint_row.conrelid
     AND source_column.attname = target.legacy_column
     AND NOT source_column.attisdropped
    WHERE source_namespace.nspname = 'public'
      AND constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'public.cars'::regclass
      AND constraint_row.conkey = ARRAY[source_column.attnum]::SMALLINT[]
  LOOP
    RAISE NOTICE 'Dropping known vehicle foreign key %.%.%',
      foreign_key.schema_name,
      foreign_key.table_name,
      foreign_key.constraint_name;
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      foreign_key.schema_name,
      foreign_key.table_name,
      foreign_key.constraint_name
    );
  END LOOP;
END $$;

-- Explicitly remove indexes that include a legacy vehicle ID column. An index
-- owned by an unexpected constraint aborts instead of silently removing it.
DO $$
DECLARE
  index_row RECORD;
  target RECORD;
  target_attnum SMALLINT;
  target_regclass REGCLASS;
BEGIN
  FOR target IN
    SELECT *
    FROM maple_legacy_vehicle_targets
    ORDER BY table_name
  LOOP
    target_regclass := to_regclass(format('%I.%I', 'public', target.table_name));
    IF target_regclass IS NULL THEN
      CONTINUE;
    END IF;

    SELECT attnum
    INTO target_attnum
    FROM pg_attribute
    WHERE attrelid = target_regclass
      AND attname = target.legacy_column
      AND NOT attisdropped;

    IF target_attnum IS NULL THEN
      CONTINUE;
    END IF;

    FOR index_row IN
      SELECT index_namespace.nspname AS schema_name,
             index_class.relname AS index_name,
             owning_constraint.conname AS owning_constraint
      FROM pg_index AS index_definition
      JOIN pg_class AS index_class
        ON index_class.oid = index_definition.indexrelid
      JOIN pg_namespace AS index_namespace
        ON index_namespace.oid = index_class.relnamespace
      LEFT JOIN pg_constraint AS owning_constraint
        ON owning_constraint.conindid = index_definition.indexrelid
      WHERE index_definition.indrelid = target_regclass
        AND target_attnum = ANY(index_definition.indkey::SMALLINT[])
    LOOP
      IF index_row.owning_constraint IS NOT NULL THEN
        RAISE EXCEPTION
          'Cannot remove index %.% because it belongs to unexpected constraint %',
          index_row.schema_name,
          index_row.index_name,
          index_row.owning_constraint;
      END IF;

      RAISE NOTICE 'Dropping legacy vehicle index %.%',
        index_row.schema_name,
        index_row.index_name;
      EXECUTE format(
        'DROP INDEX %I.%I',
        index_row.schema_name,
        index_row.index_name
      );
    END LOOP;
  END LOOP;
END $$;

-- Drop only the guarded legacy columns, using RESTRICT explicitly.
DO $$
DECLARE
  target RECORD;
BEGIN
  FOR target IN
    SELECT *
    FROM maple_legacy_vehicle_targets
    ORDER BY table_name
  LOOP
    IF to_regclass(format('%I.%I', 'public', target.table_name)) IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = target.table_name
           AND column_name = target.legacy_column
       )
    THEN
      EXECUTE format(
        'ALTER TABLE %I.%I DROP COLUMN %I RESTRICT',
        'public',
        target.table_name,
        target.legacy_column
      );
    END IF;
  END LOOP;
END $$;

-- Policies belong to public.cars itself and are explicitly removed for a clear
-- audit trail. The final RESTRICT drop remains the last dependency safeguard.
DO $$
DECLARE
  policy_row RECORD;
  remaining_foreign_keys BIGINT;
  remaining_routines BIGINT;
  remaining_views BIGINT;
BEGIN
  IF to_regclass('public.cars') IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*)
  INTO remaining_foreign_keys
  FROM pg_constraint
  WHERE contype = 'f'
    AND confrelid = 'public.cars'::regclass;

  SELECT COUNT(DISTINCT rewrite_row.oid)
  INTO remaining_views
  FROM pg_depend AS dependency
  JOIN pg_rewrite AS rewrite_row
    ON dependency.classid = 'pg_rewrite'::regclass
   AND dependency.objid = rewrite_row.oid
  WHERE dependency.refclassid = 'pg_class'::regclass
    AND dependency.refobjid = 'public.cars'::regclass
    AND rewrite_row.ev_class <> 'public.cars'::regclass;

  SELECT COUNT(DISTINCT routine.oid)
  INTO remaining_routines
  FROM pg_depend AS dependency
  JOIN pg_proc AS routine
    ON dependency.classid = 'pg_proc'::regclass
   AND dependency.objid = routine.oid
  WHERE dependency.refclassid = 'pg_class'::regclass
    AND dependency.refobjid = 'public.cars'::regclass;

  IF remaining_foreign_keys > 0 OR remaining_views > 0 OR remaining_routines > 0 THEN
    RAISE EXCEPTION
      'Registration migration aborted: public.cars still has foreign key, view, or routine dependencies';
  END IF;

  FOR policy_row IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cars'
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      policy_row.policyname,
      'public',
      'cars'
    );
  END LOOP;

  EXECUTE 'DROP TABLE public.cars RESTRICT';
END $$;

DO $$
DECLARE
  index_target RECORD;
BEGIN
  FOR index_target IN
    SELECT *
    FROM (
      VALUES
        ('rentals', 'idx_rentals_vehicle_registration'),
        ('bookings', 'idx_bookings_vehicle_registration'),
        ('toll_transfer_notices', 'idx_toll_transfer_notices_vehicle_registration')
    ) AS configured(table_name, index_name)
  LOOP
    IF to_regclass(format('%I.%I', 'public', index_target.table_name)) IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = index_target.table_name
           AND column_name = 'vehicle_registration'
       )
    THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I.%I (%I) WHERE %I IS NOT NULL',
        index_target.index_name,
        'public',
        index_target.table_name,
        'vehicle_registration',
        'vehicle_registration'
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
