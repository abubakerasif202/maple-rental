import { describe, expect, it } from 'vitest';

import {
  applyDataTableFilters,
  paginateDataTableRows,
  shouldApplyDataTableClientTransforms,
  sortDataTableRows,
  toggleSelectedRows,
} from './dataTableUtils.js';

interface TestRow {
  amount: number;
  id: string;
  name: string;
  status: 'Active' | 'Pending' | 'Paid';
}

const rows: TestRow[] = [
  { amount: 450, id: 'rental-3', name: 'Zara Holt', status: 'Active' },
  { amount: 250, id: 'rental-1', name: 'Aaron Stone', status: 'Pending' },
  { amount: 900, id: 'rental-2', name: 'Mia Chen', status: 'Paid' },
];

describe('data table utilities', () => {
  it('disables page-local filters and sorting for server pagination', () => {
    expect(shouldApplyDataTableClientTransforms(true)).toBe(false);
    expect(shouldApplyDataTableClientTransforms(false)).toBe(true);
  });

  it('sorts rows by the requested column and direction', () => {
    const sorted = sortDataTableRows(rows, {
      columnId: 'amount',
      direction: 'desc',
      getValue: (row) => row.amount,
    });

    expect(sorted.map((row) => row.id)).toEqual(['rental-2', 'rental-3', 'rental-1']);
    expect(rows.map((row) => row.id)).toEqual(['rental-3', 'rental-1', 'rental-2']);
  });

  it('filters rows when one or more values are selected for a filter group', () => {
    const filtered = applyDataTableFilters(rows, [
      {
        getValue: (row) => row.status,
        selectedValues: ['Active', 'Paid'],
      },
    ]);

    expect(filtered.map((row) => row.id)).toEqual(['rental-3', 'rental-2']);
  });

  it('paginates rows with clamped page numbers and total metadata', () => {
    const page = paginateDataTableRows(rows, { page: 3, pageSize: 2 });

    expect(page.page).toBe(2);
    expect(page.totalPages).toBe(2);
    expect(page.rows.map((row) => row.id)).toEqual(['rental-2']);
  });

  it('toggles all visible row ids without dropping selected ids from other pages', () => {
    const selected = toggleSelectedRows(new Set(['outside-page']), ['rental-1', 'rental-2']);
    expect([...selected].sort()).toEqual(['outside-page', 'rental-1', 'rental-2']);

    const deselected = toggleSelectedRows(selected, ['rental-1', 'rental-2']);
    expect([...deselected]).toEqual(['outside-page']);
  });
});
