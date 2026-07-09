-- The UUID migration retained the old numeric application column as a
-- mandatory field. New agreements intentionally use applications.id only.
ALTER TABLE public.lease_agreements
  ALTER COLUMN legacy_application_id DROP NOT NULL;

-- One saved agreement is maintained per application. The API updates this row
-- on repeated finalization and recovers from concurrent unique violations.
CREATE UNIQUE INDEX IF NOT EXISTS lease_agreements_application_id_unique
  ON public.lease_agreements (application_id);
