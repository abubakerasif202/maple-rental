import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readMigration = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');

describe('July 21 additive remediation migrations', () => {
  it('persists nullable Stripe customer identity with a partial index', () => {
    const sql = readMigration('20260721090000_persist_stripe_customer_identity.sql');
    expect(sql).toMatch(/stripe_customer_id text null/i);
    expect(sql).toMatch(/where stripe_customer_id is not null/i);
    expect(sql).not.toMatch(/update public\.stripe_webhook_events/i);
  });

  it('defines durable cancellation states and uniqueness', () => {
    const sql = readMigration('20260721091000_add_stripe_cancellation_operations.sql');
    for (const state of ['requested','stripe_processing','stripe_completed','database_completed','reconciliation_pending','completed','failed']) expect(sql).toContain(state);
    expect(sql).toMatch(/idempotency_key text not null unique/i);
  });

  it('defines private immutable agreement artifact metadata', () => {
    const sql = readMigration('20260721092000_add_lease_agreement_pdf_artifacts.sql');
    for (const field of ['source_agreement_id','storage_path','sha256','byte_size','template_version','generator_version','generation_status']) expect(sql).toContain(field);
    expect(sql).toContain("values ('lease-agreements', 'lease-agreements', false)");
  });
});

describe('August 21 audit integrity migration', () => {
  it('makes admin audit events server-authored and append-only', () => {
    const sql = readMigration('20260821120000_make_admin_audit_events_immutable.sql');
    expect(sql).toMatch(/revoke insert, update, delete, truncate[\s\S]*from anon, authenticated/i);
    expect(sql).toMatch(/revoke all privileges[\s\S]*from service_role/i);
    expect(sql).toMatch(/grant select, insert[\s\S]*to service_role/i);
    expect(sql).toMatch(/drop policy if exists admin_audit_insert/i);
    expect(sql).toMatch(/before update or delete on public\.admin_audit_events/i);
    expect(sql).toMatch(/before truncate on public\.admin_audit_events/i);
    expect(sql).toMatch(/raise exception 'admin_audit_events is append-only'/i);
    expect(sql).not.toMatch(/delete from public\.admin_audit_events/i);
  });
});

describe('August 21 private application storage migration', () => {
  it('creates or hardens the application document bucket as private and bounded', () => {
    const sql = readMigration('20260821121000_harden_application_document_bucket.sql');
    expect(sql).toContain("'applications',\n  'applications',\n  false");
    expect(sql).toMatch(/file_size_limit\s*=\s*excluded\.file_size_limit/i);
    expect(sql).toMatch(/allowed_mime_types\s*=\s*excluded\.allowed_mime_types/i);
    expect(sql).toContain("ARRAY['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']::text[]");
    expect(sql).toContain('7340032');
    expect(sql).toMatch(/public\s*=\s*false/i);
    expect(sql).not.toMatch(/public\s*=\s*true/i);
    expect(sql).not.toMatch(/storage\.objects/i);
  });
});

describe('August 21 verified Stripe relationship transaction', () => {
  it('commits application identity, customer linkage, and audit in one RPC', () => {
    const sql = readMigration('20260821093210_make_verified_stripe_identity_atomic.sql');
    expect(sql).toMatch(/create or replace function public\.persist_verified_stripe_relationship/i);
    expect(sql).toMatch(/from public\.applications[\s\S]*for update/i);
    expect(sql).toMatch(/update public\.applications/i);
    expect(sql).toMatch(/insert into public\.customers/i);
    expect(sql).toMatch(/insert into public\.admin_audit_events/i);
    expect(sql).toMatch(/revoke all on function[\s\S]*from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function[\s\S]*to service_role/i);
    expect(sql).not.toMatch(/insert into public\.rentals/i);
    expect(sql).not.toMatch(/update public\.cars/i);
    expect(sql).not.toMatch(/'stripeCustomerId'/i);
    expect(sql).not.toMatch(/'stripeSubscriptionId'/i);
  });
});
