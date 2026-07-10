import { describe, expect, it } from 'vitest';

import { STRIPE_API_VERSION, STRIPE_CONFIG } from './constants.js';

describe('STRIPE_CONFIG', () => {
  it('pins Stripe clients to the validated Maple Rental API version', () => {
    expect(STRIPE_API_VERSION).toBe('2026-04-22.dahlia');
    expect(STRIPE_CONFIG.apiVersion).toBe(STRIPE_API_VERSION);
    expect(STRIPE_CONFIG.typescript).toBe(true);
  });
});
