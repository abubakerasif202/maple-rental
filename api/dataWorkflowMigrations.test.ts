import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = (name: string) => fs.readFileSync(
  path.join(process.cwd(), 'supabase', 'migrations', name),
  'utf8',
);

describe('admin data workflow migrations', () => {
  it('uses the private admin helper and complete write policy for Stripe CSV rows', () => {
    const sql = migration('20260714033000_stripe_csv_imports.sql');
    expect(sql).toContain('USING (private.is_admin())');
    expect(sql).toContain('WITH CHECK (private.is_admin())');
    expect(sql).toContain('REVOKE ALL ON public.stripe_balance_transactions FROM anon, authenticated');
    expect(sql).not.toMatch(/\bUSING \(is_admin\(\)\)/);
  });

  it('locks agreement version changes and keeps financial writes transactional', () => {
    const sql = migration('20260715020000_harden_admin_data_workflows.sql');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.create_manual_invoice_transaction');
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('agreement-template:'");
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.activate_agreement_template');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.aggregate_stripe_balance_transactions');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.list_current_customer_invoice_summaries');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.create_manual_invoice_transaction(JSONB, JSONB) TO service_role');
  });

  it('persists toll delivery claims and finalization behind server-only RPCs', () => {
    const sql = migration('20260715020000_harden_admin_data_workflows.sql');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.toll_notice_delivery_attempts');
    expect(sql).toContain('UNIQUE (toll_transfer_notice_id, recipient_email, content_hash)');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.claim_toll_notice_delivery');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.finalize_toll_notice_delivery');
    expect(sql).toContain('REVOKE ALL ON public.toll_notice_delivery_attempts FROM anon, authenticated');
  });
});
