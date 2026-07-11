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
});
