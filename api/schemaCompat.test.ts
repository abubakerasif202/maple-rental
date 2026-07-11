import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

describe('schemaCompat', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'development',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      VITEST: 'false',
    };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it('uses deterministic defaults in production even when introspection fails', async () => {
    process.env.NODE_ENV = 'production';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      })
    );

    const { getSchemaCompat } = await import('./schemaCompat.js');

    await expect(getSchemaCompat()).resolves.toMatchObject({
      coreMode: 'snake',
      rentalStripeSubscriptionColumn: 'stripe_subscription_id',
    });
  });

  it('uses the inspected production schema when the live database is still camelCase', async () => {
    process.env.NODE_ENV = 'production';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          definitions: {
            applications: {
              properties: {
                approvedAt: { type: 'string' },
                approvedBond: { type: 'number' },
                approvedWeeklyPrice: { type: 'number' },
                licenseBackPhoto: { type: 'string' },
                agreementTemplateVersion: { type: 'number' },
                paidAt: { type: 'string' },
                paymentLinkSentAt: { type: 'string' },
                paymentLinkVersion: { type: 'number' },
                pendingCheckoutSessionId: { type: 'string' },
              },
            },
            rentals: {
              properties: {
                stripeCustomerId: { type: 'string' },
                stripeSubscriptionId: { type: 'string' },
              },
            },
          },
        }),
        status: 200,
        statusText: 'OK',
      })
    );

    const { getSchemaCompat } = await import('./schemaCompat.js');

    await expect(getSchemaCompat()).resolves.toMatchObject({
      applicationApprovedAtColumn: 'approvedAt',
      applicationApprovedBondColumn: 'approvedBond',
      applicationApprovedWeeklyPriceColumn: 'approvedWeeklyPrice',
      applicationBackPhotoColumn: 'licenseBackPhoto',
      applicationAgreementTemplateVersionColumn: 'agreementTemplateVersion',
      applicationPaidAtColumn: 'paidAt',
      applicationPaymentLinkSentAtColumn: 'paymentLinkSentAt',
      applicationPaymentLinkVersionColumn: 'paymentLinkVersion',
      applicationPendingCheckoutSessionColumn: 'pendingCheckoutSessionId',
      coreMode: 'camel',
      rentalStripeCustomerColumn: 'stripeCustomerId',
      rentalStripeSubscriptionColumn: 'stripeSubscriptionId',
    });
  });

  it('retries schema introspection after cache TTL in non-production mode', async () => {
    process.env.NODE_ENV = 'development';
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          definitions: {
            applications: { properties: { createdAt: { type: 'string' } } },
            rentals: { properties: {} },
          },
        }),
        status: 200,
        statusText: 'OK',
      });

    vi.stubGlobal('fetch', fetchMock);

    const { getApplicationCreatedAtColumn } = await import('./schemaCompat.js');

    await expect(getApplicationCreatedAtColumn()).resolves.toBe('created_at');

    vi.advanceTimersByTime(61_000);

    await expect(getApplicationCreatedAtColumn()).resolves.toBe('createdAt');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
