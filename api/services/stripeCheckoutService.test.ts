import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCheckoutSessionRetrieve = vi.hoisted(() => vi.fn());
const mockCheckoutSessionExpire = vi.hoisted(() => vi.fn());

vi.mock('../stripeClient.js', () => ({
  getStripeClient: () => ({
    checkout: {
      sessions: {
        expire: mockCheckoutSessionExpire,
        retrieve: mockCheckoutSessionRetrieve,
      },
    },
  }),
}));

import {
  buildHostedCheckoutSessionIdempotencyKey,
  expirePendingCheckoutSession,
  resolvePendingCheckoutSession,
} from './stripeCheckoutService.js';

describe('stripeCheckoutService checkout helpers', () => {
  beforeEach(() => {
    mockCheckoutSessionExpire.mockReset();
    mockCheckoutSessionRetrieve.mockReset();
  });

  it('builds deterministic checkout idempotency keys per application version', () => {
    expect(
      buildHostedCheckoutSessionIdempotencyKey({
        applicationId: '11111111-1111-4111-8111-111111111111',
        paymentLinkVersion: 7,
      })
    ).toBe('vehicle-checkout:11111111-1111-4111-8111-111111111111:v7');

    expect(
      buildHostedCheckoutSessionIdempotencyKey({
        applicationId: '11111111-1111-4111-8111-111111111111',
        paymentLinkVersion: 7,
        retryKeySeed: 'cs_retry_seed',
      })
    ).toBe('vehicle-checkout:11111111-1111-4111-8111-111111111111:v7:retry:cs_retry_seed');
  });

  it('reuses an open checkout session when it still matches the current application and version', async () => {
    mockCheckoutSessionRetrieve.mockResolvedValueOnce({
      id: 'cs_open_vehicle',
      metadata: {
        application_id: '11111111-1111-4111-8111-111111111111',
        checkout_kind: 'vehicle',
        payment_link_version: '4',
      },
      status: 'open',
      url: 'https://checkout.stripe.com/pay/cs_open_vehicle',
    });

    await expect(
      resolvePendingCheckoutSession({
        application: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'driver@example.com',
          name: 'Driver One',
          payment_link_version: 4,
          pending_checkout_session_id: 'cs_open_vehicle',
          status: 'Approved',
        },
      })
    ).resolves.toEqual({
      retryKeySeed: null,
      session: {
        id: 'cs_open_vehicle',
        metadata: {
          application_id: '11111111-1111-4111-8111-111111111111',
          checkout_kind: 'vehicle',
          payment_link_version: '4',
        },
        status: 'open',
        url: 'https://checkout.stripe.com/pay/cs_open_vehicle',
      },
    });
  });

  it('reuses a complete checkout session instead of creating a replacement', async () => {
    mockCheckoutSessionRetrieve.mockResolvedValueOnce({
      id: 'cs_complete_vehicle',
      metadata: {
        application_id: '11111111-1111-4111-8111-111111111111',
        checkout_kind: 'vehicle',
        payment_link_version: '4',
      },
      status: 'complete',
      url: null,
    });

    await expect(
      resolvePendingCheckoutSession({
        application: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'driver@example.com',
          name: 'Driver One',
          payment_link_version: 4,
          pending_checkout_session_id: 'cs_complete_vehicle',
          status: 'Approved',
        },
      })
    ).resolves.toMatchObject({
      retryKeySeed: null,
      session: {
        id: 'cs_complete_vehicle',
        status: 'complete',
      },
    });
  });

  it('allows replacement only when Stripe confirms the pending session is missing', async () => {
    mockCheckoutSessionRetrieve.mockRejectedValueOnce(
      Object.assign(new Error('No such checkout.session'), {
        code: 'resource_missing',
        statusCode: 404,
        type: 'StripeInvalidRequestError',
      })
    );

    await expect(
      resolvePendingCheckoutSession({
        application: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'driver@example.com',
          name: 'Driver One',
          payment_link_version: 4,
          pending_checkout_session_id: 'cs_missing_vehicle',
          status: 'Approved',
        },
      })
    ).resolves.toEqual({
      retryKeySeed: 'cs_missing_vehicle',
      session: null,
    });
  });

  it('propagates transient Stripe reads instead of creating a second payable session', async () => {
    const connectionError = Object.assign(new Error('Stripe connection timed out'), {
      type: 'StripeConnectionError',
    });
    mockCheckoutSessionRetrieve.mockRejectedValueOnce(connectionError);

    await expect(
      resolvePendingCheckoutSession({
        application: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'driver@example.com',
          name: 'Driver One',
          payment_link_version: 4,
          pending_checkout_session_id: 'cs_unknown_vehicle',
          status: 'Approved',
        },
      })
    ).rejects.toBe(connectionError);
  });

  it('allows replacement after Stripe confirms the pending session is terminal', async () => {
    mockCheckoutSessionRetrieve.mockResolvedValueOnce({
      id: 'cs_expired_vehicle',
      metadata: {
        application_id: '11111111-1111-4111-8111-111111111111',
        checkout_kind: 'vehicle',
        payment_link_version: '4',
      },
      status: 'expired',
    });

    await expect(
      resolvePendingCheckoutSession({
        application: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'driver@example.com',
          name: 'Driver One',
          payment_link_version: 4,
          pending_checkout_session_id: 'cs_expired_vehicle',
          status: 'Approved',
        },
      })
    ).resolves.toEqual({
      retryKeySeed: 'cs_expired_vehicle',
      session: null,
    });
  });

  it('expires an open pending checkout session', async () => {
    mockCheckoutSessionRetrieve.mockResolvedValueOnce({
      id: 'cs_open_vehicle',
      status: 'open',
    });
    mockCheckoutSessionExpire.mockResolvedValueOnce({
      id: 'cs_open_vehicle',
      status: 'expired',
    });

    await expirePendingCheckoutSession('cs_open_vehicle');

    expect(mockCheckoutSessionRetrieve).toHaveBeenCalledWith('cs_open_vehicle');
    expect(mockCheckoutSessionExpire).toHaveBeenCalledWith('cs_open_vehicle');
  });

  it('does not expire a completed pending checkout session', async () => {
    mockCheckoutSessionRetrieve.mockResolvedValueOnce({
      id: 'cs_complete_vehicle',
      status: 'complete',
    });

    await expirePendingCheckoutSession('cs_complete_vehicle');

    expect(mockCheckoutSessionRetrieve).toHaveBeenCalledWith('cs_complete_vehicle');
    expect(mockCheckoutSessionExpire).not.toHaveBeenCalled();
  });
});
