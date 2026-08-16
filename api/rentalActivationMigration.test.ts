import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260816120000_restore_uuid_native_rental_inserts.sql',
    import.meta.url
  ),
  'utf8'
);
const rentalRoutes = readFileSync(new URL('./routes/rentals.ts', import.meta.url), 'utf8');

describe('UUID-native rental activation migration', () => {
  it('restores the existing sequence default and permits a null legacy application id', () => {
    expect(migration).toMatch(
      /ALTER COLUMN id SET DEFAULT nextval\('public\.rentals_id_seq'::regclass\)/i
    );
    expect(migration).toMatch(/ALTER COLUMN legacy_application_id DROP NOT NULL/i);
    expect(migration).toContain("to_regclass('public.rentals_id_seq')");
    expect(migration).toContain("rental_id_sequence_kind <> 'S'");
  });

  it('aligns the sequence without MAX(id) plus one application-side allocation', () => {
    expect(migration).toContain('LOCK TABLE public.rentals IN ACCESS EXCLUSIVE MODE');
    expect(migration).toContain('sequence_last_value <= highest_rental_id');
    expect(migration).toContain('GREATEST(sequence_last_value, highest_rental_id)');
    expect(migration).toMatch(/pg_catalog\.setval\([\s\S]*true[\s\S]*\)/i);
    expect(migration).not.toMatch(/max\s*\(\s*id\s*\)\s*\+\s*1/i);
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
