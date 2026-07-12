import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  applications: [] as Array<Record<string, any>>,
  bookings: [] as Array<Record<string, any>>,
  cars: [] as Array<Record<string, any>>,
  customers: [] as Array<Record<string, any>>,
  lease_agreements: [] as Array<Record<string, any>>,
  rentals: [] as Array<Record<string, any>>,
  invoices: [] as Array<Record<string, any>>,
  manual_invoices: [] as Array<Record<string, any>>,
  manual_invoice_items: [] as Array<Record<string, any>>,
  invoice_items: [] as Array<Record<string, any>>,
  invoice_line_items: [] as Array<Record<string, any>>,
  payments: [] as Array<Record<string, any>>,
  financial_transactions: [] as Array<Record<string, any>>,
  stripe_webhook_events: [] as Array<Record<string, any>>,
  toll_transfer_notices: [] as Array<Record<string, any>>,
  toll_transfer_notice_audit_events: [] as Array<Record<string, any>>,
  maintenance_reset_audit_events: [] as Array<Record<string, any>>,
  deleteOrder: [] as string[],
  failOnStep: null as string | null,
  missingTables: new Set<string>(),
}));

const postgresMockState = vi.hoisted(() => ({
  useDirectConnection: false,
  concurrentQueryDetected: false,
  queryLog: [] as string[],
  rollbackAttempts: 0,
}));

vi.hoisted(() => {
  process.env.VITEST = 'true';
});

const matchesFilter = (
  row: Record<string, any>,
  filter: { column: string; op: string; value: unknown },
) => {
  if (filter.op === 'eq') return String(row[filter.column]) === String(filter.value);
  if (filter.op === 'in') {
    return (
      Array.isArray(filter.value) &&
      filter.value.some((value) => String(value) === String(row[filter.column]))
    );
  }
  if (filter.op === 'not.is') return row[filter.column] != null;
  return true;
};

const cloneResetState = () => ({
  applications: structuredClone(mockState.applications),
  bookings: structuredClone(mockState.bookings),
  cars: structuredClone(mockState.cars),
  customers: structuredClone(mockState.customers),
  lease_agreements: structuredClone(mockState.lease_agreements),
  rentals: structuredClone(mockState.rentals),
  invoices: structuredClone(mockState.invoices),
  manual_invoices: structuredClone(mockState.manual_invoices),
  manual_invoice_items: structuredClone(mockState.manual_invoice_items),
  invoice_items: structuredClone(mockState.invoice_items),
  invoice_line_items: structuredClone(mockState.invoice_line_items),
  payments: structuredClone(mockState.payments),
  financial_transactions: structuredClone(mockState.financial_transactions),
  stripe_webhook_events: structuredClone(mockState.stripe_webhook_events),
  toll_transfer_notices: structuredClone(mockState.toll_transfer_notices),
  toll_transfer_notice_audit_events: structuredClone(mockState.toll_transfer_notice_audit_events),
  maintenance_reset_audit_events: structuredClone(mockState.maintenance_reset_audit_events),
  deleteOrder: structuredClone(mockState.deleteOrder),
});

const restoreResetState = (snapshot: ReturnType<typeof cloneResetState>) => {
  mockState.applications = snapshot.applications;
  mockState.bookings = snapshot.bookings;
  mockState.cars = snapshot.cars;
  mockState.customers = snapshot.customers;
  mockState.lease_agreements = snapshot.lease_agreements;
  mockState.rentals = snapshot.rentals;
  mockState.invoices = snapshot.invoices;
  mockState.manual_invoices = snapshot.manual_invoices;
  mockState.manual_invoice_items = snapshot.manual_invoice_items;
  mockState.invoice_items = snapshot.invoice_items;
  mockState.invoice_line_items = snapshot.invoice_line_items;
  mockState.payments = snapshot.payments;
  mockState.financial_transactions = snapshot.financial_transactions;
  mockState.stripe_webhook_events = snapshot.stripe_webhook_events;
  mockState.toll_transfer_notices = snapshot.toll_transfer_notices;
  mockState.toll_transfer_notice_audit_events = snapshot.toll_transfer_notice_audit_events;
  mockState.maintenance_reset_audit_events = snapshot.maintenance_reset_audit_events;
  mockState.deleteOrder = snapshot.deleteOrder;
};

