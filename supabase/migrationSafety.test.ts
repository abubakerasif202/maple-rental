import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readRepoFile = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');

describe('prepared migration safety', () => {
  it('guards and validates the registration-only migration before destructive statements', () => {
    const migration = readRepoFile(
      'supabase/migrations/20260711113000_replace_cars_with_registration_text.sql'
    );

    expect(migration).toContain('BEGIN;');
    expect(migration).toContain('COMMIT;');
    expect(migration).toContain("to_regclass('public.cars')");
    expect(migration).toContain('information_schema.columns');
    expect(migration).toContain('pg_constraint');
    expect(migration).toContain('pg_depend');
    expect(migration).toContain('unexpected_normal_dependencies');
    expect(migration).toContain('total_unresolved');
    expect(migration).toContain('RAISE EXCEPTION');
    expect(migration).toContain('DROP TABLE public.cars RESTRICT');
    expect(migration).not.toMatch(/\bCASCADE\b/i);
    expect(migration).not.toContain("NULLIF(BTRIM(car.name), '')");

    for (const table of [
      'applications',
      'rentals',
      'bookings',
      'lease_agreements',
      'toll_transfer_notices',
      'stripe_webhook_events',
    ]) {
      expect(migration).toContain(`'${table}'`);
    }
  });

  it('removes only single-column agreement application uniqueness', () => {
    const migration = readRepoFile(
      'supabase/migrations/20260711110000_make_lease_agreement_history_immutable.sql'
    );

    expect(migration).toContain('agreement_template_version');
    expect(migration).toContain("constraint_row.contype = 'u'");
    expect(migration).toContain('constraint_row.conkey = ARRAY[application_attnum]');
    expect(migration).toContain('index_row.indnkeyatts = 1');
    expect(migration).toContain('index_row.indpred IS NULL');
    expect(migration).toContain(
      'idx_lease_agreements_application_created_at'
    );
    expect(migration).not.toContain(
      'DROP INDEX IF EXISTS public.lease_agreements_application_id_unique'
    );
  });

  it('keeps the production preflight read-only and reports dependencies and uniqueness', () => {
    const preflight = readRepoFile(
      'scripts/verify-registration-migration-preflight.sql'
    );

    expect(preflight).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(preflight).toContain('ROLLBACK;');
    expect(preflight).toContain('pg_depend');
    expect(preflight).toContain('pg_constraint');
    expect(preflight).toContain('missing/implausible registrations');
    expect(preflight).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i);
  });
});
