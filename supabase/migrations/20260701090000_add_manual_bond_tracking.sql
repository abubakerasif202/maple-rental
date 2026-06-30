-- Manual bond tracking for Maple Rentals.
-- Bond is recorded for admin/agreement use only and is not a Stripe charge.

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS bond_payment_status TEXT
    CHECK (
      bond_payment_status IS NULL OR
      bond_payment_status IN ('to_collect', 'cash_paid', 'already_paid')
    ),
  ADD COLUMN IF NOT EXISTS bond_payment_method TEXT
    CHECK (
      bond_payment_method IS NULL OR
      bond_payment_method IN ('cash', 'existing_paid')
    ),
  ADD COLUMN IF NOT EXISTS bond_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_applications_bond_payment_status
  ON applications(bond_payment_status);
