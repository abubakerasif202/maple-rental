import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type express from 'express';

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

describe('production trusted admin write origins', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      APP_URL: 'https://www.galarentals.com.au',
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
        origin: 'https://www.galarentals.com.au',
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
});
