CREATE TABLE IF NOT EXISTS stripe_balance_transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  source TEXT,
  amount NUMERIC NOT NULL,
  fee NUMERIC,
  destination_platform_fee NUMERIC,
  destination_platform_fee_currency TEXT,
  net NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'aud',
  created_at TIMESTAMPTZ NOT NULL,
  available_on TIMESTAMPTZ,
  description TEXT,
  customer_facing_amount NUMERIC,
  customer_facing_currency TEXT,
  transfer TEXT,
  transfer_date TIMESTAMPTZ,
  transfer_group TEXT,
  import_source TEXT NOT NULL DEFAULT 'stripe-balance-history-csv',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stripe_balance_transactions_created_at
  ON stripe_balance_transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_balance_transactions_type
  ON stripe_balance_transactions(type);

ALTER TABLE stripe_balance_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_full_access ON stripe_balance_transactions;
CREATE POLICY admin_full_access ON stripe_balance_transactions FOR ALL TO authenticated USING (is_admin());
