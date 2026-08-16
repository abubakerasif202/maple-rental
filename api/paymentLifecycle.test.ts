import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression coverage for the verified payment lifecycle bridge.
 *
 * The invariant under test throughout: recording payment and creating an
 * operational rental are separate. Nothing in this file may cause a rental to
 * appear as a side effect of payment.
 */

type Row = Record<string, any>;

// The whole harness lives inside vi.hoisted because vi.mock factories are
// hoisted above module-level declarations.
const harness = vi.hoisted(() => {
  type HRow = Record<string, any>;

  const tables: Record<string, HRow[]> = {
    applications: [],
    customers: [],
    invoices: [],
    rentals: [],
  };

  /** Every write the mock database performed, for asserting side effects. */
  const writeLog: Array<{
    operation: 'insert' | 'update';
    table: string;
    payload: HRow;
  }> = [];

  const state = { nextId: 1 };

  const matchesFilters = (row: HRow, filters: Array<[string, string, any]>) =>
  filters.every(([type, column, value]) => {
    if (type === 'eq') return String(row[column] ?? '') === String(value);
    if (type === 'in') return (value as any[]).some((entry) => String(entry) === String(row[column] ?? ''));
    if (type === 'notNull') return row[column] !== null && row[column] !== undefined;
    return true;
  });

  const createBuilder = (table: string) => {
  const filters: Array<[string, string, any]> = [];
  let mode: 'select' | 'insert' | 'update' = 'select';
  let payload: HRow = {};

  const resolveRows = () => (tables[table] || []).filter((row) => matchesFilters(row, filters));

  const applyWrite = () => {
    if (mode === 'insert') {
      const inserted = { id: state.nextId++, ...payload };
      tables[table].push(inserted);
      writeLog.push({ operation: 'insert', payload, table });
      return [inserted];
    }

    if (mode === 'update') {
      const updated = resolveRows();
      updated.forEach((row) => Object.assign(row, payload));
      writeLog.push({ operation: 'update', payload, table });
      return updated;
    }

    return resolveRows();
  };

  const builder: any = {
    eq(column: string, value: any) {
      filters.push(['eq', column, value]);
      return builder;
    },
    in(column: string, value: any[]) {
      filters.push(['in', column, value]);
      return builder;
    },
    not(column: string, _operator: string, _value: any) {
      filters.push(['notNull', column, null]);
      return builder;
    },
    order() {
      return builder;
    },
    select() {
      return builder;
    },
    insert(nextPayload: HRow) {
      mode = 'insert';
      payload = nextPayload;
      return builder;
    },
    update(nextPayload: HRow) {
      mode = 'update';
      payload = nextPayload;
      return builder;
    },
    async maybeSingle() {
      const rows = applyWrite();
      return { data: rows[0] ?? null, error: null };
    },
    async single() {
      const rows = applyWrite();
      if (rows.length !== 1) {
        return { data: null, error: { message: 'Expected exactly one row' } };
      }
      return { data: rows[0], error: null };
    },
    then(resolve: (value: any) => unknown) {
      const rows = applyWrite();
      return Promise.resolve(resolve({ data: rows, error: null }));
    },
  };

  return builder;
  };

  const reset = () => {
    Object.keys(tables).forEach((table) => {
      tables[table] = [];
    });
    writeLog.length = 0;
    state.nextId = 1;
  };

  return {
    mockDb: { from: (table: string) => createBuilder(table) },
    reset,
    tables,
    writeLog,
  };
});

const { tables, writeLog } = harness;

const mockSubscriptionsRetrieve = vi.hoisted(() => vi.fn());
const mockRecordAdminAuditEvent = vi.hoisted(() => vi.fn());

vi.mock('./db/index.js', () => ({ db: harness.mockDb }));

vi.mock('./db/postgres.js', () => ({
  hasDirectDatabaseConnection: () => false,
  withPostgresAdvisoryLock: async (_key: string, callback: () => Promise<unknown>) =>
    callback(),
  withPostgresTransaction: vi.fn(),
}));

