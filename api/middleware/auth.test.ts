import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-auth-secret-for-unit-tests';
  process.env.VITEST = 'true';
});

vi.mock('../db/index.js', () => ({
  createAuthClient: vi.fn(),
  checkDBHealth: vi.fn(),
  db: {},
  initializeDB: vi.fn(),
  getSupabaseAuthConfigurationIssues: vi.fn(() => []),
  getSupabaseConfigurationIssues: vi.fn(() => []),
}));

import {
  createLocalAdminSessionToken,
  createSupabaseAdminSessionToken,
  getEffectiveAdminEmail,
  getSupabaseSessionExpiry,
} from './auth.js';

// ---------------------------------------------------------------------------
// getEffectiveAdminEmail
// ---------------------------------------------------------------------------

describe('getEffectiveAdminEmail', () => {
  const originalAdminEmail = process.env.ADMIN_EMAIL;

  afterEach(() => {
    if (originalAdminEmail === undefined) {
      delete process.env.ADMIN_EMAIL;
    } else {
      process.env.ADMIN_EMAIL = originalAdminEmail;
    }
  });

  it('returns the configured ADMIN_EMAIL when set', () => {
    process.env.ADMIN_EMAIL = 'fleet@example.com';
    expect(getEffectiveAdminEmail()).toBe('fleet@example.com');
  });

  it('normalises ADMIN_EMAIL to lower case', () => {
    process.env.ADMIN_EMAIL = 'FLEET@EXAMPLE.COM';
    expect(getEffectiveAdminEmail()).toBe('fleet@example.com');
  });

  it('trims surrounding whitespace from ADMIN_EMAIL', () => {
    process.env.ADMIN_EMAIL = '  fleet@example.com  ';
    expect(getEffectiveAdminEmail()).toBe('fleet@example.com');
  });

  it('falls back to the dev admin email when ADMIN_EMAIL is not set (non-production)', () => {
    delete process.env.ADMIN_EMAIL;
    // VITEST=true so isProduction is false → dev fallback is used
    expect(getEffectiveAdminEmail()).toBe('admin@maplerentals.com.au');
  });

  it('returns null for an empty ADMIN_EMAIL string when in non-production', () => {
    process.env.ADMIN_EMAIL = '';
    // Empty string → configuredAdminEmail is falsy → falls back to dev email
    expect(getEffectiveAdminEmail()).toBe('admin@maplerentals.com.au');
  });
});

// ---------------------------------------------------------------------------
// getSupabaseSessionExpiry
// ---------------------------------------------------------------------------

describe('getSupabaseSessionExpiry', () => {
  it('returns null when session is null', () => {
    expect(getSupabaseSessionExpiry(null)).toBeNull();
  });

  it('returns null when session is undefined', () => {
    expect(getSupabaseSessionExpiry(undefined)).toBeNull();
  });

  it('returns null when expires_at is missing', () => {
    expect(getSupabaseSessionExpiry({})).toBeNull();
  });

  it('returns null when expires_at is null', () => {
    expect(getSupabaseSessionExpiry({ expires_at: null })).toBeNull();
  });

  it('converts a Unix timestamp (seconds) to milliseconds', () => {
    const seconds = Math.floor(Date.now() / 1000) + 3600;
    const result = getSupabaseSessionExpiry({ expires_at: seconds });
    expect(result).toBe(seconds * 1000);
  });

  it('returns null when expires_at is Infinity', () => {
    expect(getSupabaseSessionExpiry({ expires_at: Infinity })).toBeNull();
  });

  it('returns null when expires_at is NaN', () => {
    expect(getSupabaseSessionExpiry({ expires_at: NaN })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createLocalAdminSessionToken  (requires JWT_SECRET to be set)
// ---------------------------------------------------------------------------

describe('createLocalAdminSessionToken', () => {
  it('returns a signed token string containing two base64url parts separated by a dot', () => {
    const token = createLocalAdminSessionToken('admin@example.com');
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });

  it('embeds the supplied email in the payload', () => {
    const email = 'fleet@example.com';
    const token = createLocalAdminSessionToken(email);
    const [encodedPayload] = token.split('.');
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    expect(payload.email).toBe(email);
  });

  it('sets mode to local-admin in the payload', () => {
    const token = createLocalAdminSessionToken('admin@example.com');
    const [encodedPayload] = token.split('.');
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    expect(payload.mode).toBe('local-admin');
  });

  it('sets an expiry (exp) that is in the future', () => {
    const before = Date.now();
    const token = createLocalAdminSessionToken('admin@example.com');
    const [encodedPayload] = token.split('.');
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    expect(payload.exp).toBeGreaterThan(before);
  });

  it('produces different tokens for different emails', () => {
    const token1 = createLocalAdminSessionToken('a@example.com');
    const token2 = createLocalAdminSessionToken('b@example.com');
    expect(token1).not.toBe(token2);
  });
});

// ---------------------------------------------------------------------------
// createSupabaseAdminSessionToken  (requires JWT_SECRET to be set)
// ---------------------------------------------------------------------------

describe('createSupabaseAdminSessionToken', () => {
  const sessionParams = {
    accessToken: 'at_test_123',
    accessTokenExpiresAt: Date.now() + 3600_000,
    email: 'admin@example.com',
    refreshToken: 'rt_test_456',
  };

  it('returns a signed token string with two base64url parts', () => {
    const token = createSupabaseAdminSessionToken(sessionParams);
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
  });

  it('embeds the supplied email in the payload', () => {
    const token = createSupabaseAdminSessionToken(sessionParams);
    const [encodedPayload] = token.split('.');
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    expect(payload.email).toBe(sessionParams.email);
  });

  it('embeds the access and refresh tokens in the payload', () => {
    const token = createSupabaseAdminSessionToken(sessionParams);
    const [encodedPayload] = token.split('.');
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    expect(payload.accessToken).toBe(sessionParams.accessToken);
    expect(payload.refreshToken).toBe(sessionParams.refreshToken);
  });

  it('sets mode to supabase-admin in the payload', () => {
    const token = createSupabaseAdminSessionToken(sessionParams);
    const [encodedPayload] = token.split('.');
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    expect(payload.mode).toBe('supabase-admin');
  });

  it('stores the accessTokenExpiresAt value in the payload', () => {
    const token = createSupabaseAdminSessionToken(sessionParams);
    const [encodedPayload] = token.split('.');
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    expect(payload.accessTokenExpiresAt).toBe(sessionParams.accessTokenExpiresAt);
  });

  it('stores null accessTokenExpiresAt when it is null', () => {
    const token = createSupabaseAdminSessionToken({ ...sessionParams, accessTokenExpiresAt: null });
    const [encodedPayload] = token.split('.');
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    expect(payload.accessTokenExpiresAt).toBeNull();
  });
});
