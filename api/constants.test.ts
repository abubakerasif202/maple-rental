import { describe, expect, it } from 'vitest';

import { STRIPE_API_VERSION, STRIPE_CONFIG } from './constants.js';

describe('STRIPE_CONFIG', () => {
  it('pins Stripe clients to the validated Aurora Rentals API version', () => {
    expect(STRIPE_API_VERSION).toBe('2025-04-30.basil');
    expect(STRIPE_CONFIG.apiVersion).toBe(STRIPE_API_VERSION);
    expect(STRIPE_CONFIG.typescript).toBe(true);
  });
});
