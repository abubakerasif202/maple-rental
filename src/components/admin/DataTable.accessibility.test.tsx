// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DataTable from './DataTable';

const rows = [
  { id: '2', name: 'Beta' },
  { id: '1', name: 'Alpha' },
];

const renderTable = () =>
  render(
    <DataTable
      columns={[{ id: 'name', header: 'Name', accessor: (row) => row.name }]}
      emptyState={{ title: 'No rows', description: 'Nothing to display' }}
      getRowId={(row) => row.id}
      pagination={{
        mode: 'server',
        onPageChange: vi.fn(),
        page: 2,
        pageSize: 1,
        totalItems: 3,
        totalPages: 3,
      }}
      rows={rows}
    />,
  );

const renderSortableTable = () =>
  render(
    <DataTable
      columns={[{ id: 'name', header: 'Name', accessor: (row) => row.name }]}
      emptyState={{ title: 'No rows', description: 'Nothing to display' }}
      getRowId={(row) => row.id}
      rows={rows}
    />,
  );

describe('DataTable accessibility', () => {
  afterEach(cleanup);

  it('exposes sortable column direction', () => {
    renderSortableTable();
    const header = screen.getByRole('columnheader', { name: 'Name' });

    expect(header.getAttribute('aria-sort')).toBe('none');
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Name' }));
    expect(header.getAttribute('aria-sort')).toBe('ascending');
  });

  it('identifies and announces the current page', () => {
    renderTable();

    expect(screen.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('status').textContent).toContain('Page 2 of 3');
    expect(screen.getByRole('navigation', { name: 'Table pagination' })).toBeTruthy();
  });
});