vi.mock('./schemaCompat.js', () => ({
  getRentalApplicationIdColumn: async () => 'application_id',
  getSchemaCompat: async () => ({
    applicationApprovedVehicleColumn: 'approved_vehicle',
    applicationApprovedWeeklyPriceColumn: 'approved_weekly_price',
    applicationIntendedStartDateColumn: 'intended_start_date',
    applicationPaidAtColumn: 'paid_at',
    applicationPaymentLinkVersionColumn: 'payment_link_version',
    coreMode: 'snake',
    rentalStripeCustomerColumn: 'stripe_customer_id',
    rentalStripeSubscriptionColumn: 'stripe_subscription_id',
  }),
}));

vi.mock('./stripeClient.js', () => ({
  getStripeClient: () => ({
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
  }),
}));

vi.mock('./adminAudit.js', () => ({
  recordAdminAuditEvent: mockRecordAdminAuditEvent,
}));

import {
  ACTIVATION_ELIGIBLE_SUBSCRIPTION_STATUSES,
  activateRentalForApplication,
  listPendingRentalActivations,
  PaymentLifecycleError,
  persistCheckoutRelationshipFromSession,
  persistVerifiedStripeRelationship,
} from './paymentLifecycle.js';

const APPLICATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_APPLICATION_ID = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_ID = 'cus_verified';
const SUBSCRIPTION_ID = 'sub_verified';

const seedPaidApplication = (overrides: Row = {}) => {
  const application = {
    address: '1 Test Street',
    approved_vehicle: 'ABC123',
    approved_weekly_price: 350,
    email: 'driver@example.com',
    id: APPLICATION_ID,
    intended_start_date: '2026-09-01',
    name: 'Test Driver',
    paid_at: '2026-08-16T00:00:00.000Z',
    payment_link_version: 2,
    phone: '0400000000',
    status: 'Paid',
    stripe_checkout_session_id: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    ...overrides,
  };
  tables.applications.push(application);
  return application;
};

const verifiedRelationship = (overrides: Row = {}) => ({
  applicationId: APPLICATION_ID,
  checkoutSessionId: 'cs_verified',
  customerId: CUSTOMER_ID,
  paymentLinkVersion: 2,
  subscriptionId: SUBSCRIPTION_ID,
  ...overrides,
});

const activeSubscription = (overrides: Row = {}) => ({
  customer: CUSTOMER_ID,
  id: SUBSCRIPTION_ID,
  metadata: { application_id: APPLICATION_ID },
  status: 'active',
  ...overrides,
});

beforeEach(() => {
  harness.reset();
  mockSubscriptionsRetrieve.mockReset();
  mockRecordAdminAuditEvent.mockReset();
});

