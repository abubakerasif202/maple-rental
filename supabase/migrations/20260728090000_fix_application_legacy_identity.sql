-- The UUID conversion renamed the former identity primary key to legacy_id,
-- but PostgreSQL retained its identity and NOT NULL properties. As a result,
-- every new application received a legacy_id and was excluded by the admin
-- dashboard's imported-data filters.
--
-- Rollback note: restoring identity generation would reintroduce the defect.
-- If rollback is unavoidable, first allocate and verify unique legacy IDs for
-- every NULL row before restoring NOT NULL or identity generation.

BEGIN;

ALTER TABLE public.applications
  ALTER COLUMN legacy_id DROP IDENTITY IF EXISTS;

ALTER TABLE public.applications
  ALTER COLUMN legacy_id DROP NOT NULL;

-- Imported fleet placeholders have explicit markers independent of legacy_id.
-- Clear only rows that do not match any of those markers so genuine submitted
-- applications become visible while imported rows remain excluded.
UPDATE public.applications
SET legacy_id = NULL
WHERE legacy_id IS NOT NULL
  AND COALESCE(lower(email), '') NOT LIKE '%@example.invalid'
  AND COALESCE(phone, '') <> '0000000000'
  AND COALESCE(lower(license_number), '') NOT LIKE 'legacy-%'
  AND COALESCE(lower(experience), '') NOT LIKE '%imported from live fleet data%'
  AND COALESCE(lower(experience), '') NOT LIKE '%legacy renter import%';

NOTIFY pgrst, 'reload schema';

COMMIT;
