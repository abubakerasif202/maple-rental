import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

const {
  mockCreateClient,
  mockFrom,
  mockLimit,
  mockSelect,
  mockVerifyProductionSchemaContract,
} = vi.hoisted(() => {
  const mockLimit = vi.fn(async () => ({ error: null }));
  const mockSelect = vi.fn(() => ({ limit: mockLimit }));
  const mockFrom = vi.fn(() => ({ select: mockSelect }));
  const mockCreateClient = vi.fn(() => ({ from: mockFrom }));
  const mockVerifyProductionSchemaContract = vi.fn(async () => undefined);

  return {
    mockCreateClient,
    mockFrom,
    mockLimit,
    mockSelect,
    mockVerifyProductionSchemaContract,
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

vi.mock('../schemaContract.js', () => ({
  verifyProductionSchemaContract: mockVerifyProductionSchemaContract,
}));

describe('checkDBHealth', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('continues in compatibility mode when schema contract validation drifts in production', async () => {
    mockVerifyProductionSchemaContract.mockRejectedValueOnce(new Error('missing columns'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { checkDBHealth } = await import('./index.js');

    await expect(checkDBHealth()).resolves.toEqual({
      configured: true,
      issues: ['schema_contract_validation_failed'],
    });

    expect(mockFrom).toHaveBeenCalledWith('applications');
    expect(mockSelect).toHaveBeenCalledWith('id', { head: true });
    expect(mockLimit).toHaveBeenCalledWith(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'Production schema contract validation failed during database health check; continuing with compatibility mode.',
      expect.any(Error)
    );
  });
});