const getTableRows = (table: string) =>
  (((mockState as unknown as Record<string, Array<Record<string, any>>>)[table]) || []);

const setTableRows = (table: string, rows: Array<Record<string, any>>) => {
  (mockState as unknown as Record<string, Array<Record<string, any>>>)[table] = rows;
};

const createDirectClient = (options?: { detectConcurrency?: boolean }) => {
  let queryInFlight = false;

  return {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      postgresMockState.queryLog.push(normalizedSql);

      if (options?.detectConcurrency && queryInFlight) {
        postgresMockState.concurrentQueryDetected = true;
        throw new Error('Concurrent query detected on single PoolClient');
      }

      queryInFlight = true;

      try {
        await Promise.resolve();

        if (normalizedSql === 'BEGIN' || normalizedSql === 'COMMIT' || normalizedSql === 'ROLLBACK') {
          return { rowCount: null, rows: [] };
        }

        if (normalizedSql.startsWith('SELECT pg_advisory_xact_lock(')) {
          return { rowCount: 1, rows: [{ pg_advisory_xact_lock: null }] };
        }

        if (normalizedSql.includes('FROM information_schema.tables')) {
          const tableNames = Array.isArray(values[0]) ? (values[0] as string[]) : [];
          return {
            rowCount: tableNames.length,
            rows: tableNames
              .filter((tableName) => !mockState.missingTables.has(String(tableName)))
              .map((tableName) => ({ table_name: tableName })),
          };
        }

        const selectMatch = normalizedSql.match(/^SELECT \* FROM public\."([^"]+)"$/);
        if (selectMatch) {
          const [, table] = selectMatch;
          if (mockState.missingTables.has(table)) {
            throw { code: '42P01', message: `relation "${table}" does not exist` };
          }

          return {
            rowCount: getTableRows(table).length,
            rows: structuredClone(getTableRows(table)),
          };
        }

        const countMatch = normalizedSql.match(
          /^SELECT count\(\*\)::int AS count FROM public\."([^"]+)"$/,
        );
        if (countMatch) {
          const [, table] = countMatch;
          if (mockState.missingTables.has(table)) {
            throw { code: '42P01', message: `relation "${table}" does not exist` };
          }

          return {
            rowCount: 1,
            rows: [{ count: getTableRows(table).length }],
          };
        }

        const deleteMatch = normalizedSql.match(
          /^DELETE FROM public\."([^"]+)" WHERE id::text = ANY\(\$1::text\[\]\)$/,
        );
        if (deleteMatch) {
          const [, table] = deleteMatch;
          if (mockState.failOnStep === table) {
            throw { code: '23503', message: 'fk violation' };
          }

          const ids = Array.isArray(values[0]) ? (values[0] as string[]) : [];
          const rows = getTableRows(table);
          const remainingRows = rows.filter((row) => !ids.includes(String(row.id)));
          const deletedCount = rows.length - remainingRows.length;
          if (deletedCount > 0) {
            mockState.deleteOrder.push(table);
          }
          setTableRows(table, remainingRows);

          return {
            rowCount: deletedCount,
            rows: [],
          };
        }

        if (normalizedSql.startsWith('INSERT INTO public.maintenance_reset_audit_events')) {
          if (mockState.missingTables.has('maintenance_reset_audit_events')) {
            throw {
              code: '42P01',
              message: 'relation "maintenance_reset_audit_events" does not exist',
            };
          }

          mockState.maintenance_reset_audit_events.push({
            action: values[0],
            actor: values[1],
            metadata: values[2],
          });
          return { rowCount: 1, rows: [] };
        }

        throw new Error(`Unexpected PostgreSQL query in test: ${normalizedSql}`);
      } finally {
        queryInFlight = false;
      }
    }),
  };
};

