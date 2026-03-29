import { supabaseAdmin } from '../lib/supabase.js';

const requiredTables = [
  'drivers',
  'vehicles',
  'applications',
  'subscriptions',
  'payments',
  'payouts',
  'contracts',
  'notifications',
];

let cachedHealth = null;
let cachedAt = 0;

export const getSystemHealth = async () => {
  const now = Date.now();
  if (cachedHealth && now - cachedAt < 30_000) {
    return cachedHealth;
  }

  const checks = await Promise.all(
    requiredTables.map(async (table) => {
      const { error } = await supabaseAdmin
        .from(table)
        .select('id')
        .limit(1);

      return {
        table,
        ok: !error,
        message: error?.message || null,
      };
    }),
  );

  cachedHealth = {
    ok: checks.every((check) => check.ok),
    checks,
  };
  cachedAt = now;

  return cachedHealth;
};
