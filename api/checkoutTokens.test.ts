import { beforeEach, describe, expect, it } from 'vitest';

import {
  createCheckoutToken,
  normalizeCheckoutTokenPayload,
  verifyCheckoutToken,
} from './checkoutTokens.js';

const APPLICATION_ID = '11111111-1111-4111-8111-111111111111';

const decodeTokenPayload = (token: string) =>
  JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8')) as {
    carId: number | null;
  };

describe('checkout token vehicle isolation', () => {
  beforeEach(() => {
    process.env.CHECKOUT_LINK_SECRET = 'checkout-test-secret-with-at-least-32-characters';
  });

  it('always mints vehicle checkout tokens with carId null', () => {
    const { token } = createCheckoutToken({
      applicationId: APPLICATION_ID,
      carId: 99,
      purpose: 'vehicle',
      version: 3,
    });

    expect(decodeTokenPayload(token).carId).toBeNull();
    expect(
      verifyCheckoutToken({
        applicationId: APPLICATION_ID,
        purpose: 'vehicle',
        token,
        version: 3,
      }).carId
    ).toBeNull();
  });

  it('normalizes a valid legacy vehicle-linked token before runtime use', () => {
    const normalized = normalizeCheckoutTokenPayload({
      applicationId: APPLICATION_ID,
      carId: 42,
      expiresAt: Date.now() + 60_000,
      nonce: 'legacy-token',
      purpose: 'vehicle',
      version: 4,
    });

    expect(normalized.carId).toBeNull();
  });
});