vi.mock('../db/index.js', () => ({
  db: {
    from: (table: string) => {
      const state = mockState;
      const query: any = {
        _table: table,
        _action: 'select',
        _selectOptions: undefined as any,
        _filters: [] as Array<{ column: string; op: string; value: unknown }>,
        select(_columns: string, _options?: unknown) {
          query._selectOptions = _options;
          return query;
        },
        eq(column: string, value: unknown) {
          query._filters.push({ column, op: 'eq', value });
          return query;
        },
        in(column: string, value: unknown[]) {
          query._filters.push({ column, op: 'in', value });
          return query;
        },
        not(column: string, op: string, value: unknown) {
          query._filters.push({ column, op: `not.${op}`, value });
          return query;
        },
        delete() {
          query._action = 'delete';
          return query;
        },
        async maybeSingle() {
          const rows = await query;
          return { data: rows.data?.[0] ?? null, error: rows.error ?? null };
        },
        async single() {
          return query.maybeSingle();
        },
        then(
          onFulfilled: (value: {
            data: Array<Record<string, any>> | null;
            error: any;
          }) => unknown,
        ) {
          if (state.missingTables.has(table)) {
            const missingTableError =
              table === 'invoice_line_items'
                ? {
                    code: 'PGRST205',
                    message: 'Could not find table public.invoice_line_items in the schema cache',
                  }
                : { code: '42P01', message: `relation "${table}" does not exist` };
            return Promise.resolve(onFulfilled({ data: null, error: missingTableError }));
          }
          const rows = (state as unknown as Record<string, Array<Record<string, any>>>)[table] || [];
          const filtered = rows.filter((row: Record<string, any>) =>
            query._filters.every((filter: { column: string; op: string; value: unknown }) =>
              matchesFilter(row, filter),
            ),
          );
          if (
            query._selectOptions &&
            typeof query._selectOptions === 'object' &&
            (query._selectOptions as any).head
          ) {
            return Promise.resolve(
              onFulfilled({ data: null, error: null, count: filtered.length } as any),
            );
          }
          if (query._action === 'delete') {
            if (state.failOnStep === table) {
              return Promise.resolve(
                onFulfilled({ data: null, error: { code: '23503', message: 'fk violation' } }),
              );
            }
            if (
              table === 'invoice_line_items' &&
              state.financial_transactions.some((transaction) =>
                filtered.some(
                  (row: Record<string, any>) =>
                    String(transaction.invoice_line_item_id) === String(row.id),
                ),
              )
            ) {
              return Promise.resolve(
                onFulfilled({ data: null, error: { code: '23503', message: 'fk violation' } }),
              );
            }
            state.deleteOrder.push(table);
            const remaining = rows.filter(
              (row: Record<string, any>) =>
                !query._filters.every((filter: { column: string; op: string; value: unknown }) =>
                  matchesFilter(row, filter),
                ),
            );
            (state as unknown as Record<string, Array<Record<string, any>>>)[table] = remaining;
            return Promise.resolve(onFulfilled({ data: [], error: null }));
          }
          return Promise.resolve(onFulfilled({ data: filtered, error: null }));
        },
      };
      return query;
    },
  },
}));

vi.mock('../db/postgres.js', () => ({
  hasDirectDatabaseConnection: vi.fn(() => postgresMockState.useDirectConnection),
  withPostgresTransaction: vi.fn(
    async (callback: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
      const snapshot = cloneResetState();
      const client = createDirectClient();

      try {
        return await callback(client);
      } catch (error) {
        postgresMockState.rollbackAttempts += 1;
        restoreResetState(snapshot);
        if (error && typeof error === 'object') {
          Object.assign(error as Record<string, unknown>, {
            rollbackSucceeded: true,
            rollbackErrorCode: null,
          });
        }
        throw error;
      }
    },
  ),
}));

import {
  getImportedDataResetPlan,
  resetImportedDataAndFinancials,
} from '../adminMaintenanceReset.js';

