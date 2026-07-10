import { afterEach, describe, expect, it } from 'vitest';

const ORIGINAL_APP_URL = process.env.APP_URL;
const ORIGINAL_FRONTEND_URL = process.env.FRONTEND_URL;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  if (ORIGINAL_APP_URL === undefined) {
    delete process.env.APP_URL;
  } else {
    process.env.APP_URL = ORIGINAL_APP_URL;
  }

  if (ORIGINAL_FRONTEND_URL === undefined) {
    delete process.env.FRONTEND_URL;
  } else {
    process.env.FRONTEND_URL = ORIGINAL_FRONTEND_URL;
  }

  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }
});

describe('paymentLinks', () => {
  it('falls back to the documented single-origin dev app URL', async () => {
    delete process.env.APP_URL;
    delete process.env.FRONTEND_URL;
    process.env.NODE_ENV = 'development';

    const { buildDriverPaymentLink } = await import('./paymentLinks.js');

    expect(
      buildDriverPaymentLink({
        applicationId: '11111111-1111-4111-8111-111111111111',
        token: 'checkout-token',
      })
    ).toContain('http://localhost:3000/checkout/11111111-1111-4111-8111-111111111111');
  });

  it('discloses zero due today when a future rental start uses scheduled billing', async () => {
    const { buildDriverPaymentTiming } = await import('./paymentLinks.js');
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    expect(
      buildDriverPaymentTiming({
        approvedWeeklyPrice: 300,
        rentalSubscriptionStartDate: futureDate,
      })
    ).toEqual({
      amountChargedAtCheckout: 0,
      message: expect.stringContaining(
        `first weekly payment of $300.00 is scheduled for ${futureDate}`
      ),
    });
  });

  it('discloses the weekly charge for immediate subscriptions', async () => {
    const { buildDriverPaymentTiming } = await import('./paymentLinks.js');

    expect(
      buildDriverPaymentTiming({
        approvedWeeklyPrice: 300,
        rentalSubscriptionStartDate: null,
      })
    ).toEqual({
      amountChargedAtCheckout: 300,
      message: expect.stringContaining('charge the weekly payment now'),
    });
  });
});
