import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

const poolCtor = vi.hoisted(() => {
  const mockPool = {
    connect: vi.fn(),
    end: vi.fn(),
  };
  let lastPoolOptions: Record<string, unknown> | null = null;
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  };

  class MockPool {
    options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      lastPoolOptions = options;
      return mockPool as unknown as MockPool;
    }
  }

  return {
    MockPool,
    mockClient,
    mockPool,
    getLastPoolOptions: () => lastPoolOptions,
  };
});

vi.mock('pg', () => ({
  default: {
    Pool: poolCtor.MockPool,
  },
}));

describe('postgres pool configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    process.env.DATABASE_URL =
      'postgresql://postgres.example:secret@db.internal.example.com:5432/app';
    poolCtor.mockPool.connect.mockResolvedValue(poolCtor.mockClient);
    poolCtor.mockClient.query.mockResolvedValue(undefined);
    poolCtor.mockClient.release.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('defaults to 20 in transaction mode and 10 in session mode', async () => {
    const { getDirectDatabaseConfig, getPostgresConnectionMode } = await import('./postgres.js');

    expect(getDirectDatabaseConfig().mode).toBe('session');
    expect(getPostgresConnectionMode()).toBe('session');
  });

  it('uses DB_POOL_SIZE when it is a valid positive integer', async () => {
    process.env.DB_POOL_SIZE = '12';
    const { getPostgresConnectionMode, withPostgresTransaction } = await import('./postgres.js');

    expect(getPostgresConnectionMode()).toBe('session');
    await expect(withPostgresTransaction(async () => 'ok')).resolves.toBe('ok');
    expect(poolCtor.getLastPoolOptions()?.max).toBe(12);
  });

  it('warns and falls back for invalid DB_POOL_SIZE values', async () => {
    process.env.DB_POOL_SIZE = 'not-a-number';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { withPostgresTransaction } = await import('./postgres.js');

    await expect(withPostgresTransaction(async () => 'ok')).resolves.toBe('ok');
    expect(warnSpy).toHaveBeenCalledWith(
      'Ignoring invalid DB_POOL_SIZE value; using the default PostgreSQL pool size instead.'
    );
    expect(poolCtor.getLastPoolOptions()?.max).toBe(10);
  });

  it('enforces certificate verification for external PostgreSQL hosts', async () => {
    process.env.DATABASE_URL =
      'postgresql://postgres.example:secret@aws-0-ap-southeast-2.pooler.supabase.com:5432/app?sslmode=require';
    process.env.DATABASE_SSL_CA = 'line-one\\nline-two';
    const { withPostgresTransaction } = await import('./postgres.js');

    await expect(withPostgresTransaction(async () => 'ok')).resolves.toBe('ok');
    expect(poolCtor.getLastPoolOptions()).toMatchObject({
      connectionString:
        'postgresql://postgres.example:secret@aws-0-ap-southeast-2.pooler.supabase.com:5432/app',
      ssl: {
        ca: 'line-one\nline-two',
        rejectUnauthorized: true,
      },
    });
  });

  it('rejects external connection strings that disable certificate verification', async () => {
    process.env.DATABASE_URL =
      'postgresql://postgres.example:secret@db.example.com:5432/app?sslmode=no-verify';
    const { withPostgresTransaction } = await import('./postgres.js');

    await expect(withPostgresTransaction(async () => 'ok')).rejects.toThrow(
      'External PostgreSQL connections must use certificate-verified TLS.'
    );
    expect(poolCtor.mockPool.connect).not.toHaveBeenCalled();
  });

  it('does not require TLS for explicit private-network hosts', async () => {
    process.env.DATABASE_URL = 'postgresql://postgres.example:secret@maple-db.internal:5432/app';
    const { withPostgresTransaction } = await import('./postgres.js');

    await expect(withPostgresTransaction(async () => 'ok')).resolves.toBe('ok');
    expect(poolCtor.getLastPoolOptions()).not.toHaveProperty('ssl');
  });

  it('supports explicitly named Render internal database hosts without plaintext fallback for arbitrary hosts', async () => {
    process.env.DATABASE_URL = 'postgresql://postgres:secret@dpg-maple-db-a:5432/app';
    const { withPostgresTransaction } = await import('./postgres.js');

    await expect(withPostgresTransaction(async () => 'ok')).resolves.toBe('ok');
    expect(poolCtor.getLastPoolOptions()).not.toHaveProperty('ssl');
  });

  it('does not classify arbitrary bare hostnames as approved private hosts', async () => {
    process.env.DATABASE_URL = 'postgresql://postgres:secret@database:5432/app';
    const { withPostgresTransaction } = await import('./postgres.js');

    await expect(withPostgresTransaction(async () => 'ok')).resolves.toBe('ok');
    expect(poolCtor.getLastPoolOptions()).toMatchObject({
      ssl: { rejectUnauthorized: true },
    });
  });

  it('rejects a separate production database that does not match the Supabase data plane', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SUPABASE_URL = 'https://maple-project.supabase.co';
    process.env.DATABASE_URL =
      'postgresql://postgres:secret@dpg-maple-db-a:5432/app';
    const {
      getDirectDatabaseAlignmentIssue,
      getSessionModePostgresRequirementIssue,
      hasDirectDatabaseConnection,
    } = await import('./postgres.js');

    expect(hasDirectDatabaseConnection()).toBe(false);
    expect(getDirectDatabaseAlignmentIssue()).toContain(
      'same Supabase project'
    );
    expect(getSessionModePostgresRequirementIssue()).toContain(
      'split application and payment state'
    );
  });

  it('accepts a production session pooler for the same Supabase project', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SUPABASE_URL = 'https://maple-project.supabase.co';
    process.env.DATABASE_URL =
      'postgresql://postgres.maple-project:secret@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';
    const {
      getDirectDatabaseAlignmentIssue,
      hasDirectDatabaseConnection,
    } = await import('./postgres.js');

    expect(getDirectDatabaseAlignmentIssue()).toBeNull();
    expect(hasDirectDatabaseConnection()).toBe(true);
  });

  it('reuses the advisory-lock client for a nested transaction', async () => {
    poolCtor.mockClient.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT pg_try_advisory_lock')) {
        return { rows: [{ acquired: true }] };
      }
      return { rows: [] };
    });
    const { withPostgresAdvisoryLock, withPostgresTransaction } = await import(
      './postgres.js'
    );

    await expect(
      withPostgresAdvisoryLock('payment:one', () =>
        withPostgresTransaction(async () => 'ok')
      )
    ).resolves.toBe('ok');

    expect(poolCtor.mockPool.connect).toHaveBeenCalledTimes(1);
    expect(poolCtor.mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(poolCtor.mockClient.query).toHaveBeenCalledWith('COMMIT');
  });
});
