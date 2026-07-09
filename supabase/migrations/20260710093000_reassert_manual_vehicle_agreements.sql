-- Reassert manual Vehicle / Number Plate agreement storage.
-- This is intentionally additive/idempotent for production environments that
-- missed the earlier manual vehicle migration or were created from the base
-- schema where lease_agreements.car_id was still NOT NULL.

ALTER TABLE public.lease_agreements
  ADD COLUMN IF NOT EXISTS vehicle_label TEXT;

ALTER TABLE public.lease_agreements
  ALTER COLUMN car_id DROP NOT NULL;

ALTER TABLE public.lease_agreements
  DROP CONSTRAINT IF EXISTS lease_agreements_car_id_fkey;

