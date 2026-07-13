import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  invalidateMaintenanceResetQueries,
  MAINTENANCE_RESET_QUERY_KEYS,
} from './maintenanceResetUtils';

describe('invalidateMaintenanceResetQueries', () => {
  it('invalidates every dashboard dataset affected by an imported-data reset', async () => {
    const queryClient = new QueryClient();

    MAINTENANCE_RESET_QUERY_KEYS.forEach((queryKey) => {
      queryClient.setQueryData([queryKey, 'page-1'], { loaded: true });
    });

    await expect(invalidateMaintenanceResetQueries(queryClient)).resolves.toBe(true);

    MAINTENANCE_RESET_QUERY_KEYS.forEach((queryKey) => {
      expect(queryClient.getQueryState([queryKey, 'page-1'])?.isInvalidated).toBe(true);
    });
  });

  it('reports a partial cache refresh without throwing after a completed reset', async () => {
    const queryClient = {
      invalidateQueries: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Refresh failed'))
        .mockResolvedValue(undefined),
    } as unknown as QueryClient;

    await expect(invalidateMaintenanceResetQueries(queryClient)).resolves.toBe(false);
  });
});
