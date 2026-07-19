import { describe, expect, it } from 'vitest';

import {
  buildPerformanceReport,
  categorizePerformanceRoute,
} from './performanceMetrics';

describe('performance metrics', () => {
  it('categorizes routes without retaining identifiers or query data', () => {
    expect(categorizePerformanceRoute('/checkout/private-token')).toBe('checkout');
    expect(categorizePerformanceRoute('/admin/applications/private-id')).toBe('admin');
    expect(categorizePerformanceRoute('/fleet')).toBe('other');
  });

  it('deduplicates metrics and rejects values outside bounded ranges', () => {
    expect(buildPerformanceReport('/apply?email=private@example.com', [
      { name: 'lcp', value: 1800 },
      { name: 'lcp', value: 1700 },
      { name: 'cls', value: -1 },
      { name: 'ttfb', value: 250 },
    ])).toEqual({
      route: 'apply',
      metrics: [
        { name: 'lcp', value: 1700 },
        { name: 'ttfb', value: 250 },
      ],
    });
  });
});
