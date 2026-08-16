import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import ApplicationsTab from './ApplicationsTab';
import RentalsTab from './RentalsTab';

describe('admin tab error states', () => {
  it('renders the applications error state when the API fails', () => {
    const markup = renderToStaticMarkup(
      <ApplicationsTab
        applicationSearch=""
        applications={[]}
        applicationsError="Failed to fetch applications"
        applicationsPage={1}
        applicationsPageSize={25}
        applicationsTotalItems={0}
        applicationsTotalPages={1}
        clearApplicationStatuses={vi.fn()}
        isFetchingApplications={false}
        isLoadingApplications={false}
        onApplicationPageChange={vi.fn()}
        onApplicationPageSizeChange={vi.fn()}
        setApplicationSearch={vi.fn()}
        setSelectedApplication={vi.fn()}
        statusFilters={[]}
        toggleApplicationStatus={vi.fn()}
      />,
    );

    expect(markup).toContain('Failed to fetch applications');
    expect(markup).not.toContain('Loading driver applications...');
  });

  it('renders the rentals error state when the API fails', () => {
    const markup = renderToStaticMarkup(
      <RentalsTab
        isFetchingRentals={false}
        isLoadingRentals={false}
        onCancelSubscription={vi.fn()}
        onCreateTollNotice={vi.fn()}
        onRentalPageChange={vi.fn()}
        onRentalPageSizeChange={vi.fn()}
        pendingActivations={[]}
        rentalSearch=""
        rentals={[]}
        rentalsError="Failed to fetch rentals"
        rentalsPage={1}
        rentalsPageSize={25}
        rentalsTotalItems={0}
        rentalsTotalPages={1}
        setRentalSearch={vi.fn()}
      />,
    );

    expect(markup).toContain('Failed to fetch rentals');
    expect(markup).not.toContain('Loading active rentals...');
  });
});
