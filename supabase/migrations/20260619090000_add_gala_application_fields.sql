-- Gala Rentals application field expansion
-- Adds optional rental-preference and document fields required by the new wizard.

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS licence_state TEXT,
  ADD COLUMN IF NOT EXISTS preferred_vehicle TEXT,
  ADD COLUMN IF NOT EXISTS preferred_category TEXT,
  ADD COLUMN IF NOT EXISTS rental_duration_weeks INTEGER,
  ADD COLUMN IF NOT EXISTS driving_history_notes TEXT,
  ADD COLUMN IF NOT EXISTS rental_notes TEXT,
  ADD COLUMN IF NOT EXISTS proof_of_address_document TEXT,
  ADD COLUMN IF NOT EXISTS additional_document TEXT;

CREATE INDEX IF NOT EXISTS idx_applications_preferred_category
  ON applications(preferred_category);

CREATE INDEX IF NOT EXISTS idx_applications_rental_duration_weeks
  ON applications(rental_duration_weeks);
