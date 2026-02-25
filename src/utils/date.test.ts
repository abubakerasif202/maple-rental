import { expect, test, describe } from 'bun:test';
import { getDateDiffInDays } from './date.ts';

describe('getDateDiffInDays', () => {
  test('should return correct difference for valid dates', () => {
    const start = '2023-10-01';
    const end = '2023-10-05';
    // 1st to 5th is 4 days difference (end - start)
    expect(getDateDiffInDays(start, end)).toBe(4);
  });

  test('should handle month crossing', () => {
    const start = '2023-10-31';
    const end = '2023-11-02';
    // 31st Oct to 2nd Nov is 2 days
    expect(getDateDiffInDays(start, end)).toBe(2);
  });

  test('should return null if end date is before start date', () => {
    const start = '2023-10-05';
    const end = '2023-10-01';
    expect(getDateDiffInDays(start, end)).toBeNull();
  });

  test('should return null if dates are the same', () => {
    const start = '2023-10-01';
    const end = '2023-10-01';
    expect(getDateDiffInDays(start, end)).toBeNull();
  });

  test('should return null for invalid date strings', () => {
    expect(getDateDiffInDays('invalid', '2023-10-05')).toBeNull();
    expect(getDateDiffInDays('2023-10-01', 'invalid')).toBeNull();
    expect(getDateDiffInDays('invalid', 'invalid')).toBeNull();
  });
});
