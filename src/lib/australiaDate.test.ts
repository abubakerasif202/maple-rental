import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTodayInAustralia } from '../../shared/applicationSubmission';
import { formatAustraliaDate, getAustraliaDateSortValue } from './australiaDate';

describe('getTodayInAustralia', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['2026-01-01T13:30:00.000Z', '2026-01-02'],
    ['2026-06-01T14:30:00.000Z', '2026-06-02'],
  ])('uses the Sydney calendar date at UTC boundary %s', (instant, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(instant));

    expect(getTodayInAustralia()).toBe(expected);
  });
});

describe('Australian business date formatting', () => {
  it.each([
    ['2026-04-05', '05/04/2026'],
    ['2026-10-04', '04/10/2026'],
  ])('preserves the stored date-only value across Sydney DST boundaries', (value, expected) => {
    expect(formatAustraliaDate(value)).toBe(expected);
  });

  it('renders exact timestamps at the Australia/Sydney presentation boundary', () => {
    expect(formatAustraliaDate('2026-08-20T15:30:00.000Z')).toBe('21/08/2026');
  });

  it('sorts ISO date-only values chronologically without local-time parsing', () => {
    expect(getAustraliaDateSortValue('2026-08-21')).toBeGreaterThan(
      getAustraliaDateSortValue('2026-08-20'),
    );
  });
});
