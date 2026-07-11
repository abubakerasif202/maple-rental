import { describe, expect, it } from 'vitest';

import type { RequestLike } from './frontendRouting.js';

import { shouldServeSpaEntry } from './frontendRouting.js';

const createRequest = ({
  accept = 'text/html,application/xhtml+xml',
  method = 'GET',
  path,
}: {
  accept?: string;
  method?: string;
  path: string;
}) =>
  ({
    method,
    path,
    get: (headerName: string) =>
      headerName.toLowerCase() === 'accept' ? accept : undefined,
  }) satisfies RequestLike;

describe('shouldServeSpaEntry', () => {
  it('allows known client routes', () => {
    expect(shouldServeSpaEntry(createRequest({ path: '/' }))).toBe(true);
    expect(shouldServeSpaEntry(createRequest({ path: '/cars/1' }))).toBe(true);
    expect(
      shouldServeSpaEntry(createRequest({ path: '/admin/dashboard' }))
    ).toBe(true);
    expect(
      shouldServeSpaEntry(createRequest({ path: '/admin/toll-notices' }))
    ).toBe(true);
    expect(
      shouldServeSpaEntry(createRequest({ path: '/admin/agreements' }))
    ).toBe(true);
    expect(shouldServeSpaEntry(createRequest({ path: '/missing-page' }))).toBe(true);
  });

  it('allows root path regardless of accept header', () => {
    expect(
      shouldServeSpaEntry(
        createRequest({ accept: 'application/json', path: '/' })
      )
    ).toBe(true);
  });

  it('rejects scanner-style secret and debug probes', () => {
    expect(shouldServeSpaEntry(createRequest({ path: '/.env' }))).toBe(false);
    expect(
      shouldServeSpaEntry(createRequest({ path: '/.git/config' }))
    ).toBe(false);
    expect(
      shouldServeSpaEntry(createRequest({ path: '/wp-config.php' }))
    ).toBe(false);
    expect(shouldServeSpaEntry(createRequest({ path: '/_debugbar/' }))).toBe(
      false
    );
  });

  it('rejects API routes and non-html fetches', () => {
    expect(
      shouldServeSpaEntry(createRequest({ path: '/api/health' }))
    ).toBe(false);
    expect(
      shouldServeSpaEntry(
        createRequest({ accept: 'application/json', path: '/pricing' })
      )
    ).toBe(false);
  });
});
