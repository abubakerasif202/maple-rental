import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260816120000_restore_uuid_native_rental_inserts.sql',
    import.meta.url
  ),
  'utf8'
);
const executableMigration = migration.replace(/^--.*$/gm, '');
const rentalRoutes = readFileSync(new URL('./routes/rentals.ts', import.meta.url), 'utf8');

describe('UUID-native rental activation migration', () => {
  it('preserves the existing BY DEFAULT identity and permits a null legacy application id', () => {
    expect(migration).toContain("column_info.is_identity");
    expect(migration).toContain("column_info.identity_generation");
    expect(migration).toContain("rental_id_is_identity IS DISTINCT FROM 'YES'");
    expect(migration).toContain("rental_id_generation IS DISTINCT FROM 'BY DEFAULT'");
    expect(migration).toContain("pg_get_serial_sequence('public.rentals', 'id')");
    expect(migration).toMatch(/ALTER COLUMN legacy_application_id DROP NOT NULL/i);
    expect(executableMigration).not.toMatch(/ALTER\s+COLUMN\s+id\s+SET\s+DEFAULT/i);
    expect(executableMigration).not.toMatch(/DROP\s+IDENTITY/i);
    expect(executableMigration).not.toMatch(/ADD\s+GENERATED/i);
    expect(executableMigration).not.toMatch(/CREATE\s+SEQUENCE/i);
    expect(executableMigration).not.toMatch(/ALTER\s+SEQUENCE/i);
  });

  it('fails closed when the existing identity sequence position is unsafe without mutating it', () => {
    expect(migration).toContain('LOCK TABLE public.rentals IN ACCESS EXCLUSIVE MODE');
    expect(migration).toContain('sequence_is_called AND sequence_last_value < highest_rental_id');
    expect(migration).toContain('NOT sequence_is_called AND sequence_last_value <= highest_rental_id');
    expect(executableMigration).not.toMatch(/\bsetval\s*\(/i);
    expect(executableMigration).not.toMatch(/\bnextval\s*\(/i);
  });

  it('does not rewrite historical rows, fabricate legacy ids, or edit rental ids', () => {
    expect(migration).not.toMatch(/\bUPDATE\s+public\.rentals\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+public\.rentals\b/i);
    expect(migration).not.toMatch(/ALTER\s+COLUMN\s+id\s+TYPE/i);
    expect(migration).not.toMatch(/SET\s+legacy_application_id\s*=/i);
    expect(migration).toContain('BEGIN;');
    expect(migration).toContain('COMMIT;');
  });

  it('keeps unexpected activation diagnostics server-side and the browser response generic', () => {
    expect(rentalRoutes).toContain(
      'console.error("Rental activation failed", getRentalActivationErrorLog(error))'
    );
    expect(rentalRoutes).toContain(
      'return res.status(500).json({ error: "Failed to activate rental" })'
    );
    expect(rentalRoutes).not.toMatch(
      /status\(500\)\.json\(\{\s*error:\s*error\.(?:message|databaseMessage)/
    );
  });
});
