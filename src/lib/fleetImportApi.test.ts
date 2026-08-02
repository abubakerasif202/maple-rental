import { afterEach, describe, expect, it, vi } from 'vitest';

import api from './api';
import { fetchFleetImportRows, fetchFleetImports } from './fleetImportApi';

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
const validRow = {
  id: '22222222-2222-4222-8222-222222222222',
  source_row_number: 2,
  driver_name_original: 'Sam Driver',
  vehicle_registration_original: 'ABC123',
  make_original: 'Toyota',
  model_original: 'Camry',
  weekly_rate: '250.00',
  snapshot_date: '2026-09-30',
  source_notes: null,
  validation_status: 'ready',
  validation_errors: [],
  validation_warnings: [],
  matched_rental_id: '123',
  existing_registration: 'ABC123',
  existing_weekly_rate: '240.00',
  apply_status: 'pending',
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

  it('normalizes positive BIGINT rental identifiers and preserves null', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        items: [validRow, { ...validRow, id: '33333333-3333-4333-8333-333333333333', matched_rental_id: null }],
        page: 1,
        pageSize: 25,
        total: 2,
      },
    });

    await expect(fetchFleetImportRows(validSummary.id, { page: 1 })).resolves.toMatchObject({
      items: [
        { matched_rental_id: 123 },
        { matched_rental_id: null },
      ],
    });
  });

  it.each([
    '',
    '   ',
    'not-an-id',
    '-1',
    '0',
    '1.5',
    '9007199254740992',
    -1,
    0,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects invalid matched rental identifier %j', async (matchedRentalId) => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        items: [{ ...validRow, matched_rental_id: matchedRentalId }],
        page: 1,
        pageSize: 25,
        total: 1,
      },
    });

    await expect(fetchFleetImportRows(validSummary.id, { page: 1 })).rejects.toThrow();
  });
});
