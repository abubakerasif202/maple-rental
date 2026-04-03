import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockHasDirectDatabaseConnection } = vi.hoisted(() => ({
  mockHasDirectDatabaseConnection: vi.fn(() => false),
}));

vi.mock('./db/postgres.js', () => ({
  hasDirectDatabaseConnection: mockHasDirectDatabaseConnection,
}));

import {
  ADMIN_PAYMENTS_RESTRICTED_MESSAGE,
  AUTOMATIC_PAYMENT_ACTIVATION_RESTRICTED_REASON,
  PUBLIC_PAYMENTS_UNAVAILABLE_MESSAGE,
  assertTransactionalPaymentProcessing,
  createPaymentProcessingRestrictedError,
  getPaymentProcessingMode,
  hasTransactionalPaymentProcessing,
} from './paymentProcessing.js';

describe('paymentProcessing', () => {
  afterEach(() => {
    mockHasDirectDatabaseConnection.mockReturnValue(false);
  });

  describe('exported constants', () => {
    it('exports a non-empty public unavailable message', () => {
      expect(typeof PUBLIC_PAYMENTS_UNAVAILABLE_MESSAGE).toBe('string');
      expect(PUBLIC_PAYMENTS_UNAVAILABLE_MESSAGE.length).toBeGreaterThan(0);
    });

    it('exports a non-empty admin restricted message', () => {
      expect(typeof ADMIN_PAYMENTS_RESTRICTED_MESSAGE).toBe('string');
      expect(ADMIN_PAYMENTS_RESTRICTED_MESSAGE.length).toBeGreaterThan(0);
    });

    it('exports a non-empty automatic activation restricted reason', () => {
      expect(typeof AUTOMATIC_PAYMENT_ACTIVATION_RESTRICTED_REASON).toBe('string');
      expect(AUTOMATIC_PAYMENT_ACTIVATION_RESTRICTED_REASON.length).toBeGreaterThan(0);
    });
  });

  describe('getPaymentProcessingMode', () => {
    it('returns transactional when a direct DB connection is available', () => {
      mockHasDirectDatabaseConnection.mockReturnValue(true);
      expect(getPaymentProcessingMode()).toBe('transactional');
    });

    it('returns restricted when no direct DB connection is available', () => {
      mockHasDirectDatabaseConnection.mockReturnValue(false);
      expect(getPaymentProcessingMode()).toBe('restricted');
    });
  });

  describe('hasTransactionalPaymentProcessing', () => {
    it('returns true when a direct DB connection is available', () => {
      mockHasDirectDatabaseConnection.mockReturnValue(true);
      expect(hasTransactionalPaymentProcessing()).toBe(true);
    });

    it('returns false when no direct DB connection is available', () => {
      mockHasDirectDatabaseConnection.mockReturnValue(false);
      expect(hasTransactionalPaymentProcessing()).toBe(false);
    });
  });

  describe('createPaymentProcessingRestrictedError', () => {
    it('creates an error with the default public message when no argument is given', () => {
      const error = createPaymentProcessingRestrictedError();
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe(PUBLIC_PAYMENTS_UNAVAILABLE_MESSAGE);
    });

    it('creates an error with a custom message when one is provided', () => {
      const error = createPaymentProcessingRestrictedError('Custom restriction message');
      expect(error.message).toBe('Custom restriction message');
    });

    it('attaches the PAYMENT_PROCESSING_RESTRICTED code', () => {
      const error = createPaymentProcessingRestrictedError();
      expect((error as NodeJS.ErrnoException & { code: string }).code).toBe(
        'PAYMENT_PROCESSING_RESTRICTED'
      );
    });

    it('sets HTTP status 503', () => {
      const error = createPaymentProcessingRestrictedError();
      expect((error as Error & { status: number }).status).toBe(503);
    });
  });

  describe('assertTransactionalPaymentProcessing', () => {
    it('does not throw when transactional processing is available', () => {
      mockHasDirectDatabaseConnection.mockReturnValue(true);
      expect(() => assertTransactionalPaymentProcessing()).not.toThrow();
    });

    it('throws a restricted error when no direct DB connection is available', () => {
      mockHasDirectDatabaseConnection.mockReturnValue(false);
      expect(() => assertTransactionalPaymentProcessing()).toThrow();
    });

    it('throws with the default public message when no message is supplied', () => {
      mockHasDirectDatabaseConnection.mockReturnValue(false);
      expect(() => assertTransactionalPaymentProcessing()).toThrow(
        PUBLIC_PAYMENTS_UNAVAILABLE_MESSAGE
      );
    });

    it('throws with a custom message when one is provided', () => {
      mockHasDirectDatabaseConnection.mockReturnValue(false);
      expect(() =>
        assertTransactionalPaymentProcessing(ADMIN_PAYMENTS_RESTRICTED_MESSAGE)
      ).toThrow(ADMIN_PAYMENTS_RESTRICTED_MESSAGE);
    });

    it('attaches the PAYMENT_PROCESSING_RESTRICTED code on the thrown error', () => {
      mockHasDirectDatabaseConnection.mockReturnValue(false);
      try {
        assertTransactionalPaymentProcessing();
        expect.fail('Expected assertTransactionalPaymentProcessing to throw');
      } catch (error) {
        expect((error as Error & { code: string }).code).toBe(
          'PAYMENT_PROCESSING_RESTRICTED'
        );
      }
    });
  });
});
