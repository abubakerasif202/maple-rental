import { describe, expect, it } from 'vitest';

import type { RequestLike } from './frontendRouting.js';

import { getSpaHtmlFile, isKnownSpaRoute, shouldServeSpaEntry } from './frontendRouting.js';

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
    const adminRoutes = [
      '/admin',
      '/admin/dashboard',
      '/admin/applications',
      '/admin/rentals',
      '/admin/customers',
      '/admin/invoices',
      '/admin/financials',
      '/admin/agreements',
      '/admin/toll-notices',
      '/admin/maintenance',
      '/admin/fleet-imports',
    ];

    expect(shouldServeSpaEntry(createRequest({ path: '/' }))).toBe(true);
    expect(shouldServeSpaEntry(createRequest({ path: '/cars/1' }))).toBe(true);
    adminRoutes.forEach((path) => {
      expect(shouldServeSpaEntry(createRequest({ path }))).toBe(true);
    });
    expect(shouldServeSpaEntry(createRequest({ path: '/missing-page' }))).toBe(true);
    expect(isKnownSpaRoute('/missing-page')).toBe(false);
    expect(isKnownSpaRoute('/pricing')).toBe(true);
  });

  it('selects route-specific delivered metadata HTML for public conversion routes', () => {
    expect(getSpaHtmlFile('/')).toBe('index.html');
    expect(getSpaHtmlFile('/pricing')).toBe('pricing/index.html');
    expect(getSpaHtmlFile('/pricing/')).toBe('pricing/index.html');
    expect(getSpaHtmlFile('/apply')).toBe('apply/index.html');
    expect(getSpaHtmlFile('/admin')).toBe('index.html');
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
