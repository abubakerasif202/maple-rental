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

const CACHE_TTL_MS = 30_000;
const DEFAULT_PROBE_TIMEOUT_MS = 1_500;

let cachedHealth = null;
let cachedAt = 0;
let inFlightHealth = null;

const buildPendingHealth = () => ({
  ok: false,
  pending: true,
  stale: false,
  checkedAt: null,
  durationMs: 0,
  checks: requiredTables.map((table) => ({
    table,
    ok: null,
    message: 'Pending initial dependency probe.',
  })),
});

const probeTable = async (table, timeoutMs) => {
  const timeout = new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        table,
        ok: false,
        message: `Timed out after ${timeoutMs}ms.`,
      });
    }, timeoutMs);
  });

  const query = supabaseAdmin
    .from(table)
    .select('id')
    .limit(1)
    .then(({ error }) => ({
      table,
      ok: !error,
      message: error?.message || null,
    }))
    .catch((error) => ({
      table,
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown dependency probe failure.',
    }));

  return Promise.race([query, timeout]);
};

const runHealthProbe = async ({ timeoutMs = DEFAULT_PROBE_TIMEOUT_MS } = {}) => {
  const startedAt = Date.now();
  const checks = await Promise.all(requiredTables.map((table) => probeTable(table, timeoutMs)));

  return {
    ok: checks.every((check) => check.ok),
    pending: false,
    stale: false,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    checks,
  };
};

const cacheHealth = (health) => {
  cachedHealth = health;
  cachedAt = Date.now();
  return health;
};

export const getHealthSnapshot = () => cachedHealth ?? buildPendingHealth();

export const refreshSystemHealth = async (options = {}) => {
  if (!inFlightHealth) {
    inFlightHealth = runHealthProbe(options)
      .then(cacheHealth)
      .finally(() => {
        inFlightHealth = null;
      });
  }

  return inFlightHealth;
};

export const warmSystemHealth = (options = {}) => {
  const now = Date.now();
  if (!inFlightHealth && (!cachedHealth || now - cachedAt >= CACHE_TTL_MS)) {
    void refreshSystemHealth(options);
  }

  return getHealthSnapshot();
};

export const getSystemHealth = async ({ allowStale = true, maxAgeMs = CACHE_TTL_MS, timeoutMs } = {}) => {
  const now = Date.now();
  if (allowStale && cachedHealth && now - cachedAt < maxAgeMs) {
    return cachedHealth;
  }

  return refreshSystemHealth({ timeoutMs });
};
