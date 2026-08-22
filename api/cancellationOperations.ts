import crypto from 'node:crypto';
import { db } from './db/index.js';

export type CancellationOperationType = 'application' | 'rental';
export type CancellationMode = 'immediate' | 'period_end';

export const cancellationIdempotencyKey = (parts: {
  operationType: CancellationOperationType;
  targetId: string;
  mode: CancellationMode;
  paymentVersion?: number;
  relationshipId?: string | null;
}) => `maple-cancel-${crypto.createHash('sha256').update(JSON.stringify({
  ...parts,
  // Once a canonical Stripe relationship exists it is the stable identity for
  // the cancellation. The application version advances after local
  // finalization, but retries must continue to resolve to the same operation.
  paymentVersion: parts.relationshipId ? undefined : parts.paymentVersion,
})).digest('hex')}`;

export const requestCancellationOperation = async (input: {
  applicationId?: string | null;
  checkoutSessionId?: string | null;
  mode: CancellationMode;
  operationType: CancellationOperationType;
  rentalId?: string | null;
  requestedBy?: string | null;
  stripeSubscriptionId?: string | null;
  paymentVersion?: number;
}) => {
  const targetId = input.operationType === 'application' ? String(input.applicationId) : String(input.rentalId);
  const idempotencyKey = cancellationIdempotencyKey({
    operationType: input.operationType, targetId, mode: input.mode, paymentVersion: input.paymentVersion,
    relationshipId: input.stripeSubscriptionId || input.checkoutSessionId || null,
  });
  const payload = {
    application_id: input.applicationId || null,
    expected_payment_link_version: input.paymentVersion ?? null,
    idempotency_key: idempotencyKey,
    operation_type: input.operationType,
    rental_id: input.rentalId || null,
    requested_by: input.requestedBy || null,
    requested_mode: input.mode,
    status: 'requested',
    stripe_checkout_session_id: input.checkoutSessionId || null,
    stripe_subscription_id: input.stripeSubscriptionId || null,
  };
  const inserted = await db.from('stripe_cancellation_operations').insert([payload]).select('*').single();
  if (!inserted.error && inserted.data) return inserted.data;
  if (String(inserted.error?.code) !== '23505') throw inserted.error || new Error('Cancellation operation was not persisted');
  const existing = await db.from('stripe_cancellation_operations').select('*').eq('idempotency_key', idempotencyKey).single();
  if (existing.error || !existing.data) throw existing.error || new Error('Cancellation operation could not be resumed');
  return existing.data;
};

const CANCELLATION_CLAIM_STALE_MS = 5 * 60 * 1000;

export const claimCancellationOperation = async (id: string) => {
  const staleBefore = new Date(Date.now() - CANCELLATION_CLAIM_STALE_MS).toISOString();
  const result = await db.rpc('claim_stripe_cancellation_operation', {
    p_operation_id: id,
    p_stale_before: staleBefore,
  });
  if (result.error) throw result.error;
  const claimed = Array.isArray(result.data) ? result.data[0] : result.data;
  return claimed || null;
};

export const updateCancellationOperation = async (
  id: string,
  status: string,
  extra: Record<string, unknown> = {},
) => {
  const result = await db.from('stripe_cancellation_operations').update({
    ...extra, status, updated_at: new Date().toISOString(),
  }).eq('id', id).select('*').single();
  if (result.error || !result.data) throw result.error || new Error('Cancellation operation update failed');
  return result.data;
};

export const tryUpdateCancellationOperation = async (
  id: string,
  status: string,
  extra: Record<string, unknown> = {},
) => {
  try {
    return await updateCancellationOperation(id, status, extra);
  } catch {
    return null;
  }
};

export const safeCancellationFailureCode = (error: unknown) => {
  const name = error instanceof Error ? error.name : 'UnknownError';
  return /^[A-Za-z0-9_]+$/.test(name) ? name.slice(0, 80) : 'CancellationError';
};
