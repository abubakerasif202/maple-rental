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
});
