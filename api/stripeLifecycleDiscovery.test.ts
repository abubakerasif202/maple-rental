import { describe, expect, it } from 'vitest';

import { discoverRelationshipFromSessions } from './stripeLifecycleDiscovery.js';

const APPLICATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_APPLICATION_ID = '22222222-2222-4222-8222-222222222222';

const paidVehicleSession = (overrides: Record<string, any> = {}) => ({
  id: 'cs_paid',
  metadata: {
    application_id: APPLICATION_ID,
    checkout_kind: 'vehicle',
    payment_link_version: '2',
  },
  mode: 'subscription',
  payment_status: 'paid',
  ...overrides,
});

describe('discoverRelationshipFromSessions', () => {
  it('recovers an older subscription whose metadata lives only on the Checkout Session', () => {
    // The subscription itself carries no Maple metadata at all.
    const result = discoverRelationshipFromSessions({ metadata: {} } as never, [
      paidVehicleSession(),
    ] as never);

    expect(result).toEqual({
      ambiguous: false,
      applicationId: APPLICATION_ID,
      checkoutSessionId: 'cs_paid',
      paymentLinkVersion: 2,
    });
  });

  it('still resolves when subscription and session metadata agree', () => {
    const result = discoverRelationshipFromSessions(
      { metadata: { application_id: APPLICATION_ID, payment_link_version: '2' } } as never,
      [paidVehicleSession()] as never
    );

    expect(result).toMatchObject({ ambiguous: false, applicationId: APPLICATION_ID });
  });

  it('flags a conflict between subscription and session metadata as ambiguous', () => {
    const result = discoverRelationshipFromSessions(
      { metadata: { application_id: OTHER_APPLICATION_ID } } as never,
      [paidVehicleSession()] as never
    );

    expect(result.ambiguous).toBe(true);
  });

  it('flags multiple paid vehicle sessions for different applications as ambiguous', () => {
    const result = discoverRelationshipFromSessions({ metadata: {} } as never, [
      paidVehicleSession(),
      paidVehicleSession({
        id: 'cs_other',
        metadata: {
          application_id: OTHER_APPLICATION_ID,
          checkout_kind: 'vehicle',
          payment_link_version: '1',
        },
      }),
    ] as never);

    expect(result.ambiguous).toBe(true);
  });

  it('ignores unpaid sessions so an abandoned checkout never establishes identity', () => {
    const result = discoverRelationshipFromSessions({ metadata: {} } as never, [
      paidVehicleSession({ payment_status: 'unpaid' }),
    ] as never);

    expect(result).toMatchObject({ ambiguous: false, applicationId: null });
  });

  it('ignores non-vehicle checkout sessions', () => {
    const result = discoverRelationshipFromSessions({ metadata: {} } as never, [
      paidVehicleSession({
        metadata: {
          application_id: APPLICATION_ID,
          checkout_kind: 'other',
          payment_link_version: '2',
        },
      }),
    ] as never);

    expect(result).toMatchObject({ ambiguous: false, applicationId: null });
  });

  it('returns no application when there is nothing trustworthy to match', () => {
    const result = discoverRelationshipFromSessions({ metadata: {} } as never, []);

    expect(result).toEqual({
      ambiguous: false,
      applicationId: null,
      checkoutSessionId: null,
      paymentLinkVersion: 0,
    });
  });
});
