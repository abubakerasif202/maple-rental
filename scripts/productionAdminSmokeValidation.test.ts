import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  validateLoginResponse,
  validateSmokeResponse,
} from './productionAdminSmokeValidation.mjs';

describe('production admin smoke response validation', () => {
  it('accepts a valid paginated response', () => {
    expect(
      validateSmokeResponse({
        endpoint: 'rentals',
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          items: [],
          page: 1,
          pageSize: 25,
          totalItems: 0,
          totalPages: 1,
        }),
      }).assertions,
    ).toContain('pagination metadata');
  });

  it('rejects missing pagination fields', () => {
    expect(() =>
      validateSmokeResponse({
        endpoint: 'applications',
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      }),
    ).toThrow('page must be a finite number');
  });

  it('rejects HTTP 500 responses without exposing the response body', () => {
    expect(() =>
      validateSmokeResponse({
        endpoint: 'financials',
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'private internal detail' }),
      }),
    ).toThrow('financials returned HTTP 500');
  });

  it('rejects malformed JSON and HTML responses', () => {
    expect(() =>
      validateSmokeResponse({
        endpoint: 'toll-notices',
        status: 200,
        contentType: 'text/html',
        body: '<html>private error</html>',
      }),
    ).toThrow('non-JSON');

    expect(() =>
      validateSmokeResponse({
        endpoint: 'toll-notices',
        status: 200,
        contentType: 'application/json',
        body: '{not-json',
      }),
    ).toThrow('malformed JSON');
  });

  it('rejects login failure and missing session cookies', () => {
    expect(() =>
      validateLoginResponse({
        status: 401,
        contentType: 'application/json',
        cookieJarText: '',
      }),
    ).toThrow('admin login failed');

    expect(() =>
      validateLoginResponse({
        status: 200,
        contentType: 'application/json',
        cookieJarText: '',
      }),
    ).toThrow('session cookie');
  });

  it('keeps temporary-cookie cleanup in a finally block', () => {
    const script = readFileSync(new URL('./verify-production-admin-smoke.ps1', import.meta.url), 'utf8');
    expect(script).toContain('finally');
    expect(script).toContain('Remove-Item -LiteralPath $sessionDirectory -Recurse -Force');
    expect(script).not.toMatch(/Write-Output.*(password|token|cookie)/i);
  });
});