describe('persistVerifiedStripeRelationship', () => {
  it('links exactly one operational customer for a verified paid application', async () => {
    seedPaidApplication();

    await persistVerifiedStripeRelationship(verifiedRelationship());

    expect(tables.customers).toHaveLength(1);
    expect(tables.customers[0]).toMatchObject({
      application_id: APPLICATION_ID,
      stripe_customer_id: CUSTOMER_ID,
    });
    expect(tables.applications[0]).toMatchObject({
      stripe_customer_id: CUSTOMER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
    });
  });

  it('never creates a rental as a side effect of recording payment identity', async () => {
    seedPaidApplication();

    await persistVerifiedStripeRelationship(verifiedRelationship());

    expect(tables.rentals).toHaveLength(0);
    expect(writeLog.some((entry) => entry.table === 'rentals')).toBe(false);
  });

  it('is idempotent across webhook replay and creates no duplicate customer', async () => {
    seedPaidApplication();

    await persistVerifiedStripeRelationship(verifiedRelationship());
    await persistVerifiedStripeRelationship(verifiedRelationship());
    await persistVerifiedStripeRelationship(verifiedRelationship());

    expect(tables.customers).toHaveLength(1);
  });

  it('links an existing application customer instead of inserting a second one', async () => {
    seedPaidApplication();
    tables.customers.push({
      application_id: APPLICATION_ID,
      full_name: 'Test Driver',
      id: 99,
      stripe_customer_id: null,
    });

    await persistVerifiedStripeRelationship(verifiedRelationship());

    expect(tables.customers).toHaveLength(1);
    expect(tables.customers[0]).toMatchObject({
      id: 99,
      stripe_customer_id: CUSTOMER_ID,
    });
  });

  it('does not merge a same-named customer that has no durable link', async () => {
    seedPaidApplication();
    tables.customers.push({
      application_id: null,
      full_name: 'Test Driver',
      id: 77,
      stripe_customer_id: null,
    });

    await persistVerifiedStripeRelationship(verifiedRelationship());

    // The identically named record is untouched; matching is never by name.
    expect(tables.customers).toHaveLength(2);
    expect(tables.customers.find((row) => row.id === 77)).toMatchObject({
      application_id: null,
      stripe_customer_id: null,
    });
  });

  it('rejects a stale payment link version rather than linking incorrectly', async () => {
    seedPaidApplication({ payment_link_version: 3 });

    await expect(
      persistVerifiedStripeRelationship(verifiedRelationship({ paymentLinkVersion: 2 }))
    ).rejects.toMatchObject({ code: 'payment_link_version_mismatch' });

    expect(tables.customers).toHaveLength(0);
  });

  it('refuses to relink an application that already holds another subscription', async () => {
    seedPaidApplication({ stripe_subscription_id: 'sub_other' });

    await expect(
      persistVerifiedStripeRelationship(verifiedRelationship())
    ).rejects.toMatchObject({ code: 'subscription_identity_conflict' });
  });

  it('escalates a Stripe customer already owned by another application', async () => {
    seedPaidApplication();
    tables.customers.push({
      application_id: OTHER_APPLICATION_ID,
      full_name: 'Someone Else',
      id: 55,
      stripe_customer_id: CUSTOMER_ID,
    });

    await expect(
      persistVerifiedStripeRelationship(verifiedRelationship())
    ).rejects.toMatchObject({ code: 'customer_identity_ambiguous' });
  });

  it('does not make a cancelled application an operational customer', async () => {
    seedPaidApplication({ status: 'Cancelled' });

    await expect(
      persistVerifiedStripeRelationship(verifiedRelationship())
    ).rejects.toMatchObject({ code: 'application_cancelled' });

    expect(tables.customers).toHaveLength(0);
  });

  it('does not create an operational customer for an Approved application that is not yet Paid', async () => {
    seedPaidApplication({ status: 'Approved' });

    const result = await persistVerifiedStripeRelationship(verifiedRelationship());

    expect(result).toEqual({ customerId: null });
    expect(tables.customers).toHaveLength(0);
    expect(writeLog.some((entry) => entry.table === 'customers')).toBe(false);
  });

  it('still records verified Stripe identity for a not-yet-Paid application', async () => {
    seedPaidApplication({ status: 'Approved' });

    await persistVerifiedStripeRelationship(verifiedRelationship());

    expect(tables.applications[0]).toMatchObject({
      stripe_customer_id: CUSTOMER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
    });
  });

  it('creates no operational customer for any non-Paid application status', async () => {
    for (const status of ['Approved', 'Payment Review', 'Rejected']) {
      harness.reset();
      seedPaidApplication({ status });

      const result = await persistVerifiedStripeRelationship(verifiedRelationship());

      expect(result).toEqual({ customerId: null });
      expect(tables.customers).toHaveLength(0);
    }
  });

  it('never creates a rental for a not-yet-Paid application carrying Stripe identity', async () => {
    seedPaidApplication({ status: 'Approved' });

    await persistVerifiedStripeRelationship(verifiedRelationship());

    expect(tables.rentals).toHaveLength(0);
    expect(writeLog.some((entry) => entry.table === 'rentals')).toBe(false);
  });
});

