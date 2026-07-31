-- Staged, admin-only fleet register imports. Snapshot rows are inert until an
-- admin explicitly matches, reviews, dry-runs and applies selected rows.
-- Preflight: verify rentals.vehicle_registration, rentals.weekly_price and
-- admin_audit_events exist, and take a current database backup.
-- Recovery: unapplied imports can be cancelled. Applied weekly-rate changes
-- must be reversed through a separately reviewed admin change using the audit
-- metadata; dropping these staging tables does not reverse rental updates.

BEGIN;

CREATE TABLE public.fleet_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_filename TEXT NOT NULL CHECK (btrim(original_filename) <> ''),
  file_checksum TEXT NOT NULL UNIQUE CHECK (file_checksum ~ '^[0-9a-f]{64}$'),
  file_size INTEGER NOT NULL CHECK (file_size BETWEEN 1 AND 2097152),
  source_type TEXT NOT NULL CHECK (source_type IN ('xlsx', 'csv')),
  snapshot_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'needs_review'
    CHECK (status IN ('uploaded', 'parsing', 'needs_review', 'ready', 'applying', 'partially_applied', 'applied', 'failed', 'cancelled')),
  total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  valid_rows INTEGER NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  review_rows INTEGER NOT NULL DEFAULT 0 CHECK (review_rows >= 0),
  applied_rows INTEGER NOT NULL DEFAULT 0 CHECK (applied_rows >= 0),
  rejected_rows INTEGER NOT NULL DEFAULT 0 CHECK (rejected_rows >= 0),
  uploaded_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  failure_reason TEXT
);

CREATE TABLE public.fleet_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES public.fleet_imports(id) ON DELETE CASCADE,
  source_row_number INTEGER NOT NULL CHECK (source_row_number > 0),
  driver_name_original TEXT,
  driver_name_normalized TEXT,
  vehicle_registration_original TEXT NOT NULL,
  vehicle_registration_normalized TEXT NOT NULL,
  make_original TEXT NOT NULL,
  make_normalized TEXT NOT NULL,
  model_original TEXT NOT NULL,
  model_normalized TEXT NOT NULL,
  weekly_rate NUMERIC(10, 2) NOT NULL CHECK (weekly_rate > 0 AND weekly_rate <= 10000),
  snapshot_date DATE NOT NULL,
  source_notes TEXT,
  validation_status TEXT NOT NULL CHECK (validation_status IN ('ready', 'needs_review')),
  validation_errors JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(validation_errors) = 'array'),
  validation_warnings JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(validation_warnings) = 'array'),
  review_acknowledged_at TIMESTAMPTZ,
  review_acknowledged_by TEXT,
  matched_rental_id BIGINT REFERENCES public.rentals(id) ON DELETE SET NULL,
  matched_customer_id BIGINT REFERENCES public.customers(id) ON DELETE SET NULL,
  matched_rental_updated_at TIMESTAMPTZ,
  proposed_changes JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(proposed_changes) = 'object'),
  apply_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (apply_status IN ('pending', 'applied', 'rejected', 'conflict')),
  rejection_reason TEXT,
  applied_at TIMESTAMPTZ,
  applied_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (import_id, source_row_number)
);

CREATE TABLE public.fleet_import_apply_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES public.fleet_imports(id) ON DELETE CASCADE,
  idempotency_key UUID NOT NULL,
  requested_by TEXT NOT NULL,
  selected_row_ids UUID[] NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'applied', 'failed')),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  UNIQUE (import_id, idempotency_key)
);

CREATE INDEX idx_fleet_imports_status_created ON public.fleet_imports (status, created_at DESC);
CREATE INDEX idx_fleet_imports_snapshot_date ON public.fleet_imports (snapshot_date DESC);
CREATE INDEX idx_fleet_import_rows_import_status ON public.fleet_import_rows (import_id, validation_status, apply_status, source_row_number);
CREATE INDEX idx_fleet_import_rows_import_registration ON public.fleet_import_rows (import_id, vehicle_registration_normalized);
CREATE INDEX idx_fleet_import_rows_snapshot_date ON public.fleet_import_rows (snapshot_date, import_id);
CREATE INDEX idx_fleet_import_rows_matched_rental ON public.fleet_import_rows (matched_rental_id) WHERE matched_rental_id IS NOT NULL;
CREATE INDEX idx_fleet_import_apply_operations_created ON public.fleet_import_apply_operations (import_id, created_at DESC);

ALTER TABLE public.fleet_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_import_apply_operations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.fleet_imports, public.fleet_import_rows, public.fleet_import_apply_operations FROM anon, authenticated;
GRANT ALL ON public.fleet_imports, public.fleet_import_rows, public.fleet_import_apply_operations TO service_role;

COMMIT;
