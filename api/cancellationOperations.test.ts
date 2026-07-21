import { describe, expect, it } from 'vitest';
import { cancellationIdempotencyKey, safeCancellationFailureCode } from './cancellationOperations.js';

describe('durable cancellation operations', () => {
  it('uses deterministic keys and separates modes', () => {
    const base = { operationType: 'rental' as const, targetId: '42', mode: 'immediate' as const };
    expect(cancellationIdempotencyKey(base)).toBe(cancellationIdempotencyKey(base));
    expect(cancellationIdempotencyKey(base)).not.toBe(cancellationIdempotencyKey({ ...base, mode: 'period_end' }));
    expect(cancellationIdempotencyKey(base)).not.toContain('42');
  });

  it('reduces provider failures to safe categories', () => {
    const error = Object.assign(new Error('secret provider message sub_sensitive'), { name: 'StripeAPIError' });
    expect(safeCancellationFailureCode(error)).toBe('StripeAPIError');
    expect(safeCancellationFailureCode(error)).not.toContain('sub_sensitive');
  });
});
