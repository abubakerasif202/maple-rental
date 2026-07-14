import { describe, expect, it } from 'vitest';

import { sanitizeOriginalUrl } from './requestLogger.js';

describe('sanitizeOriginalUrl', () => {
  it('redacts customer searches, application ids, and Stripe ids', () => {
    const result = sanitizeOriginalUrl(
      '/api/stripe/checkout-sessions/cs_live_sensitive?application_id=11111111-1111-4111-8111-111111111111&search=driver%40example.com&page=2'
    );

    expect(result).not.toContain('cs_live_sensitive');
    expect(result).not.toContain('11111111-1111-4111-8111-111111111111');
    expect(result).not.toContain('driver%40example.com');
    expect(result).toContain('page=2');
  });

  it('preserves non-sensitive route and pagination context', () => {
    expect(sanitizeOriginalUrl('/api/applications?page=3&pageSize=25')).toBe(
      '/api/applications?page=3&pageSize=25'
    );
  });

  it('redacts percent-encoded Stripe path identifiers', () => {
    const result = sanitizeOriginalUrl(
      '/api/stripe/checkout-sessions/cs%5Flive%5Fsensitive'
    );

    expect(result).toBe('/api/stripe/checkout-sessions/[REDACTED]');
  });
});
