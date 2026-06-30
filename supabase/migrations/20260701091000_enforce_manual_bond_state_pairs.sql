-- Follow-up for environments where 20260701090000 was already applied.
-- NOT VALID avoids scanning or blocking deployment on historical rows while
-- still enforcing the constraint for new and updated rows immediately.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'applications_bond_payment_state_method_check'
      AND conrelid = 'applications'::regclass
  ) THEN
    ALTER TABLE applications
      ADD CONSTRAINT applications_bond_payment_state_method_check
      CHECK (
        (bond_payment_status IS NULL AND bond_payment_method IS NULL) OR
        (bond_payment_status = 'to_collect' AND bond_payment_method IS NULL) OR
        (bond_payment_status = 'cash_paid' AND bond_payment_method = 'cash') OR
        (bond_payment_status = 'already_paid' AND bond_payment_method = 'existing_paid')
      ) NOT VALID;
  END IF;
END
$$;

-- Rollback: ALTER TABLE applications DROP CONSTRAINT IF EXISTS
-- applications_bond_payment_state_method_check;
-- After auditing historical rows, a later migration may VALIDATE CONSTRAINT.
