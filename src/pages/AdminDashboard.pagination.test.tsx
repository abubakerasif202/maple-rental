// @vitest-environment jsdom

import React from 'react';
import { FluentProvider, Toaster } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mapleFluentTheme } from '../theme/mapleFluentTheme';
import AdminDashboard from './AdminDashboard';

const apiMocks = vi.hoisted(() => ({
  fetchApplications: vi.fn(),
  fetchDashboardSummary: vi.fn(),
  fetchOperationalInvoices: vi.fn(),
  fetchRentals: vi.fn(),
}));

vi.mock('../lib/api', () => apiMocks);

vi.mock('../components/admin/Sidebar', () => ({
  default: ({ setActiveTab }: { setActiveTab: (tab: string) => void }) => (
    <nav>
      <button type="button" onClick={() => setActiveTab('applications')}>Applications</button>
      <button type="button" onClick={() => setActiveTab('rentals')}>Rentals</button>
      <button type="button" onClick={() => setActiveTab('invoices')}>Invoices</button>
    </nav>
  ),
}));

vi.mock('../components/admin/tabs/OverviewTab', () => ({
  default: () => <div>Overview</div>,
}));

vi.mock('../components/admin/tabs/ApplicationsTab', () => ({
  default: ({
    applicationsPage,
    applicationsTotalPages,
    onApplicationPageChange,
  }: {
    applicationsPage: number;
    applicationsTotalPages: number;
    onApplicationPageChange: (page: number) => void;
  }) => (
    <section>
      <div data-testid="applications-page">
        Page {applicationsPage} of {applicationsTotalPages}
      </div>
      <button type="button" onClick={() => onApplicationPageChange(2)}>
        Request applications page 2
      </button>
    </section>
  ),
}));

vi.mock('../components/admin/tabs/RentalsTab', () => ({
  default: ({
    onRentalPageChange,
    rentalsPage,
    rentalsTotalPages,
  }: {
    onRentalPageChange: (page: number) => void;
    rentalsPage: number;
    rentalsTotalPages: number;
  }) => (
    <section>
      <div data-testid="rentals-page">
        Page {rentalsPage} of {rentalsTotalPages}
      </div>
      <button type="button" onClick={() => onRentalPageChange(2)}>
        Request rentals page 2
      </button>
    </section>
  ),
}));

vi.mock('../components/admin/tabs/InvoicesTab', () => ({
  default: ({
    invoiceCurrentPage,
    invoiceTotalPages,
    setInvoicePage,
  }: {
    invoiceCurrentPage: number;
    invoiceTotalPages: number;
    setInvoicePage: React.Dispatch<React.SetStateAction<number>>;
  }) => (
    <section>
      <div data-testid="invoices-page">
        Page {invoiceCurrentPage} of {invoiceTotalPages}
      </div>
      <button type="button" onClick={() => setInvoicePage(2)}>
        Request invoices page 2
      </button>
    </section>
  ),
}));

const pageDataset = (page: number, totalPages: number) => ({
  available: true,
  items: [],
  page,
  pageSize: 25,
  total: totalPages,
  totalItems: totalPages,
  totalPages,
});

const renderDashboard = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 5 * 60 * 1000,
      },
    },
  });

  render(
    <FluentProvider theme={mapleFluentTheme}>
      <Toaster toasterId="maple-admin-toaster" />
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/dashboard']}>
          <AdminDashboard />
        </MemoryRouter>
      </QueryClientProvider>
    </FluentProvider>,
  );

  return queryClient;
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Admin Dashboard server-corrected pagination', () => {
  it('reconciles an invalid Applications page without a request loop', async () => {
    let resolvePageTwo: (dataset: ReturnType<typeof pageDataset>) => void = () => undefined;
    const pageTwoResponse = new Promise<ReturnType<typeof pageDataset>>((resolve) => {
      resolvePageTwo = resolve;
    });
    apiMocks.fetchDashboardSummary.mockResolvedValue({});
    apiMocks.fetchApplications.mockImplementation(({ page }: { page?: number }) =>
      page === 2 ? pageTwoResponse : Promise.resolve(pageDataset(1, 2)),
    );
    const queryClient = renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: 'Applications' }));
    await screen.findByText('Page 1 of 2');

    fireEvent.click(screen.getByRole('button', { name: 'Request applications page 2' }));

    await waitFor(() => expect(apiMocks.fetchApplications).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('applications-page').textContent).toBe('Page 2 of 2');
    await act(async () => resolvePageTwo(pageDataset(1, 1)));

    await waitFor(() => expect(screen.getByTestId('applications-page').textContent).toBe('Page 1 of 1'));
    expect(screen.getByTestId('applications-page').textContent).not.toBe('Page 2 of 1');
    expect(apiMocks.fetchApplications).toHaveBeenCalledTimes(2);
    expect(apiMocks.fetchApplications.mock.calls.map(([params]) => params.page)).toEqual([1, 2]);
    expect(queryClient.getQueryData(['applications', '', 1, 25, ''])).toMatchObject({
      page: 1,
      totalPages: 1,
    });
  });

  it('reconciles an invalid Rentals page without a request loop', async () => {
    apiMocks.fetchDashboardSummary.mockResolvedValue({});
    apiMocks.fetchRentals.mockImplementation(({ page }: { page?: number }) =>
      Promise.resolve(page === 2 ? pageDataset(1, 1) : pageDataset(1, 2)),
    );
    const queryClient = renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: 'Rentals' }));
    await screen.findByText('Page 1 of 2');

    fireEvent.click(screen.getByRole('button', { name: 'Request rentals page 2' }));

    await waitFor(() => expect(screen.getByTestId('rentals-page').textContent).toBe('Page 1 of 1'));
    expect(screen.getByTestId('rentals-page').textContent).not.toBe('Page 2 of 1');
    expect(apiMocks.fetchRentals).toHaveBeenCalledTimes(2);
    expect(apiMocks.fetchRentals.mock.calls.map(([params]) => params.page)).toEqual([1, 2]);
    expect(queryClient.getQueryData(['rentals', '', 1, 25])).toMatchObject({
      page: 1,
      totalPages: 1,
    });
  });

  it('continues to render the server-returned Invoice page', async () => {
    apiMocks.fetchDashboardSummary.mockResolvedValue({});
    apiMocks.fetchOperationalInvoices.mockImplementation(({ page }: { page?: number }) =>
      Promise.resolve(page === 2 ? pageDataset(1, 1) : pageDataset(1, 2)),
    );
    renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: 'Invoices' }));
    await screen.findByText('Page 1 of 2');

    fireEvent.click(screen.getByRole('button', { name: 'Request invoices page 2' }));

    await waitFor(() => expect(screen.getByTestId('invoices-page').textContent).toBe('Page 1 of 1'));
    expect(screen.getByTestId('invoices-page').textContent).not.toBe('Page 2 of 1');
    expect(apiMocks.fetchOperationalInvoices).toHaveBeenCalledTimes(2);
    expect(apiMocks.fetchOperationalInvoices.mock.calls.map(([params]) => params.page)).toEqual([1, 2]);
  });
});