describe('operational customer audit trail', () => {
  /** Metadata keys that would leak credentials, PII, or payment data. */
  const FORBIDDEN_METADATA_KEYS = [
    'address',
    'cardBrand',
    'email',
    'last4',
    'name',
    'paymentMethod',
    'phone',
    'stripeSecretKey',
    'supabaseKey',
    'supabaseServiceRoleKey',
  ];

  it('audits the operational customer create for a paid, eligible reconciliation', async () => {
    seedPaidApplication();

    const result = await persistVerifiedStripeRelationship(verifiedRelationship());

    // The trusted relationship is persisted...
    expect(tables.applications[0]).toMatchObject({
      stripe_customer_id: CUSTOMER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
    });
    expect(tables.customers).toHaveLength(1);

    // ...and the operational customer mutation is audited exactly once.
    expect(mockRecordAdminAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordAdminAuditEvent).toHaveBeenCalledWith({
      action: 'operational_customer_created',
      actor: null,
      metadata: {
        applicationId: APPLICATION_ID,
        customerId: result.customerId,
        operation: 'create',
        paymentLinkVersion: 2,
        source: 'verified-stripe-lifecycle',
        stripeCustomerId: CUSTOMER_ID,
        stripeSubscriptionId: SUBSCRIPTION_ID,
      },
      targetId: APPLICATION_ID,
      targetType: 'application',
    });
  });

  it('audits a link when an existing operational customer is attached instead of created', async () => {
    seedPaidApplication();
    tables.customers.push({
      application_id: APPLICATION_ID,
      full_name: 'Test Driver',
      id: 99,
      stripe_customer_id: null,
    });

    await persistVerifiedStripeRelationship(verifiedRelationship());

    expect(tables.customers).toHaveLength(1);
    expect(mockRecordAdminAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordAdminAuditEvent.mock.calls[0][0]).toMatchObject({
      action: 'operational_customer_linked',
      metadata: { customerId: 99, operation: 'link' },
    });
  });

  it('records no credentials, payment data, or applicant contact details', async () => {
    seedPaidApplication();

    await persistVerifiedStripeRelationship(verifiedRelationship());

    const { metadata } = mockRecordAdminAuditEvent.mock.calls[0][0];
    FORBIDDEN_METADATA_KEYS.forEach((key) => {
      expect(metadata).not.toHaveProperty(key);
    });
    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain('driver@example.com');
    expect(serialized).not.toContain('0400000000');
    expect(serialized).not.toContain('1 Test Street');
    expect(serialized).not.toContain('sk_');
  });

  it('performs no write and no audit mutation for a cancelled application', async () => {
    seedPaidApplication({ status: 'Cancelled' });

    await expect(
      persistVerifiedStripeRelationship(verifiedRelationship())
    ).rejects.toMatchObject({ code: 'application_cancelled' });

    expect(writeLog).toHaveLength(0);
    expect(tables.customers).toHaveLength(0);
    expect(mockRecordAdminAuditEvent).not.toHaveBeenCalled();
  });

  it.each(['canceled', 'past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'])(
    'writes and audits nothing for a subscription in %s state',
    async (subscriptionStatus) => {
      seedPaidApplication();

      // Mirrors the reconciliation gate: an unsafe subscription state is never
      // writable, so persistence is never reached. Using the real exported
      // allow-list means widening it would fail this test.
      const writable = ACTIVATION_ELIGIBLE_SUBSCRIPTION_STATUSES.has(subscriptionStatus);
      expect(writable).toBe(false);
      if (writable) {
        await persistVerifiedStripeRelationship(verifiedRelationship());
      }

      expect(writeLog).toHaveLength(0);
      expect(tables.customers).toHaveLength(0);
      expect(mockRecordAdminAuditEvent).not.toHaveBeenCalled();
    }
  );

  it('performs no write and no audit mutation when the application is missing', async () => {
    await expect(
      persistVerifiedStripeRelationship(verifiedRelationship())
    ).rejects.toMatchObject({ code: 'application_missing' });

    expect(writeLog).toHaveLength(0);
    expect(tables.customers).toHaveLength(0);
    expect(mockRecordAdminAuditEvent).not.toHaveBeenCalled();
  });

  it('does not audit a duplicate mutation on webhook or reconciliation replay', async () => {
    seedPaidApplication();

    await persistVerifiedStripeRelationship(verifiedRelationship());
    await persistVerifiedStripeRelationship(verifiedRelationship());
    await persistVerifiedStripeRelationship(verifiedRelationship());

    expect(tables.customers).toHaveLength(1);
    expect(mockRecordAdminAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordAdminAuditEvent.mock.calls[0][0]).toMatchObject({
      action: 'operational_customer_created',
    });
  });

  it('does not audit an already-linked operational customer', async () => {
    seedPaidApplication();
    tables.customers.push({
      application_id: APPLICATION_ID,
      full_name: 'Test Driver',
      id: 42,
      stripe_customer_id: CUSTOMER_ID,
    });

    const result = await persistVerifiedStripeRelationship(verifiedRelationship());

    expect(result).toEqual({ customerId: 42 });
    expect(tables.customers).toHaveLength(1);
    expect(mockRecordAdminAuditEvent).not.toHaveBeenCalled();
  });

  it('never audits an operational customer for a not-yet-Paid application', async () => {
    seedPaidApplication({ status: 'Approved' });

    await persistVerifiedStripeRelationship(verifiedRelationship());

    expect(mockRecordAdminAuditEvent).not.toHaveBeenCalled();
  });

  it('creates no rental and touches no fleet state while auditing the link', async () => {
    seedPaidApplication();

    await persistVerifiedStripeRelationship(verifiedRelationship());

    const touchedTables = new Set(writeLog.map((entry) => entry.table));
    expect(touchedTables.has('rentals')).toBe(false);
    expect(touchedTables.has('cars')).toBe(false);
    expect(touchedTables.has('fleet_imports')).toBe(false);
    expect(tables.rentals).toHaveLength(0);
    // Reconciliation records identity only; application status is untouched.
    expect(tables.applications[0].status).toBe('Paid');
  });
});

