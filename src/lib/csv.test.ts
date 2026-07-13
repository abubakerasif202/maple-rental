import { describe, expect, it } from 'vitest';
import { encodeCsvCell, encodeCsvRows } from './csv';

describe('encodeCsvCell', () => {
  it.each(['=SUM(A1:A2)', '+1+1', '-2+3', '@command', ' =SUM(A1:A2)', '\t@command', '\n+1'])(
    'neutralizes spreadsheet formula prefix %j',
    (value) => {
      expect(encodeCsvCell(value)).toBe(`"'${value}"`);
    },
  );

  it('escapes quotes and normalizes nullish values', () => {
    expect(encodeCsvCell('Maple "Rentals"')).toBe('"Maple ""Rentals"""');
    expect(encodeCsvCell(null)).toBe('""');
  });

  it('serializes rows with consistent cell encoding', () => {
    expect(encodeCsvRows([['Name', 'Value'], ['Driver', '=2+2']])).toBe(
      '"Name","Value"\n"Driver","\'=2+2"',
    );
  });
});
