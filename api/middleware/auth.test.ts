import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type express from 'express';

const ORIGINAL_ENV = { ...process.env };

const { mockCreateAuthClient } = vi.hoisted(() => ({
  mockCreateAuthClient: vi.fn(),
}));

vi.mock('../db/index.js', () => ({
  createAuthClient: mockCreateAuthClient,
}));

const buildResponse = () => {
  const response = {
    clearCookie: vi.fn(() => response),
    cookie: vi.fn(() => response),
    json: vi.fn(() => response),
    status: vi.fn(() => response),
  };

  return response as unknown as express.Response & {
    clearCookie: ReturnType<typeof vi.fn>;
    cookie: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
};

describe('admin auth cookie handling', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreateAuthClient.mockReset();
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

  it('uses strict cookies in production', async () => {
    const { createCookieOptions } = await import('./auth.js');
    expect(createCookieOptions()).toMatchObject({
      httpOnly: true,
      path: '/',
      sameSite: 'strict',
      secure: true,
    });
  });

  it('uses browser-storable cookies for local HTTP development', async () => {
    process.env.NODE_ENV = 'development';
    process.env.VITEST = 'false';
    vi.resetModules();

    const { createCookieOptions } = await import('./auth.js');
    expect(createCookieOptions()).toMatchObject({
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: false,
    });
  });

  it('uses secure SameSite=None cookies for HTTPS cross-site admin requests', async () => {
    process.env.NODE_ENV = 'development';
    process.env.VITEST = 'false';
    vi.resetModules();

    const { createCookieOptions } = await import('./auth.js');
    const request = {
      get: (header: string) => {
        const headers: Record<string, string> = {
          host: 'maple-rental.onrender.com',
          origin: 'https://admin.maplerentals.com.au',
          'x-forwarded-proto': 'https',
        };
        return headers[header.toLowerCase()] || undefined;
      },
      secure: false,
    } as unknown as express.Request;

    expect(createCookieOptions(request)).toMatchObject({
      httpOnly: true,
      path: '/',
      sameSite: 'none',
      secure: true,
    });
  });

  it('encrypts Supabase admin session cookies instead of exposing tokens', async () => {
    const { createSupabaseAdminSessionToken } = await import('./auth.js');
    const token = createSupabaseAdminSessionToken({
      accessToken: 'access-token',
      accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
      email: 'admin@maplerentals.com.au',
      refreshToken: 'refresh-token',
    });

    expect(token).toMatch(/^enc\.v1\./);
    expect(token).not.toContain('access-token');
    expect(token).not.toContain('refresh-token');

    const encodedPayload = token.split('.')[0];
    expect(() =>
      JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
    ).toThrow();
  });

  it('clears all historical cookie variants on logout', async () => {
    const { clearAdminSessionCookie } = await import('./auth.js');
    const response = buildResponse();

    clearAdminSessionCookie({} as express.Request, response);

    expect(response.clearCookie).toHaveBeenCalledTimes(3);
    expect(response.clearCookie).toHaveBeenNthCalledWith(
      1,
      'admin_token',
      expect.objectContaining({ sameSite: 'none', secure: true, path: '/' })
    );
    expect(response.clearCookie).toHaveBeenNthCalledWith(
      2,
      'admin_token',
      expect.objectContaining({ sameSite: 'strict', secure: true, path: '/' })
    );
    expect(response.clearCookie).toHaveBeenNthCalledWith(
      3,
      'admin_token',
      expect.objectContaining({ sameSite: 'strict', secure: true, path: '/' })
    );
  });

  it('refreshes Supabase admin sessions with the same cookie options as login', async () => {
    const mockRefreshSession = vi.fn().mockResolvedValue({
      data: {
        session: {
          access_token: 'access-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: 'refresh-token',
        },
        user: { email: 'admin@maplerentals.com.au' },
      },
      error: null,
    });
    const mockGetUser = vi.fn();
    const mockSignInWithPassword = vi.fn();

    const authClient = {
      auth: {
        getUser: mockGetUser,
        refreshSession: mockRefreshSession,
        signInWithPassword: mockSignInWithPassword,
      },
    };

    mockCreateAuthClient.mockReturnValue(authClient);

    const { authenticateAdmin, createCookieOptions, createSupabaseAdminSessionToken } =
      await import('./auth.js');

    const response = buildResponse();
    const request = {
      cookies: { admin_token: createSupabaseAdminSessionToken({
        accessToken: 'access-token',
        accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 10,
        email: 'admin@maplerentals.com.au',
        refreshToken: 'refresh-token',
      }) },
      get: (header: string) => {
        const headers: Record<string, string> = {
          origin: 'https://www.maplerentals.com.au',
          referer: 'https://www.maplerentals.com.au/admin/login',
        };
        return headers[header.toLowerCase()] || undefined;
      },
      headers: { authorization: undefined },
      method: 'POST',
      secure: true,
    } as unknown as express.Request;

    await authenticateAdmin(request, response, vi.fn());

    expect(mockRefreshSession).toHaveBeenCalledWith({
      refresh_token: 'refresh-token',
    });
    expect(response.cookie).toHaveBeenCalledWith(
      'admin_token',
      expect.any(String),
      createCookieOptions(request)
    );
  });
});
