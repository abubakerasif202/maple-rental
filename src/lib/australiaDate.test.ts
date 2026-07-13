import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTodayInAustralia } from '../../shared/applicationSubmission';

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
