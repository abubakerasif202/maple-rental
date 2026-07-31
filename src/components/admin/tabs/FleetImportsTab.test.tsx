// @vitest-environment jsdom

import React from 'react';
import { FluentProvider } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mapleFluentTheme } from '../../../theme/mapleFluentTheme';
import FleetImportsTab from './FleetImportsTab';

const apiMocks = vi.hoisted(() => ({ fetchFleetImports: vi.fn() }));
vi.mock('../../../lib/fleetImportApi', () => ({
  applyFleetImport: vi.fn(),
  cancelFleetImport: vi.fn(),
  downloadFleetImportRejectedRows: vi.fn(),
  dryRunFleetImport: vi.fn(),
  fetchFleetImport: vi.fn(),
  fetchFleetImportAudit: vi.fn(),
  fetchFleetImportRows: vi.fn(),
  fetchFleetImports: apiMocks.fetchFleetImports,
  matchFleetImportRow: vi.fn(),
  rejectFleetImportRows: vi.fn(),
  revalidateFleetImportRow: vi.fn(),
  updateFleetImportRow: vi.fn(),
  uploadFleetImport: vi.fn(),
}));

const renderTab = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <FluentProvider theme={mapleFluentTheme}>
      <QueryClientProvider client={client}><FleetImportsTab /></QueryClientProvider>
    </FluentProvider>
  );
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('FleetImportsTab', () => {
  it('renders labelled upload and mobile-safe history controls', async () => {
    apiMocks.fetchFleetImports.mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0 });
    const { container } = renderTab();
    expect(await screen.findByLabelText('Fleet register file')).not.toBeNull();
    expect(screen.getByLabelText('Search import history')).not.toBeNull();
    expect(await screen.findByText('No fleet imports match this search.')).not.toBeNull();
    expect(container.querySelector('.overflow-x-auto')).toBeNull();
  });

  it('requests the next server-backed history page', async () => {
    apiMocks.fetchFleetImports.mockImplementation(({ page }: { page?: number }) => Promise.resolve({
      items: [{ id: `import-${page}`, original_filename: `fleet-${page}.xlsx`, snapshot_date: '2026-09-30', status: 'ready', total_rows: 51, created_at: '2026-09-30T00:00:00Z' }],
      page, pageSize: 25, total: 26,
    }));
    renderTab();
    expect(await screen.findByText('fleet-1.xlsx')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(apiMocks.fetchFleetImports).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, pageSize: 25 }), expect.any(AbortSignal)
    ));
  });
});
