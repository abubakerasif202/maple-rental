import { hasDirectDatabaseConnection } from './db/postgres.js';

export type PaymentProcessingMode = 'transactional' | 'restricted';

export const PUBLIC_PAYMENTS_UNAVAILABLE_MESSAGE =
  'Payments are temporarily unavailable. Please contact support.';
export const ADMIN_PAYMENTS_RESTRICTED_MESSAGE =
  'A session-capable Postgres connection is required before sending payment links.';
export const TRANSACTIONAL_PAYMENT_RECORDING_RESTRICTED_REASON =
  'Transactional payment recording is blocked until a session-capable Postgres connection is configured.';

export const getPaymentProcessingMode = (): PaymentProcessingMode =>
  hasDirectDatabaseConnection() ? 'transactional' : 'restricted';

export const hasTransactionalPaymentProcessing = () =>
  getPaymentProcessingMode() === 'transactional';

export const createPaymentProcessingRestrictedError = (
  message = PUBLIC_PAYMENTS_UNAVAILABLE_MESSAGE
) =>
  Object.assign(new Error(message), {
    code: 'PAYMENT_PROCESSING_RESTRICTED',
    status: 503,
  });

export const assertTransactionalPaymentProcessing = (message?: string) => {
  if (!hasTransactionalPaymentProcessing()) {
    throw createPaymentProcessingRestrictedError(message);
  }
};
