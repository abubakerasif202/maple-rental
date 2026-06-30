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

-- Keep the manual bond status and method as one database-level invariant.
-- Notes remain optional for every state and do not affect this pairing.
ALTER TABLE applications
  ADD CONSTRAINT applications_bond_payment_state_method_check
  CHECK (
    (bond_payment_status IS NULL AND bond_payment_method IS NULL) OR
    (bond_payment_status = 'to_collect' AND bond_payment_method IS NULL) OR
    (bond_payment_status = 'cash_paid' AND bond_payment_method = 'cash') OR
    (bond_payment_status = 'already_paid' AND bond_payment_method = 'existing_paid')
  );

CREATE INDEX IF NOT EXISTS idx_applications_bond_payment_status
  ON applications(bond_payment_status);

-- Rollback note: drop applications_bond_payment_state_method_check, then the
-- index and three bond columns only after confirming no deployed code uses them.