describe('persistCheckoutRelationshipFromSession', () => {
  it('ignores a session that is not a Maple vehicle checkout', async () => {
    seedPaidApplication();

    const result = await persistCheckoutRelationshipFromSession({
      customer: CUSTOMER_ID,
      id: 'cs_other',
      metadata: { application_id: APPLICATION_ID, checkout_kind: 'other', payment_link_version: '2' },
      subscription: SUBSCRIPTION_ID,
    } as never);

    expect(result).toBeNull();
    expect(tables.customers).toHaveLength(0);
  });

  it('ignores a session with no subscription rather than guessing identity', async () => {
    seedPaidApplication();

    const result = await persistCheckoutRelationshipFromSession({
      customer: CUSTOMER_ID,
      id: 'cs_no_sub',
      metadata: { application_id: APPLICATION_ID, checkout_kind: 'vehicle', payment_link_version: '2' },
      subscription: null,
    } as never);

    expect(result).toBeNull();
    expect(tables.customers).toHaveLength(0);
  });
});

describe('listPendingRentalActivations', () => {
  it('returns paid verified subscriptions with no rental identifier attached', async () => {
    seedPaidApplication({
      stripe_customer_id: CUSTOMER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
    });

    const pending = await listPendingRentalActivations();

    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      application_id: APPLICATION_ID,
      approved_vehicle: 'ABC123',
      stripe_subscription_id: SUBSCRIPTION_ID,
    });
    // No rentals.id exists, so rental-only actions are not representable.
    expect(pending[0]).not.toHaveProperty('id');
  });

  it('excludes an application that already has a live rental', async () => {
    seedPaidApplication({
      stripe_customer_id: CUSTOMER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
    });
    tables.rentals.push({ application_id: APPLICATION_ID, id: 1, status: 'Active' });

    await expect(listPendingRentalActivations()).resolves.toHaveLength(0);
  });

  it('still lists an application whose only rental is historical', async () => {
    seedPaidApplication({
      stripe_customer_id: CUSTOMER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
    });
    tables.rentals.push({ application_id: APPLICATION_ID, id: 1, status: 'Cancelled' });

    await expect(listPendingRentalActivations()).resolves.toHaveLength(1);
  });
});