describe('adminMaintenanceReset', () => {
  beforeEach(() => {
    process.env.MAPLE_ENABLE_IMPORTED_DATA_RESET = 'true';
    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
    mockState.applications = [
      {
        id: 'app-1',
        email: 'legacy-cno40s@example.invalid',
        experience: 'Imported from live fleet data on 2026-05-17.',
        legacy_id: 101,
        license_number: 'LEGACY-CNO40S',
        phone: '0000000000',
      },
      {
        id: 'app-2',
        email: 'real.driver@example.com',
        experience: 'Manually created by admin',
        legacy_id: null,
        license_number: 'NSW123456',
        phone: '0412345678',
      },
    ];
    mockState.bookings = [
      { id: 'booking-1', application_id: 'app-1' },
      { id: 'booking-2', application_id: 'app-2' },
    ];
    mockState.cars = [{ id: 1, name: 'Toyota Camry (CNO40S)', status: 'Rented' }];
    mockState.customers = [
      { id: 'cust-1', source: 'legacy-import', application_id: 'app-1' },
      { id: 'cust-2', source: 'current' },
    ];
    mockState.lease_agreements = [
      { id: 'lease-1', application_id: 'app-1' },
      { id: 'lease-2', application_id: 'app-2' },
    ];
    mockState.rentals = [
      { id: 'rent-1', application_id: 'app-1', legacy_application_id: 101 },
      {
        id: 'rent-2',
        application_id: 'app-2',
        legacy_application_id: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
      },
    ];
    mockState.invoices = [
      { id: 'inv-1', source: 'legacy-import' },
      { id: 'inv-2', source: 'current' },
    ];
    mockState.manual_invoices = [
      { id: 'm-1', invoice_number: 'LEGACY-MANUAL-001' },
      { id: 'm-2', invoice_number: 'MR-REAL-001' },
    ];
    mockState.manual_invoice_items = [
      { id: 'mi-1', invoice_id: 'm-1' },
      { id: 'mi-2', invoice_id: 'm-2' },
    ];
    mockState.invoice_items = [{ id: 'ii-1', invoice_id: 'inv-1' }];
    mockState.invoice_line_items = [{ id: 'ill-1', invoice_id: 'inv-1' }];
    mockState.payments = [{ id: 'pay-1', invoice_id: 'inv-1' }];
    mockState.financial_transactions = [{ id: 'ft-1', invoice_line_item_id: 'ill-1' }];
    mockState.stripe_webhook_events = [{ id: 'event-1', stripe_event_id: 'evt_1' }];
    mockState.toll_transfer_notices = [
      { id: 'notice-1', application_id: 'app-1', rental_id: 'rent-1' },
      { id: 'notice-2', application_id: 'app-2', rental_id: 'rent-2' },
    ];
    mockState.toll_transfer_notice_audit_events = [
      { id: 'audit-1', toll_transfer_notice_id: 'notice-1' },
      { id: 'audit-2', toll_transfer_notice_id: 'notice-2' },
    ];
    mockState.maintenance_reset_audit_events = [];
    mockState.deleteOrder = [];
    mockState.failOnStep = null;
    mockState.missingTables = new Set<string>();
    postgresMockState.useDirectConnection = false;
    postgresMockState.concurrentQueryDetected = false;
    postgresMockState.queryLog = [];
    postgresMockState.rollbackAttempts = 0;
  });

  it('dry run does not mutate data', async () => {
    const before = structuredClone(mockState);
    const plan = await getImportedDataResetPlan();
    expect(plan.counts.applications).toBe(1);
    expect(plan.counts.rentals).toBe(1);
    expect((plan.counts as any).tollTransferNotices).toBe(1);
    expect(mockState).toEqual(before);
  });

  it('deletes imported children before parents and preserves real records', async () => {
    const result = await resetImportedDataAndFinancials();
    expect((result.counts as any).tollTransferNoticeAuditEvents).toBe(1);
    expect((result.counts as any).tollTransferNotices).toBe(1);
    expect((result.counts as any).leaseAgreements).toBe(1);
    expect((result.counts as any).bookings).toBe(1);
    expect(result.counts.manualInvoices).toBe(1);
    expect(result.counts.manualInvoiceItems).toBe(1);
    expect(result.counts.rentals).toBe(1);
    expect(result.counts.applications).toBe(1);
    expect(result.counts.customers).toBe(1);
    expect(result.counts.stripeWebhookEvents).toBe(0);
    expect(mockState.deleteOrder).toEqual(
      expect.arrayContaining([
        'toll_transfer_notice_audit_events',
        'toll_transfer_notices',
        'manual_invoice_items',
        'manual_invoices',
        'financial_transactions',
        'payments',
        'invoice_items',
        'invoice_line_items',
        'invoices',
        'lease_agreements',
        'bookings',
        'rentals',
        'applications',
        'customers',
      ]),
    );
    expect(mockState.deleteOrder.indexOf('toll_transfer_notice_audit_events')).toBeLessThan(
      mockState.deleteOrder.indexOf('toll_transfer_notices'),
    );
    expect(mockState.deleteOrder.indexOf('rentals')).toBeLessThan(
      mockState.deleteOrder.indexOf('applications'),
    );
    expect(mockState.customers).toHaveLength(1);
    expect(mockState.customers[0].id).toBe('cust-2');
    expect(mockState.applications.map((row) => row.id)).toEqual(['app-2']);
    expect(mockState.rentals.map((row) => row.id)).toEqual(['rent-2']);
    expect(mockState.manual_invoices.map((row) => row.id)).toEqual(['m-2']);
    expect(mockState.manual_invoice_items.map((row) => row.id)).toEqual(['mi-2']);
    expect(mockState.toll_transfer_notices.map((row) => row.id)).toEqual(['notice-2']);
    expect(mockState.toll_transfer_notice_audit_events.map((row) => row.id)).toEqual(['audit-2']);
    expect(mockState.lease_agreements.map((row) => row.id)).toEqual(['lease-2']);
    expect(mockState.bookings.map((row) => row.id)).toEqual(['booking-2']);
    expect(mockState.cars).toHaveLength(1);
    expect(mockState.stripe_webhook_events).toHaveLength(1);
  });

  it('returns a failing step when a delete fails', async () => {
    mockState.failOnStep = 'rentals';
    await expect(resetImportedDataAndFinancials()).rejects.toMatchObject({
      step: 'delete_rentals',
      message: 'Reset failed while deleting rentals rows.',
    });
  });

  it('skips missing invoice child tables safely', async () => {
    mockState.missingTables = new Set(['invoice_items', 'payments']);

    const result = await resetImportedDataAndFinancials();

    expect(result.counts.invoices).toBe(1);
    expect(result.skippedInvoiceDependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: 'invoice_items', skipped: true }),
        expect.objectContaining({ table: 'payments', skipped: true }),
      ]),
    );
  });

  it('skips an absent legacy invoice_line_items table while using manual_invoice_items', async () => {
    mockState.missingTables = new Set(['invoice_line_items']);

    const plan = await getImportedDataResetPlan();

    expect(plan.skipped.invoiceLineItems).toBe(true);
    expect(plan.counts.invoiceLineItems).toBe(0);
    expect(plan.counts.manualInvoiceItems).toBe(1);
  });

  it('rejects destructive reset when the feature flag is absent', async () => {
    delete process.env.MAPLE_ENABLE_IMPORTED_DATA_RESET;

    await expect(resetImportedDataAndFinancials()).rejects.toMatchObject({
      code: 'MAINTENANCE_RESET_DISABLED',
    });
  });

  it('executes direct-client planning sequentially on one PoolClient', async () => {
    const client = createDirectClient({ detectConcurrency: true });

    const plan = await getImportedDataResetPlan(client as never);

    expect(plan.counts.applications).toBe(1);
    expect(postgresMockState.concurrentQueryDetected).toBe(false);
  });

  it('preflights optional direct-Postgres tables instead of aborting the transaction', async () => {
    mockState.missingTables = new Set([
      'invoice_items',
      'invoice_line_items',
      'payments',
      'financial_transactions',
    ]);
    const client = createDirectClient({ detectConcurrency: true });

    const plan = await getImportedDataResetPlan(client as never);

    expect(plan.skipped.invoiceItems).toBe(true);
    expect(plan.skipped.invoiceLineItems).toBe(true);
    expect(plan.skipped.payments).toBe(true);
    expect(plan.skipped.financialTransactions).toBe(true);
    expect(postgresMockState.queryLog.some((sql) => sql.includes('SELECT * FROM public."invoice_items"'))).toBe(false);
    expect(postgresMockState.concurrentQueryDetected).toBe(false);
  });

  it('rolls back all earlier deletions after a later required-table failure in a transaction', async () => {
    process.env.NODE_ENV = 'development';
    process.env.VITEST = '';
    postgresMockState.useDirectConnection = true;
    mockState.failOnStep = 'applications';
    const before = cloneResetState();

    await expect(resetImportedDataAndFinancials()).rejects.toMatchObject({
      step: 'delete_applications',
      rollbackSucceeded: true,
    });

    expect(postgresMockState.rollbackAttempts).toBe(1);
    expect(mockState.deleteOrder).toEqual(before.deleteOrder);
    expect(mockState.applications).toEqual(before.applications);
    expect(mockState.rentals).toEqual(before.rentals);
    expect(mockState.invoices).toEqual(before.invoices);
    expect(mockState.stripe_webhook_events).toEqual(before.stripe_webhook_events);
  });
});
