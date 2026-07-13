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
});