describe('activateRentalForApplication', () => {
  it('creates exactly one rental from server-derived approved values', async () => {
    seedPaidApplication({
      stripe_customer_id: CUSTOMER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
    });
    mockSubscriptionsRetrieve.mockResolvedValue(activeSubscription());

    const result = await activateRentalForApplication(APPLICATION_ID, 'admin@example.com');

    expect(result.created).toBe(true);
    expect(tables.rentals).toHaveLength(1);
    expect(tables.rentals[0]).toMatchObject({
      application_id: APPLICATION_ID,
      start_date: '2026-09-01',
      status: 'Active',
      stripe_customer_id: CUSTOMER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
      vehicle_registration: 'ABC123',
      weekly_price: 350,
    });
    expect(mockRecordAdminAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('does not write a bond amount, because bond never flows through Stripe', async () => {
    seedPaidApplication({
      stripe_customer_id: CUSTOMER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
    });
    mockSubscriptionsRetrieve.mockResolvedValue(activeSubscription());

    await activateRentalForApplication(APPLICATION_ID, 'admin@example.com');

    expect(tables.rentals[0]).not.toHaveProperty('bond_paid');
  });

  it('is idempotent when activated twice', async () => {
    seedPaidApplication({
      stripe_customer_id: CUSTOMER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
    });
    mockSubscriptionsRetrieve.mockResolvedValue(activeSubscription());

    const first = await activateRentalForApplication(APPLICATION_ID, 'admin@example.com');
    const second = await activateRentalForApplication(APPLICATION_ID, 'admin@example.com');

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(tables.rentals).toHaveLength(1);
    expect(mockRecordAdminAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('activates despite a historical cancelled rental instead of returning it', async () => {
    seedPaidApplication({
      stripe_customer_id: CUSTOMER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
    });
    tables.rentals.push({
      application_id: APPLICATION_ID,
      id: 900,
      status: 'Cancelled',
      stripe_subscription_id: 'sub_old',
    });
    mockSubscriptionsRetrieve.mockResolvedValue(activeSubscription());

    const result = await activateRentalForApplication(APPLICATION_ID, 'admin@example.com');

    expect(result.created).toBe(true);
    expect(result.rental.id).not.toBe(900);
    expect(tables.rentals).toHaveLength(2);
  });

  it('rejects an application that is not Paid', async () => {
    seedPaidApplication({
      status: 'Approved',
      stripe_customer_id: CUSTOMER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
    });

    await expect(
      activateRentalForApplication(APPLICATION_ID, 'admin@example.com')
    ).rejects.toMatchObject({ code: 'application_not_paid' });

    expect(tables.rentals).toHaveLength(0);
  });

  it('rejects activation when no verified Stripe identity is linked', async () => {
    seedPaidApplication();

    await expect(
      activateRentalForApplication(APPLICATION_ID, 'admin@example.com')
    ).rejects.toMatchObject({ code: 'stripe_identity_missing' });

    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it.each(['past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'canceled', 'paused'])(
    'refuses to activate a subscription in %s state',
    async (status) => {
      seedPaidApplication({
        stripe_customer_id: CUSTOMER_ID,
        stripe_subscription_id: SUBSCRIPTION_ID,
      });
      mockSubscriptionsRetrieve.mockResolvedValue(activeSubscription({ status }));

      await expect(
        activateRentalForApplication(APPLICATION_ID, 'admin@example.com')
      ).rejects.toMatchObject({ code: 'subscription_not_activatable' });

      expect(tables.rentals).toHaveLength(0);
    }
  );

  it('rejects a subscription owned by a different Stripe customer', async () => {
    seedPaidApplication({
      stripe_customer_id: CUSTOMER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
    });
    mockSubscriptionsRetrieve.mockResolvedValue(
      activeSubscription({ customer: 'cus_someone_else' })
    );

    await expect(
      activateRentalForApplication(APPLICATION_ID, 'admin@example.com')
    ).rejects.toMatchObject({ code: 'stripe_identity_mismatch' });
  });

  it('rejects a subscription whose metadata names another application', async () => {
    seedPaidApplication({
      stripe_customer_id: CUSTOMER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
    });
    mockSubscriptionsRetrieve.mockResolvedValue(
      activeSubscription({ metadata: { application_id: OTHER_APPLICATION_ID } })
    );

    await expect(
      activateRentalForApplication(APPLICATION_ID, 'admin@example.com')
    ).rejects.toMatchObject({ code: 'stripe_identity_mismatch' });
  });

  it('refuses to invent a start date when the approved one is invalid', async () => {
    seedPaidApplication({
      intended_start_date: null,
      stripe_customer_id: CUSTOMER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
    });
    mockSubscriptionsRetrieve.mockResolvedValue(activeSubscription());

    await expect(
      activateRentalForApplication(APPLICATION_ID, 'admin@example.com')
    ).rejects.toMatchObject({ code: 'start_date_invalid' });

    expect(tables.rentals).toHaveLength(0);
  });

  it('rejects an application with no approved weekly price', async () => {
    seedPaidApplication({
      approved_weekly_price: 0,
      stripe_customer_id: CUSTOMER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
    });
    mockSubscriptionsRetrieve.mockResolvedValue(activeSubscription());

    await expect(
      activateRentalForApplication(APPLICATION_ID, 'admin@example.com')
    ).rejects.toMatchObject({ code: 'approved_price_invalid' });
  });

  it('rejects an application with no approved vehicle registration', async () => {
    seedPaidApplication({
      approved_vehicle: '   ',
      stripe_customer_id: CUSTOMER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
    });
    mockSubscriptionsRetrieve.mockResolvedValue(activeSubscription());

    await expect(
      activateRentalForApplication(APPLICATION_ID, 'admin@example.com')
    ).rejects.toMatchObject({ code: 'approved_vehicle_missing' });
  });

  it('never mutates fleet or vehicle state during activation', async () => {
    seedPaidApplication({
      stripe_customer_id: CUSTOMER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
    });
    mockSubscriptionsRetrieve.mockResolvedValue(activeSubscription());

    await activateRentalForApplication(APPLICATION_ID, 'admin@example.com');

    const touchedTables = new Set(writeLog.map((entry) => entry.table));
    expect(touchedTables.has('cars')).toBe(false);
    expect(touchedTables.has('fleet_imports')).toBe(false);
    // The rental carries approved registration text, never a vehicle id.
    expect(tables.rentals[0]).not.toHaveProperty('car_id');
  });

  it('surfaces a missing application as a 404 lifecycle error', async () => {
    await expect(
      activateRentalForApplication(APPLICATION_ID, 'admin@example.com')
    ).rejects.toMatchObject({ code: 'application_missing', status: 404 });
  });

  it('reports lifecycle failures as PaymentLifecycleError', async () => {
    seedPaidApplication({ status: 'Approved' });

    await expect(
      activateRentalForApplication(APPLICATION_ID, 'admin@example.com')
    ).rejects.toBeInstanceOf(PaymentLifecycleError);
  });
});
