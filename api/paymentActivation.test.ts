import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSchemaCompat = vi.hoisted(() => vi.fn());
const mockHasDirectDatabaseConnection = vi.hoisted(() => vi.fn());
const mockWithPostgresAdvisoryLock = vi.hoisted(() => vi.fn());

vi.mock('./schemaCompat.js', async () => {
  const actual = await vi.importActual<typeof import('./schemaCompat.js')>(
    './schemaCompat.js'
  );

  return {
    ...actual,
    getSchemaCompat: mockGetSchemaCompat,
  };
});

vi.mock('./db/postgres.js', () => ({
  hasDirectDatabaseConnection: mockHasDirectDatabaseConnection,
  withPostgresAdvisoryLock: mockWithPostgresAdvisoryLock,
  withPostgresTransaction: vi.fn(),
}));

import {
  buildLockedApplicationSelectSql,
  isPaymentRecordingStatus,
  withVehicleCheckoutProcessingLock,
} from './paymentActivation.js';

describe('buildLockedApplicationSelectSql', () => {
  beforeEach(() => {
    mockGetSchemaCompat.mockReset();
    mockHasDirectDatabaseConnection.mockReset();
    mockWithPostgresAdvisoryLock.mockReset();
  });

  it('aliases legacy camelCase application columns to the stable activation field names', async () => {
    mockGetSchemaCompat.mockResolvedValue({
      applicationAssignedCarColumn: 'assignedCarId',
      applicationPaymentLinkVersionColumn: 'paymentLinkVersion',
    });

    await expect(buildLockedApplicationSelectSql()).resolves.toBe(
      'SELECT status, "paymentLinkVersion" AS payment_link_version FROM "applications" WHERE id = $1 FOR UPDATE'
    );
  });

  it('keeps modern snake_case application columns quoted and aliased consistently', async () => {
    mockGetSchemaCompat.mockResolvedValue({
      applicationAssignedCarColumn: 'assigned_car_id',
      applicationPaymentLinkVersionColumn: 'payment_link_version',
    });

    await expect(buildLockedApplicationSelectSql()).resolves.toBe(
      'SELECT status, "payment_link_version" AS payment_link_version FROM "applications" WHERE id = $1 FOR UPDATE'
    );
  });
});

describe('isPaymentRecordingStatus', () => {
  it('allows only payment-recording lifecycle states', () => {
    expect(isPaymentRecordingStatus('Approved')).toBe(true);
    expect(isPaymentRecordingStatus('Paid')).toBe(true);
    expect(isPaymentRecordingStatus('Payment Review')).toBe(true);
  });

  it('rejects cancelled applications so a race cannot turn them into Paid', () => {
    expect(isPaymentRecordingStatus('Cancelled')).toBe(false);
    expect(isPaymentRecordingStatus('Pending')).toBe(false);
    expect(isPaymentRecordingStatus(null)).toBe(false);
  });
});

describe('withVehicleCheckoutProcessingLock', () => {
  beforeEach(() => {
    mockHasDirectDatabaseConnection.mockReset();
    mockWithPostgresAdvisoryLock.mockReset();
  });

  it('serializes checkout processing with a Postgres advisory lock when direct DB access is available', async () => {
    mockHasDirectDatabaseConnection.mockReturnValue(true);
    mockWithPostgresAdvisoryLock.mockImplementation(async (_lockKey: string, callback: () => Promise<string>) =>
      callback()
    );

    await expect(
      withVehicleCheckoutProcessingLock('11111111-1111-4111-8111-111111111111', async () => 'ok')
    ).resolves.toBe('ok');

    expect(mockWithPostgresAdvisoryLock).toHaveBeenCalledWith(
      'vehicle-checkout:11111111-1111-4111-8111-111111111111',
      expect.any(Function)
    );
  });

  it('falls back to a direct callback when there is no direct DB connection', async () => {
    mockHasDirectDatabaseConnection.mockReturnValue(false);

    await expect(
      withVehicleCheckoutProcessingLock('11111111-1111-4111-8111-111111111111', async () => 'ok')
    ).resolves.toBe('ok');

    expect(mockWithPostgresAdvisoryLock).not.toHaveBeenCalled();
  });
});
