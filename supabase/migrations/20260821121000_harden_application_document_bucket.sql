-- Preflight: confirm no browser client depends on a public applications bucket.
-- The Express API uploads with service_role and issues authorized signed URLs.

BEGIN;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'applications',
  'applications',
  false,
  7340032,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;

-- Recovery: restore the prior bucket settings from the pre-deployment snapshot.
-- Do not make identity documents public as a rollback shortcut.
