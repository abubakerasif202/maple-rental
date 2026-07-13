import type { QueryClient } from '@tanstack/react-query';

export const MAINTENANCE_RESET_QUERY_KEYS = [
  'applications',
  'approved-applications',
  'rentals',
  'operational-customers',
  'operational-invoices',
  'weekly-financials',
  'stats',
] as const;

export const invalidateMaintenanceResetQueries = async (queryClient: QueryClient) => {
  const results = await Promise.allSettled(
    MAINTENANCE_RESET_QUERY_KEYS.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey: [queryKey] }),
    ),
  );

  return results.every((result) => result.status === 'fulfilled');
};
