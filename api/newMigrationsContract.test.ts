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
