import { describe, expect, it } from 'vitest';
import { cancellationIdempotencyKey, safeCancellationFailureCode } from './cancellationOperations.js';

describe('durable cancellation operations', () => {
  it('uses deterministic keys and separates modes', () => {
    const base = { operationType: 'rental' as const, targetId: '42', mode: 'immediate' as const };
    expect(cancellationIdempotencyKey(base)).toBe(cancellationIdempotencyKey(base));
    expect(cancellationIdempotencyKey(base)).not.toBe(cancellationIdempotencyKey({ ...base, mode: 'period_end' }));
    expect(cancellationIdempotencyKey(base)).not.toContain('42');
  });

  it('keeps canonical application cancellation idempotency stable across local payment versions', () => {
    const base = {
      operationType: 'application' as const,
      targetId: 'application-42',
      mode: 'immediate' as const,
      relationshipId: 'sub_canonical',
    };

    expect(cancellationIdempotencyKey({ ...base, paymentVersion: 4 })).toBe(
      cancellationIdempotencyKey({ ...base, paymentVersion: 5 }),
    );
    expect(
      cancellationIdempotencyKey({ ...base, relationshipId: null, paymentVersion: 4 }),
    ).not.toBe(
      cancellationIdempotencyKey({ ...base, relationshipId: null, paymentVersion: 5 }),
    );
  });

  it('reduces provider failures to safe categories', () => {
    const error = Object.assign(new Error('secret provider message sub_sensitive'), { name: 'StripeAPIError' });
    expect(safeCancellationFailureCode(error)).toBe('StripeAPIError');
    expect(safeCancellationFailureCode(error)).not.toContain('sub_sensitive');
  });
});
