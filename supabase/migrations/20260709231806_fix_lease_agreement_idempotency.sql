ALTER TABLE public.lease_agreements
  ALTER COLUMN legacy_application_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS lease_agreements_application_id_unique
  ON public.lease_agreements (application_id);;
