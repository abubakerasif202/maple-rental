import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type express from 'express';
import { createAuthClient } from '../db/index.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../db/index.js', () => ({
  createAuthClient: vi.fn(),
}));

const buildRequest = ({
  host,
  origin,
}: {
  host: string;
  origin: string;
}) =>
  ({
    cookies: { admin_token: 'signed-cookie' },
    get: (header: string) => {
      const headers: Record<string, string> = {
        host,
        origin,
        'x-forwarded-proto': 'https',
      };
      return headers[header.toLowerCase()] || undefined;
    },
    method: 'POST',
    secure: false,
  }) as unknown as express.Request;

const buildResponse = () => {
  const response = {
    json: vi.fn(() => response),
    status: vi.fn(() => response),
  };

  return response as unknown as express.Response & {
    json: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
};

const buildBearerRequest = (token = 'valid-token') =>
  ({
    cookies: {},
    get: vi.fn(),
    headers: { authorization: `Bearer ${token}` },
    method: 'GET',
  }) as unknown as express.Request;

describe('production trusted admin write origins', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      ADMIN_EMAIL: 'admin@maplerentals.com.au',
      APP_URL: 'https://www.maplerentals.com.au',
      JWT_SECRET: 'x'.repeat(32),
      NODE_ENV: 'production',
      VITEST: 'false',
    };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('allows a configured production origin', async () => {
    const { requireTrustedAdminWriteOrigin } = await import('./auth.js');
    const response = buildResponse();
    const next = vi.fn();

    requireTrustedAdminWriteOrigin(
      buildRequest({
        host: 'maple-rental.onrender.com',
        origin: 'https://www.maplerentals.com.au',
      }),
      response,
      next
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('rejects a random production origin even when it matches the request host', async () => {
    const { requireTrustedAdminWriteOrigin } = await import('./auth.js');
    const response = buildResponse();
    const next = vi.fn();

    requireTrustedAdminWriteOrigin(
      buildRequest({
        host: 'evil.example',
        origin: 'https://evil.example',
      }),
      response,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Cross-site admin request rejected',
    });
  });

  it('returns forbidden, not invalid-token, for a valid non-admin bearer identity', async () => {
    vi.mocked(createAuthClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { email: 'other@example.com', id: 'user-2' } },
          error: null,
        }),
      },
    } as never);
    const { authenticateAdmin } = await import('./auth.js');
    const response = buildResponse();
    const next = vi.fn();
    const request = {
      cookies: {},
      get: vi.fn(),
      headers: { authorization: 'Bearer valid-non-admin-token' },
      method: 'GET',
    } as unknown as express.Request;

    await authenticateAdmin(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Access denied: Unauthorized email',
    });
  });

  it('allows a valid trusted app_metadata admin entitlement', async () => {
    vi.mocked(createAuthClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              app_metadata: { maple_role: 'admin' },
              email: 'entitled@example.com',
              id: 'user-entitled',
            },
          },
          error: null,
        }),
      },
    } as never);
    const { authenticateAdmin } = await import('./auth.js');
    const response = buildResponse();
    const next = vi.fn();

    await authenticateAdmin(buildBearerRequest(), response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('denies a valid user without an entitlement in entitlement mode', async () => {
    process.env.ADMIN_AUTHORIZATION_MODE = 'entitlement';
    vi.resetModules();
    const { createAuthClient: reloadedCreateAuthClient } = await import('../db/index.js');
    vi.mocked(reloadedCreateAuthClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { app_metadata: {}, email: 'admin@maplerentals.com.au' } },
          error: null,
        }),
      },
    } as never);
    const { authenticateAdmin } = await import('./auth.js');
    const response = buildResponse();

    await authenticateAdmin(buildBearerRequest(), response, vi.fn());

    expect(response.status).toHaveBeenCalledWith(403);
  });

  it('ignores a forged user_metadata admin role', async () => {
    process.env.ADMIN_AUTHORIZATION_MODE = 'entitlement';
    vi.resetModules();
    const { authorizeAdminIdentity } = await import('./auth.js');

    expect(authorizeAdminIdentity({
      app_metadata: {},
      email: 'attacker@example.com',
      user_metadata: { maple_role: 'admin', role: 'admin' },
    })).toMatchObject({ allowed: false });
  });

  it('honours explicit revocation ahead of the configured-email fallback', async () => {
    const { authorizeAdminIdentity } = await import('./auth.js');

    expect(authorizeAdminIdentity({
      app_metadata: { maple_role: 'revoked' },
      email: 'admin@maplerentals.com.au',
    })).toMatchObject({ allowed: false, revoked: true });
  });

  it('denies a missing role outside the legacy configured-email path', async () => {
    const { authorizeAdminIdentity } = await import('./auth.js');

    expect(authorizeAdminIdentity({
      app_metadata: {},
      email: 'other@example.com',
    })).toMatchObject({ allowed: false });
  });

  it('preserves the configured-email migration path in hybrid mode', async () => {
    const { authorizeAdminIdentity } = await import('./auth.js');

    expect(authorizeAdminIdentity({
      app_metadata: {},
      email: 'admin@maplerentals.com.au',
    })).toEqual({ allowed: true, source: 'legacy_email' });
  });

  it.each([
    ['expired', { message: 'JWT expired' }],
    ['invalid', { message: 'invalid JWT' }],
  ])('rejects an %s bearer token as invalid credentials', async (_kind, error) => {
    vi.mocked(createAuthClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error }),
      },
    } as never);
    const { authenticateAdmin } = await import('./auth.js');
    const response = buildResponse();

    await authenticateAdmin(buildBearerRequest(`${_kind}-token`), response, vi.fn());

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({ error: 'Invalid token' });
  });
});
