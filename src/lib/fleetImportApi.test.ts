import { afterEach, describe, expect, it, vi } from 'vitest';

import api from './api';
import { fetchFleetImports } from './fleetImportApi';

const validSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  original_filename: 'fleet.xlsx',
  snapshot_date: '2026-09-30',
  status: 'ready',
  total_rows: 1,
  valid_rows: 1,
  review_rows: 0,
  applied_rows: 0,
  rejected_rows: 0,
  uploaded_by: 'admin',
  created_at: '2026-09-30T00:00:00Z',
};

afterEach(() => vi.restoreAllMocks());

describe('fleet import API response validation', () => {
  it('returns a valid paginated fleet-import response', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { items: [validSummary], page: 1, pageSize: 25, total: 1 },
    });

    await expect(fetchFleetImports({ page: 1 })).resolves.toEqual({
      items: [validSummary], page: 1, pageSize: 25, total: 1,
    });
  });

  it('rejects an invalid fleet-import response', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { items: [{ ...validSummary, total_rows: '1' }], page: 1, pageSize: 25, total: 1 },
    });

    await expect(fetchFleetImports({ page: 1 })).rejects.toThrow();
  });
});
