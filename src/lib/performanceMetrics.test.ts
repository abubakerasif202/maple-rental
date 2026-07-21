import { describe, expect, it } from 'vitest';

import {
  buildPerformanceReport,
  categorizePerformanceRoute,
  createClsSessionWindowTracker,
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

  it('reports the largest CLS session window instead of the lifetime sum', () => {
    const track = createClsSessionWindowTracker();

    expect(track({ startTime: 100, value: 0.08 })).toBeCloseTo(0.08);
    expect(track({ startTime: 700, value: 0.04 })).toBeCloseTo(0.12);
    expect(track({ startTime: 1_800, value: 0.07 })).toBeCloseTo(0.12);
    expect(track({ startTime: 2_200, value: 0.03 })).toBeCloseTo(0.12);
  });

  it('caps a continuous CLS session window at five seconds', () => {
    const track = createClsSessionWindowTracker();

    for (const startTime of [0, 900, 1_800, 2_700, 3_600, 4_500]) {
      track({ startTime, value: 0.02 });
    }

    expect(track({ startTime: 5_400, value: 0.2 })).toBeCloseTo(0.2);
  });
});
