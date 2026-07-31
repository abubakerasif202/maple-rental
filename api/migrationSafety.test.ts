import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('migration safety guards', () => {
  it('keeps the local destructive reset migration blocked by default', () => {
    const resetMigration = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/00_reset.sql'),
      'utf8'
    );

    expect(resetMigration).toContain('app.allow_destructive_local_reset');
    expect(resetMigration).toContain("to_regclass('public.applications')");
    expect(resetMigration).toContain('WHERE table_oid IS NOT NULL');
    expect(resetMigration).toContain('RAISE EXCEPTION');
    expect(resetMigration).toContain('DROP TABLE IF EXISTS');
  });

  it('enforces valid manual bond status and method pairs in the database', () => {
    const bondMigration = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'supabase/migrations/20260701090000_add_manual_bond_tracking.sql'
      ),
      'utf8'
    );

    expect(bondMigration).toContain('applications_bond_payment_state_method_check');
    expect(bondMigration).toContain(
      "bond_payment_status = 'to_collect' AND bond_payment_method IS NULL"
    );
    expect(bondMigration).toContain(
      "bond_payment_status = 'cash_paid' AND bond_payment_method = 'cash'"
    );
    expect(bondMigration).toContain(
      "bond_payment_status = 'already_paid' AND bond_payment_method = 'existing_paid'"
    );

    const followUpMigration = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'supabase/migrations/20260701091000_enforce_manual_bond_state_pairs.sql'
      ),
      'utf8'
    );

    expect(followUpMigration).toContain('IF NOT EXISTS');
    expect(followUpMigration).toContain('NOT VALID');
    expect(followUpMigration).toContain('applications_bond_payment_state_method_check');
  });

  it('enforces append-only agreements and least-privilege hardening', () => {
    const hardeningMigration = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'supabase/migrations/20260711215014_production_hardening_audit.sql'
      ),
      'utf8'
    );

    expect(hardeningMigration).toContain('lease_agreements_append_only');
    expect(hardeningMigration).toContain('BEFORE UPDATE OR DELETE');
    expect(hardeningMigration).toContain('admin_audit_events');
    expect(hardeningMigration).toContain('document_retention_holds');
    expect(hardeningMigration).toContain('idx_toll_transfer_notices_customer_id');
    expect(hardeningMigration).toContain('REVOKE ALL');
    expect(hardeningMigration).not.toContain('DROP FUNCTION IF EXISTS public.is_admin() CASCADE');
  });

  it('retires direct anonymous application inserts after server mediation', () => {
    const migration = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'supabase/migrations/20260714190000_retire_anonymous_application_inserts.sql'
      ),
      'utf8'
    );

    expect(migration).toContain(
      'DROP POLICY IF EXISTS public_submit_application ON public.applications'
    );
    expect(migration).toContain(
      'REVOKE INSERT ON TABLE public.applications FROM anon'
    );
    expect(migration).not.toMatch(/GRANT\s+INSERT[\s\S]+TO\s+anon/i);
  });

  it('orders Stripe rental status changes with a service-role-only watermark function', () => {
    const migration = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'supabase/migrations/20260715021000_order_stripe_rental_status_events.sql'
      ),
      'utf8'
    );

    expect(migration).toContain('stripe_status_event_created_at');
    expect(migration).toContain('stripe_status_event_id');
    expect(migration).toContain('stripe_status_event_terminal');
    expect(migration).toContain('rental.stripe_status_event_created_at < p_event_created_at');
    expect(migration).toContain('AND p_terminal');
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('TO service_role');
  });

  it('resolves repository-owned hosted database advisor findings', () => {
    const migration = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'supabase/migrations/20260715022000_harden_hosted_database_advisories.sql'
      ),
      'utf8'
    );

    expect(migration).toContain('idx_document_retention_holds_application_id');
    expect(migration).toContain('ALTER EXTENSION pg_trgm SET SCHEMA extensions');
    expect(migration).toContain("to_regprocedure('public.rls_auto_enable()')");
    expect(migration).toContain(
      'FROM PUBLIC, anon, authenticated, service_role'
    );
  });

  it('persists the Checkout Session to subscription relation for future invoices', () => {
    const migration = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'supabase/migrations/20260715023000_persist_checkout_subscription_relation.sql'
      ),
      'utf8'
    );

    expect(migration).toContain('ALTER TABLE public.stripe_webhook_events');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT');
    expect(migration).toContain('idx_stripe_webhook_events_subscription_checkout');
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
    expect(migration).toContain('BEGIN;');
    expect(migration).toContain('COMMIT;');
  });

  it('keeps application data server-mediated after legacy admin policies', () => {
    const migration = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'supabase/migrations/20260715030000_enforce_server_mediated_data_access.sql'
      ),
      'utf8'
    );

    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated'
    );
    expect(migration).toContain(
      'REVOKE USAGE ON SCHEMA private FROM authenticated'
    );
    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated'
    );
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION private.is_admin() FROM authenticated'
    );
    expect(migration).toContain(
      'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role'
    );
    expect(migration).toContain('BEGIN;');
    expect(migration).toContain('COMMIT;');
  });

  it('aggregates the admin dashboard inside Postgres with service-role-only access', () => {
    const migration = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'supabase/migrations/20260719090000_add_admin_dashboard_summary_rpc.sql'
      ),
      'utf8'
    );

    expect(migration).toContain('FUNCTION public.get_admin_dashboard_summary()');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain('AS MATERIALIZED');
    expect(migration).toContain('LIMIT 8');
    expect(migration).toContain("AT TIME ZONE 'Australia/Sydney'");
    expect(migration).toContain('application.legacy_id IS NULL');
    expect(migration).toContain('rental.legacy_application_id IS NULL');
    expect(migration).toContain('FROM PUBLIC');
    expect(migration).toContain('TO service_role');
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it('stops new applications from inheriting a legacy identity value', () => {
    const migration = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'supabase/migrations/20260728090000_fix_application_legacy_identity.sql'
      ),
      'utf8'
    );

    expect(migration).toContain('ALTER COLUMN legacy_id DROP IDENTITY IF EXISTS');
    expect(migration).toContain('ALTER COLUMN legacy_id DROP NOT NULL');
    expect(migration).toContain('UPDATE public.applications');
    expect(migration).toContain("COALESCE(lower(email), '') NOT LIKE '%@example.invalid'");
    expect(migration).toContain(
      "COALESCE(lower(experience), '') NOT LIKE '%imported from live fleet data%'"
    );
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
    expect(migration).toContain('BEGIN;');
    expect(migration).toContain('COMMIT;');
  });

  it('keeps fleet imports staged, private, indexed and idempotent', () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/20260731100000_add_fleet_register_imports.sql'),
      'utf8'
    );
    expect(migration).toContain('CREATE TABLE public.fleet_imports');
    expect(migration).toContain('CREATE TABLE public.fleet_import_rows');
    expect(migration).toContain('CREATE TABLE public.fleet_import_apply_operations');
    expect(migration).toContain('file_checksum TEXT NOT NULL UNIQUE');
    expect(migration).toContain('UNIQUE (import_id, source_row_number)');
    expect(migration).not.toContain('UNIQUE (import_id, vehicle_registration_normalized)');
    expect(migration).toContain('CREATE INDEX idx_fleet_import_rows_import_registration ON public.fleet_import_rows (import_id, vehicle_registration_normalized)');
    expect(migration).toContain('UNIQUE (import_id, idempotency_key)');
    for (const table of ['fleet_imports', 'fleet_import_rows', 'fleet_import_apply_operations']) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
    expect(migration).toContain('REVOKE ALL ON public.fleet_imports, public.fleet_import_rows, public.fleet_import_apply_operations FROM anon, authenticated');
    expect(migration).toContain('GRANT ALL ON public.fleet_imports, public.fleet_import_rows, public.fleet_import_apply_operations TO service_role');
    expect(migration).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*fleet_import[^;]*TO\s+(?:anon|authenticated)/i);
    expect(migration).toContain('BEGIN;');
    expect(migration).toContain('COMMIT;');
  });

  it('applies the shared trusted-origin guard to fleet-import routes', () => {
    const route = fs.readFileSync(
      path.resolve(process.cwd(), 'api/routes/fleetImports.ts'),
      'utf8'
    );
    expect(route).toContain("import { authenticateAdmin, requireTrustedAdminWriteOrigin } from '../middleware/auth.js';");
    expect(route).toContain('router.use(authenticateAdmin, requireTrustedAdminWriteOrigin);');
    expect(route).toContain('driver_name_original=CASE WHEN $3 THEN $4 ELSE driver_name_original END');
    expect(route).toContain('driver_name_normalized=CASE WHEN $3 THEN $5 ELSE driver_name_normalized END');
  });

  it('keeps fleet import application payment-only and limits rental writes to weekly rate', () => {
    const route = fs.readFileSync(
      path.resolve(process.cwd(), 'api/routes/fleetImports.ts'),
      'utf8'
    );
    expect(route).not.toMatch(/UPDATE\s+public\.applications/i);
    expect(route).not.toMatch(/INSERT\s+INTO\s+public\.rentals/i);
    expect(route).not.toMatch(/UPDATE\s+public\.rentals\s+SET[^;]*(?:status|vehicle_registration)/i);
    expect(route).not.toMatch(/stripe|paymentActivation|approved_vehicle|car_id|carId/i);
    expect(route).toContain('UPDATE public.rentals SET weekly_price=$1, updated_at=now() WHERE id=$2');
  });
});
