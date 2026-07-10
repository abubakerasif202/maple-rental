import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStripeConstructor } = vi.hoisted(() => ({
  mockStripeConstructor: vi.fn(),
}));

vi.mock('stripe', () => {
  class MockStripe {
    constructor(apiKey: string, config: unknown) {
      mockStripeConstructor(apiKey, config);
    }
  }

  return {
    default: MockStripe,
  };
});

describe('stripeClient', () => {
  beforeEach(() => {
    vi.resetModules();
    mockStripeConstructor.mockReset();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it('reuses a cached client for the same trimmed Stripe key', async () => {
    process.env.STRIPE_SECRET_KEY = '  sk_test_cached  ';

    const { getStripeClient } = await import('./stripeClient.js');

    const firstClient = getStripeClient();
    const secondClient = getStripeClient();

    expect(firstClient).toBe(secondClient);
    expect(mockStripeConstructor).toHaveBeenCalledTimes(1);
    expect(mockStripeConstructor).toHaveBeenCalledWith(
      'sk_test_cached',
      expect.objectContaining({
        apiVersion: '2026-04-22.dahlia',
        typescript: true,
      })
    );
  });

  it('rebuilds the client when the configured key changes', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_first';

    const { getStripeClient } = await import('./stripeClient.js');

    const firstClient = getStripeClient();

    process.env.STRIPE_SECRET_KEY = 'sk_test_second';

    const secondClient = getStripeClient();

    expect(secondClient).not.toBe(firstClient);
    expect(mockStripeConstructor).toHaveBeenCalledTimes(2);
  });

  it('returns null for optional Stripe access when the key is unset', async () => {
    const { getOptionalStripeClient } = await import('./stripeClient.js');

    expect(getOptionalStripeClient()).toBeNull();
    expect(mockStripeConstructor).not.toHaveBeenCalled();
  });

  it('throws for required Stripe access when the key is unset', async () => {
    const { getStripeClient } = await import('./stripeClient.js');

    expect(() => getStripeClient()).toThrowError('STRIPE_SECRET_KEY is required.');
    expect(mockStripeConstructor).not.toHaveBeenCalled();
  });
});
