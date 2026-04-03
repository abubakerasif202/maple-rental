import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { getTodayInAustralia } from '../../shared/applicationSubmission.js';

const addDaysToDateOnly = (dateOnly: string, days: number) => {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

const getFutureDateOnly = (days: number) =>
  addDaysToDateOnly(getTodayInAustralia(), days);

const getPastDateOnly = (days: number) =>
  addDaysToDateOnly(getTodayInAustralia(), -days);

const PENDING_APPLICATION_ID = '11111111-1111-4111-8111-111111111111';
const APPROVED_APPLICATION_ID = '22222222-2222-4222-8222-222222222222';
const UNDERSCORE_APPLICATION_ID = '33333333-3333-4333-8333-333333333333';
const UNDERSCORE_REJECTED_APPLICATION_ID = '44444444-4444-4444-8444-444444444444';
const BLOCKING_APPLICATION_ID = '99999999-9999-4999-8999-999999999999';
const UNKNOWN_APPLICATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

type ApplicationSubmissionFields = {
  selected_car_id: string | number;
  name: string;
  phone: string;
  email: string;
  license_number: string;
  license_expiry: string;
  uber_status: string;
  experience: string;
  address: string;
  weekly_budget: string;
  intended_start_date: string;
};

type ApplicationUploadFixture = {
  buffer: Buffer;
  contentType: string;
  filename: string;
};

type ApplicationSubmissionOverrides = Partial<
  ApplicationSubmissionFields & {
    license_photo: string | ApplicationUploadFixture;
    license_back_photo: string | ApplicationUploadFixture;
  }
>;

const DEFAULT_APPLICATION_UPLOAD: ApplicationUploadFixture = {
  buffer: Buffer.from('fake-image'),
  contentType: 'image/png',
  filename: 'license.png',
};

const buildApplicationUploadFixture = (
  value: string | ApplicationUploadFixture | undefined,
  basename: string
): ApplicationUploadFixture => {
  if (!value) {
    return {
      ...DEFAULT_APPLICATION_UPLOAD,
      filename: `${basename}.png`,
    };
  }

  if (typeof value !== 'string') {
    return value;
  }

  const dataUrlMatch = value.match(/^data:(.+);base64,(.+)$/);
  if (!dataUrlMatch) {
    throw new Error(`Unsupported test upload fixture for ${basename}`);
  }

  const [, contentType, encoded] = dataUrlMatch;
  const extension =
    contentType === 'image/jpeg'
      ? 'jpg'
      : contentType === 'image/png'
        ? 'png'
        : contentType.split('/').at(-1) || 'bin';

  return {
    buffer: Buffer.from(encoded, 'base64'),
    contentType,
    filename: `${basename}.${extension}`,
  };
};

const createApplicationSubmissionRequest = (
  overrides: ApplicationSubmissionOverrides = {}
) => {
  const { license_photo, license_back_photo, ...fieldOverrides } = overrides;
  const payload: ApplicationSubmissionFields = {
    selected_car_id: '1',
    name: 'Jane Driver',
    phone: '0412345678',
    email: 'jane@example.com',
    license_number: 'NSW12345',
    license_expiry: getFutureDateOnly(365),
    uber_status: 'Active',
    experience: 'New Driver',
    address: '1 Test Street',
    weekly_budget: '$300/week',
    intended_start_date: getFutureDateOnly(7),
    ...fieldOverrides,
  };

  let req = request(app).post('/api/applications');
  Object.entries(payload).forEach(([key, value]) => {
    req = req.field(key, String(value));
  });

  const frontUpload = buildApplicationUploadFixture(license_photo, 'license');
  const backUpload = buildApplicationUploadFixture(
    license_back_photo,
    'license-back'
  );

  req = req.attach('license_photo', frontUpload.buffer, {
    contentType: frontUpload.contentType,
    filename: frontUpload.filename,
  });
  req = req.attach('license_back_photo', backUpload.buffer, {
    contentType: backUpload.contentType,
    filename: backUpload.filename,
  });

  return req;
};

const {
  mockState,
  mockGetUser,
  mockRefreshSession,
  mockSignInWithPassword,
  mockStorageFrom,
  mockCheckDBHealth,
  mockCreateAuthClient,
  mockClosePostgresPool,
  mockGetSupabaseAuthConfigurationIssues,
  mockGetSupabaseConfigurationIssues,
  mockHasDirectDatabaseConnection,
  mockWithPostgresAdvisoryLock,
  mockMutationErrors,
  mockResendEmailsSend,
  mockStripe,
} = vi.hoisted(() => ({
  mockState: {
    cars: [] as Array<Record<string, any>>,
    applications: [] as Array<Record<string, any>>,
    rentals: [] as Array<Record<string, any>>,
    lease_agreements: [] as Array<Record<string, any>>,
    customers: [] as Array<Record<string, any>>,
    invoices: [] as Array<Record<string, any>>,
    bookings: [] as Array<Record<string, any>>,
    stripe_webhook_events: [] as Array<Record<string, any>>,
  },
  mockGetUser: vi.fn(),
  mockRefreshSession: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockStorageFrom: vi.fn(),
  mockCheckDBHealth: vi.fn(),
  mockCreateAuthClient: vi.fn(),
  mockClosePostgresPool: vi.fn(async () => undefined),
  mockGetSupabaseAuthConfigurationIssues: vi.fn(() => []),
  mockGetSupabaseConfigurationIssues: vi.fn(() => []),
  mockHasDirectDatabaseConnection: vi.fn(() => false),
  mockWithPostgresAdvisoryLock: vi.fn(async (_lockKey: string, callback: () => Promise<unknown>) =>
    callback()
  ),
  mockMutationErrors: {
    applicationsUpdate: null as Record<string, any> | null,
  },
  mockResendEmailsSend: vi.fn(),
  mockStripe: {
    checkoutSessionsCreate: vi.fn(),
    checkoutSessionsExpire: vi.fn(),
    checkoutSessionsList: vi.fn(),
    checkoutSessionsRetrieve: vi.fn(),
    subscriptionsRetrieve: vi.fn(),
    webhooksConstructEvent: vi.fn(),
  },
}));

vi.mock('resend', () => {
  class MockResend {
    emails = {
      send: mockResendEmailsSend,
    };
  }

  return {
    Resend: MockResend,
  };
});

vi.mock('stripe', () => {
  class MockStripe {
    customers = { create: vi.fn() };
    products = { create: vi.fn() };
    prices = { create: vi.fn() };
    invoiceItems = { create: vi.fn() };
    subscriptions = { create: vi.fn(), retrieve: mockStripe.subscriptionsRetrieve };
    checkout = {
      sessions: {
        create: mockStripe.checkoutSessionsCreate,
        expire: mockStripe.checkoutSessionsExpire,
        list: mockStripe.checkoutSessionsList,
        retrieve: mockStripe.checkoutSessionsRetrieve,
      },
    };
    webhooks = {
      constructEvent: mockStripe.webhooksConstructEvent,
    };
    accounts = {
      create: vi.fn(),
      retrieve: vi.fn(),
    };
    accountLinks = {
      create: vi.fn(),
    };
    payouts = {
      list: vi.fn(),
    };
    balanceTransactions = {
      list: vi.fn(),
    };
  }

  return {
    default: MockStripe,
  };
});

vi.mock('../schemaCompat.js', async () => {
  const actual = await vi.importActual<typeof import('../schemaCompat.js')>(
    '../schemaCompat.js'
  );

  return {
    ...actual,
    getApplicationDuplicateCheckColumns: vi.fn(async () =>
      ['id', 'phone', 'email', 'license_number:licenseNumber', 'status'].join(', ')
    ),
    getApplicationSelectColumns: vi.fn(async () =>
      [
        'id',
        'name',
        'phone',
        'email',
        'license_number:licenseNumber',
        'license_expiry:licenseExpiry',
        'uber_status:uberStatus',
        'experience',
        'address',
        'weekly_budget:weeklyBudget',
        'intended_start_date:intendedStartDate',
        'license_photo:licensePhoto',
        'license_back_photo:uberScreenshot',
        'assigned_car_id:assignedCarId',
        'approved_bond:approvedBond',
        'approved_weekly_price:approvedWeeklyPrice',
        'payment_link_version:paymentLinkVersion',
        'payment_link_sent_at:paymentLinkSentAt',
        'approved_at:approvedAt',
        'paid_at:paidAt',
        'pending_checkout_session_id:pendingCheckoutSessionId',
        'status',
        'created_at:createdAt',
      ].join(', ')
    ),
  };
});

vi.mock('../db/index.js', () => {
  const getTableRows = (table: string) => {
    if (table === 'cars') {
      return mockState.cars;
    }

    if (table === 'applications') {
      return mockState.applications;
    }

    if (table === 'rentals') {
      return mockState.rentals;
    }

    if (table === 'lease_agreements') {
      return mockState.lease_agreements;
    }

    if (table === 'customers') {
      return mockState.customers;
    }

    if (table === 'invoices') {
      return mockState.invoices;
    }

    if (table === 'bookings') {
      return mockState.bookings;
    }

    if (table === 'stripe_webhook_events') {
      return mockState.stripe_webhook_events;
    }

    return [];
  };

  const setTableRows = (table: string, rows: Array<Record<string, any>>) => {
    if (table === 'cars') {
      mockState.cars = rows;
      return;
    }

    if (table === 'applications') {
      mockState.applications = rows;
      return;
    }

    if (table === 'rentals') {
      mockState.rentals = rows;
      return;
    }

    if (table === 'lease_agreements') {
      mockState.lease_agreements = rows;
      return;
    }

    if (table === 'customers') {
      mockState.customers = rows;
      return;
    }

    if (table === 'invoices') {
      mockState.invoices = rows;
      return;
    }

    if (table === 'bookings') {
      mockState.bookings = rows;
      return;
    }

    if (table === 'stripe_webhook_events') {
      mockState.stripe_webhook_events = rows;
    }
  };

  type QueryFilter =
    | { type: 'eq'; column: string; value: unknown }
    | { type: 'gte'; column: string; value: unknown }
    | { type: 'ilike'; column: string; pattern: string }
    | { type: 'in'; column: string; values: unknown[] }
    | { type: 'or'; clauses: Array<{ column: string; search: string }> };

  const applyFilters = (
    rows: Array<Record<string, any>>,
    filters: QueryFilter[]
  ) =>
    rows.filter((row) =>
      filters.every((filter) => {
        if (filter.type === 'eq') {
          return String(row[filter.column]) === String(filter.value);
        }

        if (filter.type === 'gte') {
          const left = row[filter.column];
          const right = filter.value;

          if (left == null || right == null) {
            return false;
          }

          const leftAsNumber = Number(left);
          const rightAsNumber = Number(right);
          if (Number.isFinite(leftAsNumber) && Number.isFinite(rightAsNumber)) {
            return leftAsNumber >= rightAsNumber;
          }

          const leftAsTime = Date.parse(String(left));
          const rightAsTime = Date.parse(String(right));
          if (Number.isFinite(leftAsTime) && Number.isFinite(rightAsTime)) {
            return leftAsTime >= rightAsTime;
          }

          return String(left) >= String(right);
        }

        if (filter.type === 'ilike') {
          const source = String(row[filter.column] ?? '');
          const escapedPattern = filter.pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/[%*]/g, '.*')
            .replace(/_/g, '.');

          return new RegExp(`^${escapedPattern}$`, 'i').test(source);
        }

        if (filter.type === 'in') {
          return filter.values.some((value) => String(row[filter.column]) === String(value));
        }

        return filter.clauses.some(({ column, search }) =>
          String(row[column] || '').toLowerCase().includes(search.toLowerCase())
        );
      })
    );

  const applyOrder = (
    rows: Array<Record<string, any>>,
    order?: { column: string; ascending: boolean } | null
  ) => {
    if (!order) {
      return rows;
    }

    return [...rows].sort((left, right) => {
      const leftValue = left[order.column];
      const rightValue = right[order.column];

      if (leftValue === rightValue) {
        return 0;
      }

      if (leftValue == null) {
        return order.ascending ? -1 : 1;
      }

      if (rightValue == null) {
        return order.ascending ? 1 : -1;
      }

      if (leftValue > rightValue) {
        return order.ascending ? 1 : -1;
      }

      return order.ascending ? -1 : 1;
    });
  };

  const applyRange = (
    rows: Array<Record<string, any>>,
    range?: { from: number; to: number } | null
  ) => {
    if (!range) {
      return rows;
    }

    return rows.slice(range.from, range.to + 1);
  };

  const buildUuidFromSequence = (sequence: number) => {
    const prefix = String(sequence).padStart(8, '0');
    const suffix = String(sequence).padStart(12, '0');
    return `${prefix}-0000-4000-8000-${suffix}`;
  };

  const parseOrClauses = (expression: string) =>
    expression
      .split(',')
      .map((clause) => {
        const [column, operator, ...rest] = clause.split('.');

        if (!column || operator !== 'ilike') {
          return null;
        }

        const search = rest.join('.').replace(/^%+|%+$/g, '').replace(/^\*+|\*+$/g, '');
        return search ? { column, search } : null;
      })
      .filter((clause): clause is { column: string; search: string } => Boolean(clause));

  const createUnknownColumnError = (column: string) => {
    const camelColumnMap: Record<string, string> = {
      license_number: 'licenseNumber',
      license_expiry: 'licenseExpiry',
      license_photo: 'licensePhoto',
      license_back_photo: 'licenseBackPhoto',
    };

    return {
    code: '42703',
    details: null,
    hint: `Perhaps you meant to reference the column "applications.${camelColumnMap[column] ?? column}".`,
    message: `column applications.${column} does not exist`,
    };
  };

  const getInvalidApplicationSelectColumn = (columns?: string) => {
    if (typeof columns !== 'string') {
      return null;
    }

    const invalidColumns = ['license_number', 'license_expiry', 'license_photo', 'license_back_photo'];
    return (
      invalidColumns.find(
        (column) => columns.includes(column) && !columns.includes(`${column}:`)
      ) || null
    );
  };

  const createSelectQuery = (
    table: string,
    columns?: string,
    options: { count?: string; head?: boolean } = {},
    filters: QueryFilter[] = [],
    order?: { column: string; ascending: boolean } | null,
    range?: { from: number; to: number } | null
  ) => {
    const invalidApplicationColumn =
      table === 'applications' ? getInvalidApplicationSelectColumn(columns) : null;

    const resolveRows = async () => {
      if (invalidApplicationColumn) {
        return {
          data: null,
          error: createUnknownColumnError(invalidApplicationColumn),
          count: null,
        };
      }

      const filteredRows = applyFilters(getTableRows(table), filters);
      const orderedRows = applyOrder(filteredRows, order);
      const selectedRows = applyRange(orderedRows, range);

      return {
        data: options.head ? null : structuredClone(selectedRows),
        error: null,
        count: options.count === 'exact' ? filteredRows.length : null,
      };
    };

    return {
      then: (
        onFulfilled: (value: {
          data: Array<Record<string, any>> | null;
          error: null | Record<string, any>;
          count: number | null;
        }) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) => resolveRows().then(onFulfilled, onRejected),
      order: vi.fn((column: string, { ascending = true }: { ascending?: boolean } = {}) =>
        createSelectQuery(table, columns, options, filters, { column, ascending }, range)
      ),
      eq: vi.fn((column: string, value: unknown) =>
        createSelectQuery(table, columns, options, [...filters, { type: 'eq', column, value }], order, range)
      ),
      gte: vi.fn((column: string, value: unknown) =>
        createSelectQuery(table, columns, options, [...filters, { type: 'gte', column, value }], order, range)
      ),
      ilike: vi.fn((column: string, pattern: string) =>
        createSelectQuery(
          table,
          columns,
          options,
          [...filters, { type: 'ilike', column, pattern }],
          order,
          range
        )
      ),
      in: vi.fn((column: string, values: unknown[]) =>
        createSelectQuery(table, columns, options, [...filters, { type: 'in', column, values }], order, range)
      ),
      or: vi.fn((expression: string) => {
        const clauses = parseOrClauses(expression);
        return createSelectQuery(
          table,
          columns,
          options,
          clauses.length > 0 ? [...filters, { type: 'or', clauses }] : filters,
          order,
          range
        );
      }),
      range: vi.fn((from: number, to: number) =>
        createSelectQuery(table, columns, options, filters, order, { from, to })
      ),
      limit: vi.fn((count: number) =>
        createSelectQuery(table, columns, options, filters, order, {
          from: range?.from ?? 0,
          to: (range?.from ?? 0) + count - 1,
        })
      ),
      single: vi.fn(async () => {
        if (invalidApplicationColumn) {
          return { data: null, error: createUnknownColumnError(invalidApplicationColumn) };
        }

        const filteredRows = applyFilters(getTableRows(table), filters);
        const orderedRows = applyOrder(filteredRows, order);
        const [row] = applyRange(orderedRows, range);
        return row
          ? { data: structuredClone(row), error: null }
          : {
              data: null,
              error: {
                code: 'PGRST116',
                details: 'The result contains 0 rows',
                message: 'Not found',
              },
            };
      }),
      maybeSingle: vi.fn(async () => {
        if (invalidApplicationColumn) {
          return { data: null, error: createUnknownColumnError(invalidApplicationColumn) };
        }

        const filteredRows = applyFilters(getTableRows(table), filters);
        const orderedRows = applyOrder(filteredRows, order);
        const [row] = applyRange(orderedRows, range);
        return {
          data: row ? structuredClone(row) : null,
          error: null,
        };
      }),
    };
  };

  const createMutationQuery = (
    table: string,
    action: 'update' | 'delete',
    payload?: Record<string, any>,
    filters: QueryFilter[] = []
  ) => {
    const applyMutation = async () => {
      if (action === 'update' && table === 'applications' && mockMutationErrors.applicationsUpdate) {
        const error = structuredClone(mockMutationErrors.applicationsUpdate);
        mockMutationErrors.applicationsUpdate = null;
        return {
          data: null,
          error,
        };
      }

      const rows = getTableRows(table);
      const matchingRows = applyFilters(rows, filters);
      const nextRows =
        action === 'delete'
          ? rows.filter(
              (row) =>
                !matchingRows.some(
                  (matchingRow) => String(matchingRow.id) === String(row.id)
                )
            )
          : rows.map((row) =>
              matchingRows.some(
                (matchingRow) => String(matchingRow.id) === String(row.id)
              )
                ? { ...row, ...payload }
                : row
            );

      setTableRows(table, nextRows);

      const updatedRows =
        action === 'delete'
          ? []
          : nextRows.filter((row) =>
              matchingRows.some(
                (matchingRow) => String(matchingRow.id) === String(row.id)
              )
            );

      return {
        data: structuredClone(updatedRows),
        error: null,
      };
    };

    return {
      then: (
        onFulfilled: (value: {
          data: Array<Record<string, any>> | null;
          error: null | Record<string, any>;
        }) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) =>
        applyMutation().then(
          ({ error }) => onFulfilled({ data: null, error }),
          onRejected
        ),
      eq: vi.fn((column: string, value: unknown) =>
        createMutationQuery(table, action, payload, [
          ...filters,
          { type: 'eq', column, value },
        ])
      ),
      gte: vi.fn((column: string, value: unknown) =>
        createMutationQuery(table, action, payload, [
          ...filters,
          { type: 'gte', column, value },
        ])
      ),
      select: vi.fn(() => ({
        maybeSingle: vi.fn(async () => {
          const { data, error } = await applyMutation();
          return {
            data: data?.[0] ? structuredClone(data[0]) : null,
            error,
          };
        }),
        single: vi.fn(async () => {
          const { data, error } = await applyMutation();
          return data?.[0]
            ? {
                data: structuredClone(data[0]),
                error,
              }
            : {
                data: null,
                error:
                  error || {
                    code: 'PGRST116',
                    details: 'The result contains 0 rows',
                    message: 'Not found',
                  },
              };
        }),
      })),
    };
  };

  const createInsertQuery = (table: string, records: Array<Record<string, any>>) => {
    const currentRows = getTableRows(table);
    const nextSequence =
      table === 'applications' || table === 'invoices'
        ? currentRows.length + 1
        : currentRows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
    const nextId =
      table === 'applications' || table === 'invoices'
        ? buildUuidFromSequence(nextSequence)
        : nextSequence;
    const insertedRow: Record<string, any> = { ...records[0], id: nextId };

    if (
      table === 'stripe_webhook_events' &&
      typeof insertedRow.stripe_event_id === 'string' &&
      mockState.stripe_webhook_events.some(
        (event) => event.stripe_event_id === insertedRow.stripe_event_id
      )
    ) {
      return {
        error: {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "idx_stripe_webhook_events_event_id"',
        },
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: null, error: null })),
        })),
      };
    }

    if (table === 'stripe_webhook_events' && !insertedRow.received_at) {
      insertedRow.received_at = new Date().toISOString();
    }

    if (table === 'cars') {
      mockState.cars = [...mockState.cars, insertedRow];
    }

    if (table === 'applications') {
      mockState.applications = [...mockState.applications, insertedRow];
    }

    if (table === 'rentals') {
      mockState.rentals = [...mockState.rentals, insertedRow];
    }

    if (table === 'lease_agreements') {
      mockState.lease_agreements = [...mockState.lease_agreements, insertedRow];
    }

    if (table === 'customers') {
      mockState.customers = [...mockState.customers, insertedRow];
    }

    if (table === 'invoices') {
      mockState.invoices = [...mockState.invoices, insertedRow];
    }

    if (table === 'bookings') {
      mockState.bookings = [...mockState.bookings, insertedRow];
    }

    if (table === 'stripe_webhook_events') {
      mockState.stripe_webhook_events = [...mockState.stripe_webhook_events, insertedRow];
    }

    return {
      error: null,
      select: vi.fn(() => ({
        single: vi.fn(async () => ({ data: { id: insertedRow.id }, error: null })),
      })),
    };
  };

  return {
    db: {
      from: vi.fn((table: string) => ({
        select: vi.fn((columns?: string, options?: { count?: string; head?: boolean }) =>
          createSelectQuery(table, columns, options)
        ),
        insert: vi.fn((records: Array<Record<string, any>>) =>
          createInsertQuery(table, records)
        ),
        update: vi.fn((payload: Record<string, any>) =>
          createMutationQuery(table, 'update', payload)
        ),
        delete: vi.fn(() => createMutationQuery(table, 'delete')),
      })),
      storage: {
        from: mockStorageFrom,
        listBuckets: vi.fn(async () => ({ data: [], error: null })),
        createBucket: vi.fn(async () => ({ error: null })),
        updateBucket: vi.fn(async () => ({ error: null })),
      },
    },
    createAuthClient: mockCreateAuthClient,
    checkDBHealth: mockCheckDBHealth,
    getSupabaseAuthConfigurationIssues: mockGetSupabaseAuthConfigurationIssues,
    getSupabaseConfigurationIssues: mockGetSupabaseConfigurationIssues,
    initializeDB: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('../db/postgres.js', () => {
  const getTableRows = (table: string) => {
    if (table === 'cars') {
      return mockState.cars;
    }

    if (table === 'applications') {
      return mockState.applications;
    }

    if (table === 'rentals') {
      return mockState.rentals;
    }

    return [];
  };

  const setTableRows = (table: string, rows: Array<Record<string, any>>) => {
    if (table === 'cars') {
      mockState.cars = rows;
      return;
    }

    if (table === 'applications') {
      mockState.applications = rows;
      return;
    }

    if (table === 'rentals') {
      mockState.rentals = rows;
    }
  };

  const parseQuotedIdentifiers = (source: string) =>
    source
      .split(',')
      .map((segment) => segment.trim().match(/^"((?:[^"]|"")+)"/)?.[1]?.replace(/""/g, '"') || null)
      .filter((value): value is string => Boolean(value));

  const createTransactionalQuery = () =>
    vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.startsWith('SELECT status FROM cars WHERE id = $1 FOR UPDATE')) {
        const car = mockState.cars.find((row) => String(row.id) === String(values[0]));
        return {
          rowCount: car ? 1 : 0,
          rows: car ? [{ status: car.status }] : [],
        };
      }

      if (sql.startsWith('SELECT status, payment_link_version, assigned_car_id FROM applications WHERE id = $1 FOR UPDATE')) {
        const application = mockState.applications.find(
          (row) => String(row.id) === String(values[0])
        );
        return {
          rowCount: application ? 1 : 0,
          rows: application
            ? [
                {
                  assigned_car_id: application.assigned_car_id,
                  payment_link_version: application.payment_link_version,
                  status: application.status,
                },
              ]
            : [],
        };
      }

      if (sql.startsWith('INSERT INTO "rentals"')) {
        const columnsMatch = sql.match(/^INSERT INTO "rentals" \((.+)\) VALUES \(/);
        const columns = columnsMatch ? parseQuotedIdentifiers(columnsMatch[1]) : [];
        const nextId =
          mockState.rentals.reduce(
            (max, row) => Math.max(max, Number(row.id) || 0),
            0
          ) + 1;
        const insertedRow = columns.reduce<Record<string, unknown>>(
          (accumulator, column, index) => {
            accumulator[column] = values[index];
            return accumulator;
          },
          { id: nextId }
        );
        mockState.rentals = [...mockState.rentals, insertedRow];
        return { rowCount: 1, rows: [] };
      }

      const updateMatch = sql.match(/^UPDATE "([^"]+)" SET (.+) WHERE id = \$\d+$/);
      if (updateMatch) {
        const [, table, setClause] = updateMatch;
        const columns = parseQuotedIdentifiers(setClause);
        const rowId = String(values[values.length - 1]);
        const rows = getTableRows(table);
        let updated = false;
        const nextRows = rows.map((row) => {
          if (String(row.id) !== rowId) {
            return row;
          }

          updated = true;
          const nextRow = { ...row };
          columns.forEach((column, index) => {
            nextRow[column] = values[index];
          });
          return nextRow;
        });

        if (updated) {
          setTableRows(table, nextRows);
        }

        return {
          rowCount: updated ? 1 : 0,
          rows: [],
        };
      }

      throw new Error(`Unexpected PostgreSQL query in test: ${sql}`);
    });

  return {
    closePostgresPool: mockClosePostgresPool,
    getDirectDatabaseConnectionString: vi.fn(() => ''),
    hasDirectDatabaseConnection: mockHasDirectDatabaseConnection,
    withPostgresAdvisoryLock: mockWithPostgresAdvisoryLock,
    withPostgresTransaction: vi.fn(
      async (callback: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) =>
        callback({ query: createTransactionalQuery() })
    ),
  };
});

process.env.NODE_ENV = 'test';
process.env.CHECKOUT_LINK_SECRET = 'test-checkout-secret';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_123';
process.env.STRIPE_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.STRIPE_SECURITY_BOND_PRODUCT_ID = 'prod_security_bond';
process.env.STRIPE_ONBOARDING_SETUP_PRODUCT_ID = 'prod_onboarding_setup';
process.env.STRIPE_WEEKLY_RENTAL_PRODUCT_ID = 'prod_weekly_rental';

const { default: app } = await import('../index.js');
const { createCheckoutToken, verifyCheckoutToken } = await import('../checkoutTokens.js');

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.LEASE_OWNER_NAME;
  delete process.env.LEASE_OWNER_ADDRESS;
  delete process.env.LEASE_OWNER_CONTACT;
  delete process.env.LEASE_OWNER_EMAIL;
  delete process.env.LEASE_FUEL_POLICY;
  delete process.env.LEASE_INSURANCE_COVERAGE;
  delete process.env.LEASE_MINIMUM_RENTAL_PERIOD;
  delete process.env.LEASE_RETURN_POLICY;
  delete process.env.LEASE_RETURN_NOTICE_DAYS;
  delete process.env.LEASE_KM_ALLOWANCE;
  mockState.cars = [
    {
      id: 1,
      name: 'Toyota Camry',
      model_year: 2024,
      weekly_price: 250,
      bond: 500,
      status: 'Available',
      image: 'https://example.com/camry.jpg',
      created_at: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 2,
      name: 'Toyota Prius',
      model_year: 2023,
      weekly_price: 275,
      bond: 600,
      status: 'Rented',
      image: 'https://example.com/prius.jpg',
      created_at: '2026-03-02T00:00:00.000Z',
    },
  ];

  mockState.applications = [
    {
      id: PENDING_APPLICATION_ID,
      approved_at: null,
      approved_bond: null,
      approved_weekly_price: null,
      assigned_car_id: null,
      name: 'Jane Driver',
      phone: '0412345678',
      email: 'jane@example.com',
      license_number: 'NSW12345',
      license_expiry: getFutureDateOnly(365),
      uber_status: 'Active',
      experience: 'New Driver',
      address: '1 Test Street',
      weekly_budget: '$300/week',
      intended_start_date: getFutureDateOnly(1),
      license_photo: 'docs/license-1.png',
      license_back_photo: 'docs/license-back-1.png',
      paid_at: null,
      payment_link_sent_at: null,
      payment_link_version: 0,
      pending_checkout_session_id: null,
      status: 'Pending',
      created_at: '2026-03-03T00:00:00.000Z',
    },
    {
      id: APPROVED_APPLICATION_ID,
      approved_at: '2026-03-05T00:00:00.000Z',
      approved_bond: 500,
      approved_weekly_price: 250,
      assigned_car_id: 1,
      name: 'Approved Driver',
      phone: '0499999999',
      email: 'approved@example.com',
      license_number: 'NSW99999',
      license_expiry: getFutureDateOnly(425),
      uber_status: 'Active',
      experience: '1-3 years',
      address: '2 Test Street',
      weekly_budget: '$350/week',
      intended_start_date: getFutureDateOnly(2),
      license_photo: 'https://project.supabase.co/storage/v1/object/public/applications/docs/license-2.png',
      license_back_photo: null,
      paid_at: null,
      payment_link_sent_at: '2026-03-05T00:00:00.000Z',
      payment_link_version: 1,
      pending_checkout_session_id: null,
      status: 'Approved',
      created_at: '2026-03-04T00:00:00.000Z',
    },
  ];

  mockState.rentals = [];
  mockState.lease_agreements = [];
  mockState.stripe_webhook_events = [];

  mockState.customers = [
    {
      id: 1,
      external_id: '60499',
      staff_number: '1012',
      full_name: 'Alex Driver',
      preferred_name: 'Alex Driver',
      company_name: 'Alex Driver Pty Ltd',
      phone: '0400000001',
      email: 'alex.driver@example.invalid',
      date_of_birth: '1999-09-24',
      street: null,
      city: null,
      postcode: null,
      state: null,
      source: 'legacy-import',
      created_at: '2026-03-05T00:00:00.000Z',
      updated_at: '2026-03-05T00:00:00.000Z',
    },
    {
      id: 2,
      external_id: '61617',
      staff_number: '1013',
      full_name: 'Jordan Rider',
      preferred_name: 'Jordan Rider',
      company_name: 'Jordan Rider Pty Ltd',
      phone: '0400000002',
      email: 'jordan.rider@example.invalid',
      date_of_birth: '2001-05-15',
      street: null,
      city: null,
      postcode: null,
      state: null,
      source: 'legacy-import',
      created_at: '2026-03-05T00:00:00.000Z',
      updated_at: '2026-03-05T00:00:00.000Z',
    },
  ];

  mockState.invoices = [
    {
      id: 1,
      external_invoice_number: '1882',
      customer_id: 1,
      customer_name: 'Alex Driver',
      car_registration: 'CNO40S',
      invoice_date: '2026-03-05',
      due_label: 'Wed 11 Mar',
      amount: 230.99,
      balance: 230.99,
      transaction_summary: '',
      source: 'legacy-import',
      created_at: '2026-03-05T00:00:00.000Z',
    },
    {
      id: 2,
      external_invoice_number: '1881',
      customer_id: 2,
      customer_name: 'Jordan Rider',
      car_registration: 'YNU55M',
      invoice_date: '2026-03-04',
      due_label: 'Wed 04 Mar',
      amount: 386.09,
      balance: 0,
      transaction_summary: '$386.09 - 04 Mar 2026 - Direct Debit',
      source: 'legacy-import',
      created_at: '2026-03-04T00:00:00.000Z',
    },
  ];

  mockState.bookings = [
    {
      id: 10,
      car_id: 1,
      total_amount: 230.99,
    },
    {
      id: 11,
      car_id: 2,
      total_amount: 0,
    },
  ];

  mockGetUser.mockResolvedValue({
    data: { user: { email: 'admin@maplerentals.com.au' } },
    error: null,
  });
  mockRefreshSession.mockImplementation(async () => ({
    data: {
      session: {
        access_token: 'refreshed-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'refresh-token',
      },
      user: { email: 'admin@maplerentals.com.au' },
    },
    error: null,
  }));
  mockSignInWithPassword.mockImplementation(async ({ email }: { email: string }) => ({
    data: {
      session: {
        access_token: 'fake-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'refresh-token',
      },
      user: { email },
    },
    error: null,
  }));
  mockCreateAuthClient.mockReturnValue({
    auth: {
      getUser: mockGetUser,
      refreshSession: mockRefreshSession,
      signInWithPassword: mockSignInWithPassword,
    },
  });
  mockCheckDBHealth.mockResolvedValue({ configured: true });
  mockClosePostgresPool.mockResolvedValue(undefined);
  mockGetSupabaseAuthConfigurationIssues.mockReturnValue([]);
  mockGetSupabaseConfigurationIssues.mockReturnValue([]);
  mockHasDirectDatabaseConnection.mockReturnValue(true);
  mockWithPostgresAdvisoryLock.mockImplementation(async (_lockKey: string, callback: () => Promise<unknown>) =>
    callback()
  );
  mockStorageFrom.mockImplementation((bucket: string) => ({
    upload: vi.fn(async (path: string) => ({ data: { path }, error: null })),
    createSignedUrl: vi.fn(async (path: string) => ({
      data: { signedUrl: `https://signed.example/${bucket}/${path}` },
      error: null,
    })),
    remove: vi.fn(async () => ({ data: null, error: null })),
  }));
  mockResendEmailsSend.mockResolvedValue({
    data: { id: 'email_123' },
    error: null,
    headers: null,
  });
  mockMutationErrors.applicationsUpdate = null;

  mockStripe.checkoutSessionsCreate.mockResolvedValue({
    id: 'cs_test_123',
    url: 'https://checkout.stripe.com/c/pay/cs_test_123',
  });
  mockStripe.checkoutSessionsExpire.mockResolvedValue({ id: 'cs_test_123' });
  mockStripe.checkoutSessionsList.mockResolvedValue({
    data: [],
    has_more: false,
  });
  mockStripe.checkoutSessionsRetrieve.mockResolvedValue({
    id: 'cs_test_123',
    url: 'https://checkout.stripe.com/c/pay/cs_test_123',
    status: 'complete',
    payment_status: 'paid',
    metadata: {
      application_id: APPROVED_APPLICATION_ID,
      approved_bond: '500.00',
      approved_weekly_price: '250.00',
      car_id: '1',
      checkout_kind: 'vehicle',
      payment_link_version: '1',
    },
    customer: 'cus_123',
    subscription: 'sub_123',
  });
  mockStripe.subscriptionsRetrieve.mockResolvedValue({
    id: 'sub_test_123',
    metadata: { application_id: APPROVED_APPLICATION_ID, car_id: '1' },
  });
  mockStripe.webhooksConstructEvent.mockReset();

  vi.clearAllMocks();
});

describe('Cars API', () => {
  it('GET /api/cars should return a list of cars', async () => {
    const res = await request(app).get('/api/cars');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].name).toBe('Toyota Prius');
    expect(res.body[0].bond).toBe(600);
  });

  it('GET /api/cars/:id should return a single car', async () => {
    const res = await request(app).get('/api/cars/1');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Toyota Camry');
  });

  it('PUT /api/cars/:id returns 404 when the car does not exist', async () => {
    const res = await request(app)
      .put('/api/cars/999')
      .set('Authorization', 'Bearer fake-token')
      .send({
        name: 'Toyota Corolla Hybrid',
        model_year: 2025,
        weekly_price: 299,
        bond: 500,
        status: 'Available',
        image: 'https://example.com/corolla.jpg',
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Car not found');
  });

  it('DELETE /api/cars/:id blocks deletion while operational records still reference the car', async () => {
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        bond_paid: 500,
        car_id: 1,
        status: 'Active',
        weekly_price: 250,
        start_date: '2026-03-01',
      },
    ];
    mockState.lease_agreements = [
      {
        id: 30,
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        content: 'Agreement',
        status: 'generated',
      },
    ];

    const res = await request(app)
      .delete('/api/cars/1')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(409);
    expect(res.body.usage).toMatchObject({
      assigned_applications: 1,
      bookings: 1,
      lease_agreements: 1,
      rentals: 1,
    });
    expect(mockState.cars).toHaveLength(2);
  });

  it('DELETE /api/cars/:id returns 404 when the car does not exist', async () => {
    const res = await request(app)
      .delete('/api/cars/999')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Car not found');
  });

  it('POST /api/cars creates a new car and returns its id', async () => {
    const res = await request(app)
      .post('/api/cars')
      .set('Authorization', 'Bearer fake-token')
      .send({
        name: 'Toyota Corolla Hybrid',
        model_year: 2025,
        weekly_price: 299,
        bond: 600,
        status: 'Available',
        image: 'https://example.com/corolla.jpg',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(mockState.cars).toHaveLength(3);
    expect(mockState.cars[2].name).toBe('Toyota Corolla Hybrid');
  });

  it('POST /api/cars returns 400 for invalid car data', async () => {
    const res = await request(app)
      .post('/api/cars')
      .set('Authorization', 'Bearer fake-token')
      .send({
        name: '',
        model_year: 1800,
        weekly_price: -100,
        bond: 0,
        status: 'Unknown',
        image: 'not-a-valid-url',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(mockState.cars).toHaveLength(2);
  });

  it('POST /api/cars returns 401 when not authenticated', async () => {
    const res = await request(app)
      .post('/api/cars')
      .send({
        name: 'Toyota Corolla',
        model_year: 2025,
        weekly_price: 299,
        bond: 600,
        status: 'Available',
        image: 'https://example.com/corolla.jpg',
      });

    expect(res.status).toBe(401);
  });

  it('PUT /api/cars/:id updates an existing car and returns success', async () => {
    const res = await request(app)
      .put('/api/cars/1')
      .set('Authorization', 'Bearer fake-token')
      .send({
        name: 'Toyota Camry Updated',
        model_year: 2025,
        weekly_price: 280,
        bond: 560,
        status: 'Maintenance',
        image: 'https://example.com/camry-updated.jpg',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const updated = mockState.cars.find((c) => c.id === 1);
    expect(updated?.name).toBe('Toyota Camry Updated');
    expect(updated?.status).toBe('Maintenance');
  });

  it('PUT /api/cars/:id returns 400 for invalid update data', async () => {
    const res = await request(app)
      .put('/api/cars/1')
      .set('Authorization', 'Bearer fake-token')
      .send({
        name: 'Toyota Camry',
        model_year: 2025,
        weekly_price: -50,
        bond: 0,
        status: 'Available',
        image: '/valid.jpg',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('DELETE /api/cars/:id deletes a car that has no associated records', async () => {
    mockState.rentals = [];
    mockState.lease_agreements = [];
    mockState.bookings = [];
    // Reset applications so no app has assigned_car_id = 2
    mockState.applications = mockState.applications.map((app) => ({
      ...app,
      assigned_car_id: null,
    }));

    const res = await request(app)
      .delete('/api/cars/2')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockState.cars).toHaveLength(1);
    expect(mockState.cars.find((c) => c.id === 2)).toBeUndefined();
  });

  it('GET /api/cars/:id returns 404 when the car does not exist', async () => {
    const res = await request(app).get('/api/cars/999');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Car not found');
  });
});

describe('Auth API', () => {
  it('POST /api/auth/login should log in an admin', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin@maplerentals.com.au', password: 'password' });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('admin@maplerentals.com.au');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('POST /api/auth/login sets a cross-site compatible cookie when the frontend is on another host', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://admin.maplerentals.com.au')
      .send({ username: 'admin@maplerentals.com.au', password: 'password' });

    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']?.[0]).toContain('SameSite=None');
    expect(res.headers['set-cookie']?.[0]).toContain('Secure');
  });

  it('POST /api/auth/login allows a configured CORS origin with a trailing slash', async () => {
    const previousCorsOrigin = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = 'https://admin.maplerentals.com.au/';

    try {
      const { createApp } = await import('../index.js');
      const scopedApp = createApp();

      const res = await request(scopedApp)
        .post('/api/auth/login')
        .set('Origin', 'https://admin.maplerentals.com.au')
        .send({ username: 'admin@maplerentals.com.au', password: 'password' });

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(
        'https://admin.maplerentals.com.au'
      );
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    } finally {
      if (previousCorsOrigin === undefined) {
        delete process.env.CORS_ORIGIN;
      } else {
        process.env.CORS_ORIGIN = previousCorsOrigin;
      }
    }
  });

  it('GET /api/auth/verify refreshes an expired Supabase access token stored in the admin cookie', async () => {
    const agent = request.agent(app);
    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'admin@maplerentals.com.au', password: 'password' });

    expect(loginRes.status).toBe(200);

    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'JWT expired' },
    });

    const verifyRes = await agent.get('/api/auth/verify');

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.user.username).toBe('admin@maplerentals.com.au');
    expect(mockRefreshSession).toHaveBeenCalledWith({
      refresh_token: 'refresh-token',
    });
    expect(verifyRes.headers['set-cookie']).toBeDefined();
  });

  it('POST /api/auth/logout rejects cookie-authenticated writes without a trusted origin', async () => {
    const agent = request.agent(app);
    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'admin@maplerentals.com.au', password: 'password' });

    expect(loginRes.status).toBe(200);

    const rejectedRes = await agent.post('/api/auth/logout');
    expect(rejectedRes.status).toBe(403);
    expect(rejectedRes.body.error).toContain('Cross-site admin request rejected');

    const allowedRes = await agent
      .post('/api/auth/logout')
      .set('Origin', 'http://localhost:3000');

    expect(allowedRes.status).toBe(200);
    expect(allowedRes.body.message).toBe('Logged out');
  });

  it('POST /api/auth/login should deny non-admin email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'notadmin@example.com', password: 'password' });

    expect(res.status).toBe(403);
  });
});

describe('Agreements API', () => {
  it('GET /api/agreements/car-lease/template requires admin auth', async () => {
    const res = await request(app).get('/api/agreements/car-lease/template');

    expect(res.status).toBe(401);
  });

  it('POST /api/agreements/car-lease/render requires admin auth', async () => {
    const res = await request(app).post('/api/agreements/car-lease/render').send({
      renteeName: 'Approved Driver',
      vehicleModel: 'Toyota Camry Hybrid',
    });

    expect(res.status).toBe(401);
  });

  it('POST /api/agreements blocks creation before payment is completed', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', 'Bearer fake-token')
      .send({
        application_id: PENDING_APPLICATION_ID,
        car_id: 1,
        content: '# Draft agreement',
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('payment is completed');
    expect(mockState.lease_agreements).toHaveLength(0);
  });

  it('POST /api/agreements blocks creation for a car that was not assigned to the paid application', async () => {
    mockState.applications[1].status = 'Paid';

    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', 'Bearer fake-token')
      .send({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 2,
        content: '# Draft agreement',
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('assigned to the paid application');
    expect(mockState.lease_agreements).toHaveLength(0);
  });

  it('POST /api/agreements stores agreements only for paid applications and their assigned car', async () => {
    mockState.applications[1].status = 'Paid';

    const res = await request(app)
      .post('/api/agreements')
      .set('Authorization', 'Bearer fake-token')
      .send({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        content: '# Final agreement',
      });

    expect(res.status).toBe(201);
    expect(mockState.lease_agreements).toHaveLength(1);
    expect(mockState.lease_agreements[0]).toMatchObject({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      content: '# Final agreement',
    });
  });

  it('GET /api/agreements returns saved agreements without relying on embedded foreign-key relations', async () => {
    mockState.lease_agreements = [
      {
        id: 31,
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        content: '# Agreement',
        status: 'generated',
        created_at: '2026-03-08T00:00:00.000Z',
      },
    ];

    const res = await request(app)
      .get('/api/agreements')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: 31,
      applicant_name: 'Approved Driver',
      car_name: 'Toyota Camry',
    });
  });

  it('GET /api/agreements/:id returns the saved agreement with applicant and car labels', async () => {
    mockState.lease_agreements = [
      {
        id: 31,
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        content: '# Agreement',
        status: 'generated',
        created_at: '2026-03-08T00:00:00.000Z',
      },
    ];

    const res = await request(app)
      .get('/api/agreements/31')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 31,
      applicant_name: 'Approved Driver',
      car_name: 'Toyota Camry',
    });
  });
});

describe('IndexNow admin route', () => {
  it('POST /admin/test-indexnow requires admin auth', async () => {
    const res = await request(app).post('/admin/test-indexnow').send({
      url: 'http://localhost:5173/cars/1',
    });

    expect(res.status).toBe(401);
  });

  it('POST /admin/test-indexnow accepts authenticated admin submissions', async () => {
    const res = await request(app)
      .post('/admin/test-indexnow')
      .set('Authorization', 'Bearer fake-token')
      .send({
        url: 'http://localhost:5173/cars/1',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Applications API', () => {
  it('GET /api/health reports database readiness', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      database: 'ok',
      paymentActivationMode: 'transactional',
    });
  });

  it('GET /api/health returns 503 when the database health check fails', async () => {
    mockCheckDBHealth.mockRejectedValueOnce(new Error('database unavailable'));

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      status: 'error',
      database: 'unavailable',
      paymentActivationMode: 'transactional',
    });
  });

  it('GET /api/health reports restricted payment handling without direct DB access', async () => {
    mockHasDirectDatabaseConnection.mockReturnValue(false);

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      database: 'ok',
      paymentActivationMode: 'restricted',
    });
  });

  it('GET /api/health coalesces concurrent database probes', async () => {
    let resolveHealthCheck!: (value: { configured: boolean; issues: string[] }) => void;
    mockCheckDBHealth.mockReturnValueOnce(
      new Promise<{ configured: boolean; issues: string[] }>((resolve) => {
        resolveHealthCheck = resolve;
      })
    );

    const firstRequest = request(app).get('/api/health').then((response) => response);
    const secondRequest = request(app).get('/api/health').then((response) => response);

    await vi.waitFor(() => {
      expect(mockCheckDBHealth).toHaveBeenCalledTimes(1);
    });

    resolveHealthCheck({ configured: true, issues: [] });

    const [firstResponse, secondResponse] = await Promise.all([
      firstRequest,
      secondRequest,
    ]);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(firstResponse.body.database).toBe('ok');
    expect(secondResponse.body.database).toBe('ok');
  });

  it('POST /api/inquiries sends the inquiry through Resend when configured', async () => {
    process.env.RESEND_API_KEY = 'test-resend';
    const startDate = getFutureDateOnly(7);
    const endDate = getFutureDateOnly(14);

    const res = await request(app).post('/api/inquiries').send({
      name: 'Jordan Prospect',
      email: 'jordan.prospect@example.com',
      phone: '0400 000 111',
      startDate,
      endDate,
      message: 'Looking for a Camry Hybrid for airport work.',
    });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(mockResendEmailsSend).toHaveBeenCalledTimes(2);
  });

  it('POST /api/inquiries returns 500 when Resend resolves with a provider error', async () => {
    process.env.RESEND_API_KEY = 'test-resend';
    mockResendEmailsSend.mockResolvedValueOnce({
      data: null,
      error: { message: 'Provider rejected request' },
      headers: null,
    });
    const startDate = getFutureDateOnly(7);
    const endDate = getFutureDateOnly(14);

    const res = await request(app).post('/api/inquiries').send({
      name: 'Jordan Prospect',
      email: 'jordan.prospect@example.com',
      phone: '0400 000 111',
      startDate,
      endDate,
      message: 'Looking for a Camry Hybrid for airport work.',
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to submit availability inquiry');
  });

  it('POST /api/inquiries returns 202 when only the user confirmation email fails', async () => {
    process.env.RESEND_API_KEY = 'test-resend';
    mockResendEmailsSend.mockResolvedValueOnce({
      data: { id: 'email_admin_123' },
      error: null,
      headers: null,
    });
    mockResendEmailsSend.mockResolvedValueOnce({
      data: null,
      error: { message: 'Provider rejected request' },
      headers: null,
    });
    const startDate = getFutureDateOnly(7);
    const endDate = getFutureDateOnly(14);

    const res = await request(app).post('/api/inquiries').send({
      name: 'Jordan Prospect',
      email: 'jordan.prospect@example.com',
      phone: '0400 000 111',
      startDate,
      endDate,
      message: 'Looking for a Camry Hybrid for airport work.',
    });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/inquiries returns 503 when inquiry delivery is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    const startDate = getFutureDateOnly(7);
    const endDate = getFutureDateOnly(14);

    const res = await request(app).post('/api/inquiries').send({
      name: 'Jordan Prospect',
      email: 'jordan.prospect@example.com',
      phone: '0400 000 111',
      startDate,
      endDate,
    });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain('temporarily unavailable');
  });

  it('POST /api/inquiries returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/inquiries').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('POST /api/inquiries returns 400 when the email is invalid', async () => {
    const startDate = getFutureDateOnly(7);
    const endDate = getFutureDateOnly(14);

    const res = await request(app).post('/api/inquiries').send({
      name: 'Jordan Prospect',
      email: 'not-an-email',
      phone: '0400000111',
      startDate,
      endDate,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('POST /api/inquiries returns 400 when the phone number is not a valid Australian mobile', async () => {
    const startDate = getFutureDateOnly(7);
    const endDate = getFutureDateOnly(14);

    const res = await request(app).post('/api/inquiries').send({
      name: 'Jordan Prospect',
      email: 'jordan@example.com',
      phone: '123456',
      startDate,
      endDate,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('POST /api/inquiries returns 400 when end date is before start date', async () => {
    const startDate = getFutureDateOnly(14);
    const endDate = getFutureDateOnly(7);

    const res = await request(app).post('/api/inquiries').send({
      name: 'Jordan Prospect',
      email: 'jordan@example.com',
      phone: '0400000111',
      startDate,
      endDate,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('POST /api/inquiries returns 400 when start date is in the past', async () => {
    const startDate = getPastDateOnly(7);
    const endDate = getFutureDateOnly(7);

    const res = await request(app).post('/api/inquiries').send({
      name: 'Jordan Prospect',
      email: 'jordan@example.com',
      phone: '0400000111',
      startDate,
      endDate,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('POST /api/inquiries returns 400 when the name is too short', async () => {
    const startDate = getFutureDateOnly(7);
    const endDate = getFutureDateOnly(14);

    const res = await request(app).post('/api/inquiries').send({
      name: 'A',
      email: 'jordan@example.com',
      phone: '0400000111',
      startDate,
      endDate,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('GET /api/applications returns signed document URLs for admins', async () => {
    const res = await request(app)
      .get('/api/applications')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body[0].license_photo).toBe(
      'https://signed.example/applications/docs/license-2.png'
    );
    expect(res.body[1].license_photo).toBe('https://signed.example/applications/docs/license-1.png');
    expect(res.body[1].license_back_photo).toBe(
      'https://signed.example/applications/docs/license-back-1.png'
    );
  });

  it('GET /api/applications/:id/documents/:document rejects non-UUID ids', async () => {
    const res = await request(app)
      .get('/api/applications/not-a-uuid/documents/license_photo')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('POST /api/applications supports camel-case Supabase application schemas', async () => {
    mockState.applications[1].status = 'Paid';
    mockState.applications[1].paid_at = '2026-03-07T00:00:00.000Z';

    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: 'New Driver',
      phone: '0400111222',
      email: 'newdriver@example.com',
      license_number: 'NSW55555',
      license_expiry: getFutureDateOnly(365),
      uber_status: 'Applying',
      experience: 'New Driver',
      address: '55 Test Street',
      weekly_budget: '$350/week',
      intended_start_date: getFutureDateOnly(7),
      license_photo: 'data:image/png;base64,ZmFrZQ==',
      license_back_photo: 'data:image/png;base64,ZmFrZQ==',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.checkout_url).toBeUndefined();
    expect(mockState.applications).toHaveLength(3);
    expect(mockState.applications[2]).toMatchObject({
      assigned_car_id: 1,
      email: 'newdriver@example.com',
      license_number: 'NSW55555',
      status: 'Pending',
    });
  });

  it('POST /api/applications accepts valid submissions that exceed the global JSON parser limit', async () => {
    mockState.applications[1].status = 'Paid';
    mockState.applications[1].paid_at = '2026-03-07T00:00:00.000Z';
    const largeImagePayload = `data:image/png;base64,${'A'.repeat(140 * 1024)}`;

    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: 'Large Payload Driver',
      phone: '0400999888',
      email: 'large-payload@example.com',
      license_number: 'NSW88888',
      license_expiry: getFutureDateOnly(365),
      uber_status: 'Applying',
      experience: 'New Driver',
      address: '101 Parser Street',
      weekly_budget: '$390/week',
      intended_start_date: getFutureDateOnly(7),
      license_photo: largeImagePayload,
      license_back_photo: largeImagePayload,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.checkout_url).toBeUndefined();
    expect(mockState.applications.at(-1)?.email).toBe('large-payload@example.com');
  });

  it('POST /api/applications creates a pending application without generating an agreement or checkout link', async () => {
    process.env.LEASE_OWNER_NAME = 'Maple Rentals';
    process.env.LEASE_OWNER_ADDRESS = '13/27-33 Addlestone Rd, Merrylands NSW 2160';
    process.env.LEASE_OWNER_EMAIL = 'admin@maplerentals.com.au';
    mockState.applications[1].status = 'Paid';
    mockState.applications[1].paid_at = '2026-03-07T00:00:00.000Z';

    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: 'Agreement Driver',
      phone: '0400222333',
      email: 'agreement@example.com',
      license_number: 'NSW12121',
      license_expiry: getFutureDateOnly(365),
      uber_status: 'Applying',
      experience: 'New Driver',
      address: '44 Agreement Street',
      weekly_budget: '$360/week',
      intended_start_date: getFutureDateOnly(7),
      license_photo: 'data:image/png;base64,ZmFrZQ==',
      license_back_photo: 'data:image/png;base64,ZmFrZQ==',
    });

    expect(res.status).toBe(200);
    expect(res.body.checkout_url).toBeUndefined();
    expect(mockState.lease_agreements).toHaveLength(0);
    expect(mockState.applications.at(-1)).toMatchObject({
      assigned_car_id: 1,
      status: 'Pending',
    });
  });

  it('POST /api/applications escapes applicant-controlled HTML before sending emails', async () => {
    process.env.RESEND_API_KEY = 'test-resend';
    mockResendEmailsSend.mockClear();
    mockState.applications[1].status = 'Paid';
    mockState.applications[1].paid_at = '2026-03-07T00:00:00.000Z';

    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: '<img src=x onerror=alert(1)>',
      phone: '0400111222',
      email: 'markup@example.com',
      license_number: 'NSW77777',
      license_expiry: getFutureDateOnly(365),
      uber_status: 'Applying',
      experience: '<b>Experienced</b>',
      address: '<a href=\"https://evil.example\">Click me</a>',
      weekly_budget: '$350/week',
      intended_start_date: getFutureDateOnly(7),
      license_photo: 'data:image/png;base64,ZmFrZQ==',
      license_back_photo: 'data:image/png;base64,ZmFrZQ==',
    });

    expect(res.status).toBe(200);
    expect(mockResendEmailsSend).toHaveBeenCalledTimes(2);
    expect(mockResendEmailsSend).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        html: expect.stringContaining('&lt;img src=x onerror=alert(1)&gt;'),
      })
    );
    expect(mockResendEmailsSend).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        html: expect.stringContaining('&lt;img src=x onerror=alert(1)&gt;'),
      })
    );
    expect(mockResendEmailsSend.mock.calls[1]?.[0]?.html).not.toContain('<img src=x onerror=alert(1)>');
  });

  it('POST /api/applications rejects unsupported image formats', async () => {
    mockState.applications[1].status = 'Paid';
    mockState.applications[1].paid_at = '2026-03-07T00:00:00.000Z';

    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: 'Unsafe Driver',
      phone: '0400111222',
      email: 'unsafe@example.com',
      license_number: 'NSW22222',
      license_expiry: getFutureDateOnly(365),
      uber_status: 'Applying',
      experience: 'New Driver',
      address: '77 Test Street',
      weekly_budget: '$320/week',
      intended_start_date: getFutureDateOnly(7),
      license_photo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      license_back_photo: 'data:image/png;base64,ZmFrZQ==',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('JPG or PNG');
    expect(mockState.applications).toHaveLength(2);
  });

  it('POST /api/applications validates phone and date fields on the server', async () => {
    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: 'Direct API Driver',
      phone: '12345',
      email: 'direct-api@example.com',
      license_number: 'NSW42424',
      license_expiry: getPastDateOnly(1),
      uber_status: 'Applying',
      experience: 'New Driver',
      address: '88 Test Street',
      weekly_budget: '$320/week',
      intended_start_date: getPastDateOnly(1),
      license_photo: 'data:image/png;base64,ZmFrZQ==',
      license_back_photo: 'data:image/png;base64,ZmFrZQ==',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'Valid Australian mobile number required' }),
        expect.objectContaining({ message: 'License must not be expired' }),
        expect.objectContaining({ message: 'Start date must be today or later' }),
      ])
    );
    expect(mockState.applications).toHaveLength(2);
  });

  it('POST /api/applications stores applicant phone numbers in a normalized format', async () => {
    mockState.applications[1].status = 'Paid';
    mockState.applications[1].paid_at = '2026-03-07T00:00:00.000Z';

    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: 'Normalized Phone Driver',
      phone: '0400 000 111',
      email: 'normalized-phone@example.com',
      license_number: 'NSW55555',
      license_expiry: getFutureDateOnly(365),
      uber_status: 'Applying',
      experience: 'New Driver',
      address: '88 Test Street',
      weekly_budget: '$320/week',
      intended_start_date: getFutureDateOnly(7),
      license_photo: 'data:image/png;base64,ZmFrZQ==',
      license_back_photo: 'data:image/png;base64,ZmFrZQ==',
    });

    expect(res.status).toBe(200);
    expect(mockState.applications.at(-1)?.phone).toBe('0400000111');
  });

  it('PUT /api/applications/:id/status returns 404 when the application does not exist', async () => {
    const res = await request(app)
      .put(`/api/applications/${UNKNOWN_APPLICATION_ID}/status`)
      .set('Authorization', 'Bearer fake-token')
      .send({ status: 'Rejected' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Application not found');
  });

  it('PUT /api/applications/:id/status rejects non-UUID ids', async () => {
    const res = await request(app)
      .put('/api/applications/not-a-uuid/status')
      .set('Authorization', 'Bearer fake-token')
      .send({ status: 'Rejected' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('POST /api/applications blocks public overwrites for rejected applications', async () => {
    mockState.applications[0] = {
      ...mockState.applications[0],
      assigned_car_id: 2,
      approved_at: '2026-03-06T00:00:00.000Z',
      approved_bond: 700,
      approved_weekly_price: 320,
      paid_at: '2026-03-07T00:00:00.000Z',
      payment_link_sent_at: '2026-03-06T00:00:00.000Z',
      payment_link_version: 4,
      pending_checkout_session_id: 'cs_old_pending',
      status: 'Rejected',
    };

    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: 'Jane Driver',
      phone: '0412345678',
      email: 'jane@example.com',
      license_number: 'NSW12345',
      license_expiry: getFutureDateOnly(365),
      uber_status: 'Active',
      experience: '3+ years',
      address: '99 Updated Street',
      weekly_budget: '$410/week',
      intended_start_date: getFutureDateOnly(7),
      license_photo: 'data:image/png;base64,ZmFrZQ==',
      license_back_photo: 'data:image/png;base64,ZmFrZQ==',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already been reviewed');
    expect(mockState.applications).toHaveLength(2);
    expect(mockState.applications[0]).toMatchObject({
      id: PENDING_APPLICATION_ID,
      status: 'Rejected',
      assigned_car_id: 2,
      approved_at: '2026-03-06T00:00:00.000Z',
      approved_bond: 700,
      approved_weekly_price: 320,
      paid_at: '2026-03-07T00:00:00.000Z',
      payment_link_sent_at: '2026-03-06T00:00:00.000Z',
      payment_link_version: 4,
      pending_checkout_session_id: 'cs_old_pending',
      address: '1 Test Street',
      experience: 'New Driver',
    });
  });

  it('POST /api/applications blocks public overwrites for pending applications', async () => {
    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: 'Jane Driver',
      phone: '0412345678',
      email: 'jane@example.com',
      license_number: 'NSW12345',
      license_expiry: getFutureDateOnly(365),
      uber_status: 'Active',
      experience: '1-3 years',
      address: '12 Mixed Case Street',
      weekly_budget: '$360/week',
      intended_start_date: getFutureDateOnly(10),
      license_photo: 'data:image/png;base64,ZmFrZQ==',
      license_back_photo: 'data:image/png;base64,ZmFrZQ==',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already under review');
    expect(mockState.applications[0].address).toBe('1 Test Street');
  });

  it('POST /api/applications treats rejected email lookups case-insensitively', async () => {
    mockState.applications[0].status = 'Rejected';

    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: 'Jane Driver',
      phone: '0412345678',
      email: 'Jane@Example.com',
      license_number: 'NSW12345',
      license_expiry: getFutureDateOnly(365),
      uber_status: 'Active',
      experience: '1-3 years',
      address: '12 Mixed Case Street',
      weekly_budget: '$360/week',
      intended_start_date: getFutureDateOnly(10),
      license_photo: 'data:image/png;base64,ZmFrZQ==',
      license_back_photo: 'data:image/png;base64,ZmFrZQ==',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already been reviewed');
    expect(mockState.applications).toHaveLength(2);
    expect(mockState.applications[0]).toMatchObject({
      id: PENDING_APPLICATION_ID,
      email: 'jane@example.com',
      address: '1 Test Street',
      experience: 'New Driver',
    });
  });

  it('POST /api/applications normalizes Australian mobile formats before duplicate checks', async () => {
    mockState.applications[0].status = 'Rejected';

    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: 'Jane Driver',
      phone: '+61 412 345 678',
      email: 'Jane@Example.com',
      license_number: 'NSW12345',
      license_expiry: getFutureDateOnly(365),
      uber_status: 'Active',
      experience: '1-3 years',
      address: '12 Mixed Case Street',
      weekly_budget: '$360/week',
      intended_start_date: getFutureDateOnly(10),
      license_photo: 'data:image/png;base64,ZmFrZQ==',
      license_back_photo: 'data:image/png;base64,ZmFrZQ==',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already been reviewed');
    expect(mockState.applications).toHaveLength(2);
  });

  it('POST /api/applications does not treat underscores in emails as wildcard matches', async () => {
    mockState.applications = [
      {
        ...mockState.applications[0],
        id: UNDERSCORE_APPLICATION_ID,
        email: 'fooxbar@example.com',
        phone: '0400000000',
        license_number: 'NSW00000',
      },
      {
        ...mockState.applications[0],
        id: UNDERSCORE_REJECTED_APPLICATION_ID,
        email: 'foo_bar@example.com',
        phone: '0412345678',
        license_number: 'NSW12345',
        status: 'Rejected',
      },
    ];

    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: 'Jane Driver',
      phone: '0412345678',
      email: 'foo_bar@example.com',
      license_number: 'NSW12345',
      license_expiry: getFutureDateOnly(365),
      uber_status: 'Active',
      experience: '1-3 years',
      address: '12 Exact Match Street',
      weekly_budget: '$360/week',
      intended_start_date: getFutureDateOnly(10),
      license_photo: 'data:image/png;base64,ZmFrZQ==',
      license_back_photo: 'data:image/png;base64,ZmFrZQ==',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already been reviewed');
    expect(
      mockState.applications.find(
        (application) => application.id === UNDERSCORE_APPLICATION_ID
      )?.address
    ).toBe('1 Test Street');
    expect(
      mockState.applications.find(
        (application) => application.id === UNDERSCORE_REJECTED_APPLICATION_ID
      )?.address
    ).toBe('1 Test Street');
  });
});

describe('Operational history API', () => {
  it('GET /api/customers returns customer summaries for admins', async () => {
    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.page).toBe(1);
    expect(res.body.totalItems).toBe(2);
    expect(res.body.items[0].invoice_count).toBe(1);
    expect(res.body.items[0].total_billed).toBe(230.99);
  });

  it('GET /api/customers supports paginated search results for admins', async () => {
    const res = await request(app)
      .get('/api/customers')
      .query({ search: 'Jordan', pageSize: 1, page: 1 })
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(1);
    expect(res.body.totalPages).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].full_name).toBe('Jordan Rider');
  });

  it('GET /api/invoices returns invoice history for admins', async () => {
    const res = await request(app)
      .get('/api/invoices')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.page).toBe(1);
    expect(res.body.totalItems).toBe(2);
    expect(res.body.items[0].external_invoice_number).toBe('1882');
    expect(res.body.items[1].status).toBe('Paid');
  });

  it('GET /api/invoices supports paginated search results for admins', async () => {
    const res = await request(app)
      .get('/api/invoices')
      .query({ search: 'YNU55M', pageSize: 1, page: 1 })
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(1);
    expect(res.body.totalPages).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].external_invoice_number).toBe('1881');
  });
});

describe('Stripe API', () => {
  it('POST /api/applications/:id/approve-payment requires admin auth', async () => {
    const res = await request(app).post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`).send({
      assigned_car_id: 1,
      approved_bond: 650,
      approved_weekly_price: 285,
    });

    expect(res.status).toBe(401);
  });

  it('POST /api/applications/:id/approve-payment stores the approved quote and returns a secure payment link', async () => {
    mockState.applications[0].pending_checkout_session_id = 'cs_old_pending';
    mockState.applications[0].payment_link_version = 3;
    mockState.applications[1].assigned_car_id = 2;

    const res = await request(app)
      .post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`)
      .set('Authorization', 'Bearer fake-token')
      .send({
        assigned_car_id: 1,
        approved_bond: 650,
        approved_weekly_price: 285,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.email_delivered).toBe(false);
    expect(res.body.checkout_url).toContain('/checkout/1?');
    expect(res.body.checkout_url).toContain('#checkout_token=');
    expect(mockStripe.checkoutSessionsExpire).toHaveBeenCalledWith('cs_old_pending');

    expect(mockState.applications[0]).toMatchObject({
      assigned_car_id: 1,
      approved_bond: 650,
      approved_weekly_price: 285,
      payment_link_version: 4,
      pending_checkout_session_id: null,
      status: 'Approved',
    });

    expect(mockState.lease_agreements).toHaveLength(1);
    expect(mockState.lease_agreements[0]).toMatchObject({
      application_id: PENDING_APPLICATION_ID,
      car_id: 1,
      status: 'generated',
    });
    expect(res.body.lease_agreement_saved).toBe(true);

    const verified = verifyCheckoutToken({
      applicationId: PENDING_APPLICATION_ID,
      carId: 1,
      purpose: 'vehicle',
      token: res.body.checkout_token,
      version: 4,
    });
    expect(verified.version).toBe(4);
  });

  it('POST /api/applications/:id/approve-payment blocks payment-link sending without direct DB access', async () => {
    mockHasDirectDatabaseConnection.mockReturnValue(false);

    const res = await request(app)
      .post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`)
      .set('Authorization', 'Bearer fake-token')
      .send({
        assigned_car_id: 1,
        approved_bond: 650,
        approved_weekly_price: 285,
        send_payment_link: true,
      });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain('session-capable Postgres connection');
    expect(mockState.applications[0].status).toBe('Pending');
    expect(mockState.lease_agreements).toHaveLength(0);
  });

  it('POST /api/applications/:id/approve-payment escapes applicant-controlled HTML in payment emails', async () => {
    process.env.RESEND_API_KEY = 'test-resend';
    mockResendEmailsSend.mockClear();
    mockState.applications[0].name = '<img src=x onerror=alert(1)>';
    mockState.applications[1].assigned_car_id = 2;
    mockState.cars[0].name = '<a href="https://evil.example">Camry</a>';

    const res = await request(app)
      .post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`)
      .set('Authorization', 'Bearer fake-token')
      .send({
        assigned_car_id: 1,
        approved_bond: 650,
        approved_weekly_price: 285,
      });

    expect(res.status).toBe(200);
    expect(res.body.email_delivered).toBe(true);
    expect(mockResendEmailsSend).toHaveBeenCalledTimes(1);
    expect(mockResendEmailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('&lt;img src=x onerror=alert(1)&gt;'),
      })
    );
    expect(mockResendEmailsSend.mock.calls[0]?.[0]?.html).toContain(
      '&lt;a href=&quot;https://evil.example&quot;&gt;Camry&lt;/a&gt;'
    );
    expect(mockResendEmailsSend.mock.calls[0]?.[0]?.html).not.toContain(
      '<a href="https://evil.example">Camry</a>'
    );
  });

  it('POST /api/applications/:id/approve-payment reports delivery failure when Resend returns an error payload', async () => {
    process.env.RESEND_API_KEY = 'test-resend';
    mockState.applications[1].assigned_car_id = 2;
    mockResendEmailsSend.mockResolvedValueOnce({
      data: null,
      error: { message: 'Provider rejected request' },
      headers: null,
    });

    const res = await request(app)
      .post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`)
      .set('Authorization', 'Bearer fake-token')
      .send({
        assigned_car_id: 1,
        approved_bond: 650,
        approved_weekly_price: 285,
      });

    expect(res.status).toBe(200);
    expect(res.body.email_delivered).toBe(false);
    expect(res.body.email_reason).toContain('Provider rejected request');
  });

  it('POST /api/applications/:id/approve-payment maps allocation unique-index races to 409', async () => {
    mockState.applications[1].assigned_car_id = 2;
    mockMutationErrors.applicationsUpdate = {
      code: '23505',
      message:
        'duplicate key value violates unique constraint "idx_applications_active_vehicle_allocation_unique"',
    };

    const res = await request(app)
      .post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`)
      .set('Authorization', 'Bearer fake-token')
      .send({
        assigned_car_id: 1,
        approved_bond: 650,
        approved_weekly_price: 285,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('active approval or payment review');
  });

  it('POST /api/applications/:id/approve-payment rejects vehicles already tied to another approved application', async () => {
    mockState.applications[1].assigned_car_id = 1;
    mockState.applications[1].status = 'Approved';

    const res = await request(app)
      .post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`)
      .set('Authorization', 'Bearer fake-token')
      .send({
        assigned_car_id: 1,
        approved_bond: 650,
        approved_weekly_price: 285,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('active approval');
    expect(mockState.applications[0].status).toBe('Pending');
  });

  it('POST /api/applications/:id/approve-payment does not let Payment Review cases send a new payment link', async () => {
    mockState.applications[0].status = 'Payment Review';

    const res = await request(app)
      .post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`)
      .set('Authorization', 'Bearer fake-token')
      .send({
        assigned_car_id: 1,
        approved_bond: 650,
        approved_weekly_price: 285,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('awaiting rental activation');
  });

  it('POST /api/applications/:id/approve-payment rejects stale approvals when the payment version changed mid-request', async () => {
    mockState.applications[0].pending_checkout_session_id = 'cs_old_pending';
    mockState.applications[0].payment_link_version = 3;
    mockState.applications[1].assigned_car_id = 2;
    mockStripe.checkoutSessionsExpire.mockImplementationOnce(async () => {
      mockState.applications[0].payment_link_version = 4;
      return { id: 'cs_old_pending' };
    });

    const res = await request(app)
      .post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`)
      .set('Authorization', 'Bearer fake-token')
      .send({
        assigned_car_id: 1,
        approved_bond: 650,
        approved_weekly_price: 285,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('payment details changed');
  });

  it('POST /api/applications/:id/approve-payment allows a car to be re-approved after the prior rental is only historically paid', async () => {
    mockState.applications[1].status = 'Paid';
    mockState.applications[1].paid_at = '2026-03-06T00:00:00.000Z';
    mockState.cars[0].status = 'Available';

    const res = await request(app)
      .post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`)
      .set('Authorization', 'Bearer fake-token')
      .send({
        assigned_car_id: 1,
        approved_bond: 650,
        approved_weekly_price: 285,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockState.applications[0].status).toBe('Approved');
  });

  it('POST /api/applications/:id/retry-payment-activation recovers a manual review from its stored Stripe session', async () => {
    mockState.applications[1].status = 'Payment Review';
    mockState.applications[1].paid_at = '2026-03-06T00:00:00.000Z';
    mockState.applications[1].pending_checkout_session_id = 'cs_recovered_review';
    mockState.cars[0].status = 'Available';
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: 'cs_recovered_review',
      status: 'complete',
      payment_status: 'paid',
      customer: 'cus_review',
      subscription: 'sub_review',
      client_reference_id: APPROVED_APPLICATION_ID,
      metadata: {
        application_id: APPROVED_APPLICATION_ID,
        approved_bond: '500.00',
        approved_weekly_price: '250.00',
        car_id: '1',
        checkout_kind: 'vehicle',
        payment_link_version: '1',
      },
    });

    const res = await request(app)
      .post(`/api/applications/${APPROVED_APPLICATION_ID}/retry-payment-activation`)
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockState.applications[1].status).toBe('Paid');
    expect(mockState.applications[1].paid_at).toBe('2026-03-06T00:00:00.000Z');
    expect(mockState.applications[1].pending_checkout_session_id).toBeNull();
    expect(mockState.cars[0].status).toBe('Rented');
    expect(mockState.rentals[0]).toMatchObject({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      status: 'Active',
      stripe_subscription_id: 'sub_review',
    });
    expect(mockStripe.checkoutSessionsList).not.toHaveBeenCalled();
  });

  it('POST /api/applications/:id/retry-payment-activation requires the stored Stripe session id', async () => {
    mockState.applications[1].status = 'Payment Review';
    mockState.applications[1].paid_at = '2026-03-06T00:00:00.000Z';
    mockState.applications[1].pending_checkout_session_id = null;

    const res = await request(app)
      .post(`/api/applications/${APPROVED_APPLICATION_ID}/retry-payment-activation`)
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('could not recover the paid checkout session');
    expect(mockState.applications[1].status).toBe('Payment Review');
    expect(mockState.rentals).toHaveLength(0);
    expect(mockStripe.checkoutSessionsList).not.toHaveBeenCalled();
  });
  it('GET /api/stripe/payment-context returns the approved quote for a valid payment link', async () => {
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: 'vehicle',
      version: 1,
    });

    const res = await request(app).get('/api/stripe/payment-context').query({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      checkout_token: token.token,
    });

    expect(res.status).toBe(200);
    expect(res.body.billing.bond).toBe(500);
    expect(res.body.billing.initialRental).toBe(250);
    expect(res.body.car.id).toBe(1);
  });

  it('GET /api/stripe/payment-context rejects stale links after the vehicle is reallocated', async () => {
    mockState.applications[0].status = 'Approved';
    mockState.applications[0].assigned_car_id = 1;
    mockState.applications[0].approved_bond = 650;
    mockState.applications[0].approved_weekly_price = 285;
    mockState.applications[0].payment_link_version = 1;
    mockState.applications[1].status = 'Approved';
    mockState.applications[1].assigned_car_id = 1;

    const token = createCheckoutToken({
      applicationId: PENDING_APPLICATION_ID,
      carId: 1,
      purpose: 'vehicle',
      version: 1,
    });

    const res = await request(app).get('/api/stripe/payment-context').query({
      application_id: PENDING_APPLICATION_ID,
      car_id: 1,
      checkout_token: token.token,
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('allocated elsewhere');
  });

  it('POST /api/stripe/vehicle-checkout-session rejects unapproved applications', async () => {
    const token = createCheckoutToken({ applicationId: PENDING_APPLICATION_ID, carId: 1, purpose: 'vehicle' });

    const res = await request(app).post('/api/stripe/vehicle-checkout-session').send({
      application_id: PENDING_APPLICATION_ID,
      checkout_token: token.token,
      car_id: 1,
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('not ready for payment');
  });

  it('POST /api/stripe/vehicle-checkout-session still creates a hosted session without direct DB access', async () => {
    mockHasDirectDatabaseConnection.mockReturnValue(false);
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: 'vehicle',
      version: 1,
    });

    const res = await request(app).post('/api/stripe/vehicle-checkout-session').send({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      checkout_token: token.token,
    });

    expect(res.status).toBe(200);
    expect(res.body.session_id).toBe('cs_test_123');
    expect(mockWithPostgresAdvisoryLock).not.toHaveBeenCalled();
    expect(mockStripe.checkoutSessionsCreate).toHaveBeenCalledTimes(1);
  });

  it('POST /api/stripe/vehicle-checkout-session rejects outdated payment-link versions', async () => {
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: 'vehicle',
      version: 0,
    });

    const res = await request(app).post('/api/stripe/vehicle-checkout-session').send({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      checkout_token: token.token,
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('version mismatch');
  });

  it('POST /api/stripe/vehicle-checkout-session rejects unavailable cars', async () => {
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: 'vehicle',
      version: 1,
    });
    mockState.cars[0].status = 'Rented';

    const res = await request(app).post('/api/stripe/vehicle-checkout-session').send({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      checkout_token: token.token,
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Selected vehicle is no longer available.');
  });

  it('POST /api/stripe/vehicle-checkout-session rejects mismatched tokens', async () => {
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 2,
      purpose: 'vehicle',
      version: 1,
    });

    const res = await request(app).post('/api/stripe/vehicle-checkout-session').send({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      checkout_token: token.token,
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('car mismatch');
  });

  it('POST /api/stripe/vehicle-checkout-session reuses an open pending Stripe session', async () => {
    mockState.applications[1].pending_checkout_session_id = 'cs_open_approved';
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: 'cs_open_approved',
      status: 'open',
      url: 'https://checkout.stripe.com/c/pay/cs_open_approved',
      payment_status: 'unpaid',
      metadata: {
        application_id: APPROVED_APPLICATION_ID,
        approved_bond: '500.00',
        approved_weekly_price: '250.00',
        car_id: '1',
        checkout_kind: 'vehicle',
        payment_link_version: '1',
      },
    });
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: 'vehicle',
      version: 1,
    });

    const res = await request(app).post('/api/stripe/vehicle-checkout-session').send({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      checkout_token: token.token,
    });

    expect(res.status).toBe(200);
    expect(res.body.session_id).toBe('cs_open_approved');
    expect(res.body.checkout_url).toBe('https://checkout.stripe.com/c/pay/cs_open_approved');
    expect(mockStripe.checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it('POST /api/stripe/vehicle-checkout-session creates a hosted session from the approved quote', async () => {
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: 'vehicle',
      version: 1,
    });

    const res = await request(app).post('/api/stripe/vehicle-checkout-session').send({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      checkout_token: token.token,
    });

    expect(res.status).toBe(200);
    expect(res.body.session_id).toBe('cs_test_123');
    expect(mockState.applications[1].pending_checkout_session_id).toBe('cs_test_123');

    const payload = mockStripe.checkoutSessionsCreate.mock.calls[0][0];
    expect(payload.line_items).toHaveLength(2);
    expect(payload.metadata.checkout_kind).toBe('vehicle');
    expect(payload.metadata.application_id).toBe(APPROVED_APPLICATION_ID);
    expect(payload.metadata.approved_bond).toBe('500.00');
    expect(payload.metadata.approved_weekly_price).toBe('250.00');
    expect(payload.metadata.car_id).toBe('1');

    const recurringItem = payload.line_items.find((item: any) => item.price_data.recurring);
    expect(recurringItem.price_data.unit_amount).toBe(25000);
    expect(recurringItem.price_data.product).toBe('prod_weekly_rental');
    expect(payload.cancel_url).toContain('/checkout/1?');
    expect(payload.cancel_url).toContain(`application_id=${APPROVED_APPLICATION_ID}`);
    expect(payload.cancel_url).toContain('resume_payment=1');
    expect(payload.cancel_url).toContain(`#checkout_token=${encodeURIComponent(token.token)}`);
    expect(payload.success_url).toContain(`application_id=${APPROVED_APPLICATION_ID}`);
    expect(payload.success_url).toContain('car_id=1');
    expect(payload.success_url).toContain(`#checkout_token=${encodeURIComponent(token.token)}`);
  });

  it('POST /api/stripe/vehicle-checkout-session derives a stable retry idempotency key from the stale session id', async () => {
    mockState.applications[1].pending_checkout_session_id = 'cs_closed_attempt';
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: 'cs_closed_attempt',
      status: 'expired',
      url: null,
      payment_status: 'unpaid',
      metadata: {
        application_id: APPROVED_APPLICATION_ID,
        approved_bond: '500.00',
        approved_weekly_price: '250.00',
        car_id: '1',
        checkout_kind: 'vehicle',
        payment_link_version: '1',
      },
    });

    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: 'vehicle',
      version: 1,
    });

    const res = await request(app).post('/api/stripe/vehicle-checkout-session').send({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      checkout_token: token.token,
    });

    expect(res.status).toBe(200);
    expect(mockState.applications[1].pending_checkout_session_id).toBe('cs_test_123');
    expect(mockStripe.checkoutSessionsCreate.mock.calls[0][1].idempotencyKey).toBe(
      `vehicle-checkout:${APPROVED_APPLICATION_ID}:v1:retry:cs_closed_attempt`
    );
  });

  it('POST /api/stripe/vehicle-checkout-session uses a Postgres advisory lock when direct DB access is configured', async () => {
    mockHasDirectDatabaseConnection.mockReturnValue(true);

    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: 'vehicle',
      version: 1,
    });

    const res = await request(app).post('/api/stripe/vehicle-checkout-session').send({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      checkout_token: token.token,
    });

    expect(res.status).toBe(200);
    expect(mockWithPostgresAdvisoryLock).toHaveBeenCalledWith(
      `vehicle-checkout:${APPROVED_APPLICATION_ID}`,
      expect.any(Function)
    );
  });

  it('POST /api/stripe/vehicle-checkout-session expires a newly created session when the link version changes mid-request', async () => {
    mockStripe.checkoutSessionsCreate.mockImplementationOnce(async () => {
      mockState.applications[1].payment_link_version = 2;
      return {
        id: 'cs_superseded',
        url: 'https://checkout.stripe.com/c/pay/cs_superseded',
      };
    });

    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: 'vehicle',
      version: 1,
    });

    const res = await request(app).post('/api/stripe/vehicle-checkout-session').send({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      checkout_token: token.token,
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('latest link');
    expect(mockStripe.checkoutSessionsExpire).toHaveBeenCalledWith('cs_superseded');
    expect(mockState.applications[1].pending_checkout_session_id).toBeNull();
  });

  it('POST /api/stripe/vehicle-checkout-link requires admin auth', async () => {
    const res = await request(app).post('/api/stripe/vehicle-checkout-link').send({
      application_id: APPROVED_APPLICATION_ID,
    });

    expect(res.status).toBe(401);
  });

  it('POST /api/stripe/vehicle-checkout-link still issues a signed link without direct DB access', async () => {
    mockHasDirectDatabaseConnection.mockReturnValue(false);

    const res = await request(app)
      .post('/api/stripe/vehicle-checkout-link')
      .set('Authorization', 'Bearer fake-token')
      .send({
        application_id: APPROVED_APPLICATION_ID,
      });

    expect(res.status).toBe(200);
    expect(res.body.checkout_url).toContain('/checkout/1?');
    expect(mockState.applications[1].payment_link_version).toBe(2);
  });

  it('POST /api/stripe/vehicle-checkout-link returns a fresh signed payment link', async () => {
    const res = await request(app)
      .post('/api/stripe/vehicle-checkout-link')
      .set('Authorization', 'Bearer fake-token')
      .send({
        application_id: APPROVED_APPLICATION_ID,
      });

    expect(res.status).toBe(200);
    expect(res.body.checkout_url).toContain('/checkout/1?');
    expect(res.body.checkout_url).toContain(`application_id=${APPROVED_APPLICATION_ID}`);
    expect(mockState.applications[1].payment_link_version).toBe(2);
    expect(res.body.checkout_url).toContain(
      `#checkout_token=${encodeURIComponent(res.body.checkout_token)}`
    );

    const verified = verifyCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: 'vehicle',
      token: res.body.checkout_token,
      version: 2,
    });
    expect(verified.applicationId).toBe(APPROVED_APPLICATION_ID);
    expect(verified.carId).toBe(1);
  });

  it('POST /api/stripe/vehicle-checkout-link rejects approved applications that are missing pricing', async () => {
    mockState.applications[1].approved_weekly_price = 0;

    const res = await request(app)
      .post('/api/stripe/vehicle-checkout-link')
      .set('Authorization', 'Bearer fake-token')
      .send({
        application_id: APPROVED_APPLICATION_ID,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('missing approved pricing');
  });

  it('GET /api/stripe/checkout-sessions/:id requires a matching checkout token', async () => {
    const res = await request(app).get('/api/stripe/checkout-sessions/cs_test_123');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('GET /api/stripe/checkout-sessions/:id returns the Stripe session status', async () => {
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: 'vehicle',
      version: 1,
    });
    const res = await request(app).get('/api/stripe/checkout-sessions/cs_test_123').query({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      checkout_token: token.token,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      application_status: 'Approved',
      checkout_kind: 'vehicle',
      id: 'cs_test_123',
      internal_status: 'pending',
      payment_status: 'paid',
      rental_status: null,
      status: 'complete',
    });
  });

  it('GET /api/stripe/checkout-sessions/:id returns complete once rental activation exists', async () => {
    mockState.applications[1].status = 'Paid';
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        status: 'Active',
        weekly_price: 250,
        bond_paid: 500,
        start_date: '2026-03-01',
      },
    ];
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: 'vehicle',
      version: 1,
    });
    const res = await request(app).get('/api/stripe/checkout-sessions/cs_test_123').query({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      checkout_token: token.token,
    });

    expect(res.status).toBe(200);
    expect(res.body.internal_status).toBe('complete');
    expect(res.body.application_status).toBe('Paid');
    expect(res.body.rental_status).toBe('Active');
  });

  it('GET /api/stripe/checkout-sessions/:id returns manual_review when payment completed but activation was blocked', async () => {
    mockState.applications[1].status = 'Payment Review';

    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: 'vehicle',
      version: 1,
    });
    const res = await request(app).get('/api/stripe/checkout-sessions/cs_test_123').query({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      checkout_token: token.token,
    });

    expect(res.status).toBe(200);
    expect(res.body.internal_status).toBe('manual_review');
    expect(res.body.application_status).toBe('Payment Review');
  });

  it('GET /api/stripe/checkout-sessions/:id rejects sessions for the wrong checkout kind', async () => {
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: 'cs_test_123',
      status: 'complete',
      payment_status: 'paid',
      metadata: {
        application_id: APPROVED_APPLICATION_ID,
        car_id: '',
        checkout_kind: 'application',
        payment_link_version: '1',
      },
    });
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: 'vehicle',
      version: 1,
    });
    const res = await request(app).get('/api/stripe/checkout-sessions/cs_test_123').query({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      checkout_token: token.token,
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Checkout session does not match this payment link.');
  });

  it('GET /api/stripe/checkout-sessions/:id rejects sessions for the wrong vehicle', async () => {
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: 'cs_test_123',
      status: 'complete',
      payment_status: 'paid',
      metadata: {
        application_id: APPROVED_APPLICATION_ID,
        car_id: '2',
        checkout_kind: 'vehicle',
        payment_link_version: '1',
      },
    });
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: 'vehicle',
      version: 1,
    });
    const res = await request(app).get('/api/stripe/checkout-sessions/cs_test_123').query({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      checkout_token: token.token,
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Checkout session does not match this vehicle link.');
  });

  it('POST /api/stripe/webhook activates the rental and records paid bond on success', async () => {
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: 'evt_test_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_live_vehicle',
          payment_status: 'paid',
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: '500.00',
            approved_weekly_price: '250.00',
            car_id: '1',
            checkout_kind: 'vehicle',
            payment_link_version: '1',
          },
          customer: 'cus_123',
          subscription: 'sub_123',
        },
      },
    });

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'test-signature')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(200);
    expect(mockState.cars[0].status).toBe('Rented');
    expect(mockState.applications[1].status).toBe('Paid');
    expect(mockState.applications[1].pending_checkout_session_id).toBeNull();
    expect(mockState.rentals[0]).toMatchObject({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      bond_paid: 500,
      weekly_price: 250,
      status: 'Active',
      stripe_subscription_id: 'sub_123',
    });
  });

  it('POST /api/stripe/webhook moves paid checkouts to Payment Review when direct DB access is unavailable', async () => {
    mockHasDirectDatabaseConnection.mockReturnValue(false);
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: 'evt_test_2',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_live_vehicle',
          payment_status: 'paid',
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: '500.00',
            approved_weekly_price: '250.00',
            car_id: '1',
            checkout_kind: 'vehicle',
            payment_link_version: '1',
          },
          customer: 'cus_123',
          subscription: 'sub_123',
        },
      },
    });

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'test-signature')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(200);
    expect(mockState.cars[0].status).toBe('Available');
    expect(mockState.applications[1].status).toBe('Payment Review');
    expect(mockState.applications[1].pending_checkout_session_id).toBe('cs_live_vehicle');
    expect(mockState.rentals).toHaveLength(0);
  });

  it('POST /api/stripe/webhook skips subscription lifecycle updates when strict Stripe rental identity is missing', async () => {
    mockState.cars[0].status = 'Rented';
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        bond_paid: 500,
        car_id: 1,
        status: 'Active',
        weekly_price: 250,
        start_date: '2026-03-01',
      },
    ];
    mockStripe.subscriptionsRetrieve.mockResolvedValueOnce({
      id: 'sub_missing_link',
      metadata: { application_id: APPROVED_APPLICATION_ID, car_id: '1' },
    });
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: 'evt_test_3',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_failed',
          subscription: 'sub_missing_link',
        },
      },
    });

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'test-signature')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(200);
    expect(mockState.rentals[0].status).toBe('Active');
  });

  it('POST /api/stripe/webhook sends stale checkout sessions to manual review instead of activating the wrong car', async () => {
    mockState.cars[1].status = 'Available';
    mockState.applications[1].assigned_car_id = 2;
    mockState.applications[1].approved_bond = 600;
    mockState.applications[1].approved_weekly_price = 275;
    mockState.applications[1].payment_link_version = 2;
    mockState.applications[1].status = 'Approved';
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: 'evt_test_4',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_stale_vehicle',
          payment_status: 'paid',
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: '500.00',
            approved_weekly_price: '250.00',
            car_id: '1',
            checkout_kind: 'vehicle',
            payment_link_version: '1',
          },
          customer: 'cus_stale',
          subscription: 'sub_stale',
        },
      },
    });

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'test-signature')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(200);
    expect(mockState.rentals).toHaveLength(0);
    expect(mockState.cars[0].status).toBe('Available');
    expect(mockState.cars[1].status).toBe('Available');
    expect(mockState.applications[1].status).toBe('Payment Review');
    expect(mockState.applications[1].pending_checkout_session_id).toBe('cs_stale_vehicle');
  });

  it('POST /api/stripe/webhook repairs an existing rental created before a retry', async () => {
    mockState.cars[0].status = 'Available';
    mockState.applications[1].status = 'Approved';
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        status: 'Pending',
        weekly_price: 0,
        bond_paid: 0,
        start_date: '2026-03-01',
      },
    ];
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: 'evt_test_5',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_retry_vehicle',
          payment_status: 'paid',
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: '500.00',
            approved_weekly_price: '250.00',
            car_id: '1',
            checkout_kind: 'vehicle',
            payment_link_version: '1',
          },
          customer: 'cus_123',
          subscription: 'sub_retry',
        },
      },
    });

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'test-signature')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(200);
    expect(mockState.rentals[0]).toMatchObject({
      bond_paid: 500,
      weekly_price: 250,
      status: 'Active',
      stripe_subscription_id: 'sub_retry',
    });
    expect(mockState.cars[0].status).toBe('Rented');
    expect(mockState.applications[1].status).toBe('Paid');
  });

  it('POST /api/stripe/webhook ignores replayed completions for an already active rental', async () => {
    mockState.cars[0].status = 'Rented';
    mockState.applications[1].status = 'Paid';
    mockState.applications[1].paid_at = '2026-03-08T00:00:00.000Z';
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        bond_paid: 500,
        car_id: 1,
        status: 'Active',
        weekly_price: 250,
        start_date: '2026-03-01',
        stripe_subscription_id: 'sub_replay',
      },
    ];
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: 'evt_test_6',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_replayed',
          payment_status: 'paid',
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: '500.00',
            approved_weekly_price: '250.00',
            car_id: '1',
            checkout_kind: 'vehicle',
            payment_link_version: '1',
          },
          customer: 'cus_replay',
          subscription: 'sub_replay',
        },
      },
    });

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'test-signature')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(200);
    expect(mockState.rentals).toHaveLength(1);
    expect(mockState.rentals[0]).toMatchObject({
      id: 20,
      start_date: '2026-03-01',
      stripe_subscription_id: 'sub_replay',
    });
    expect(mockState.applications[1].paid_at).toBe('2026-03-08T00:00:00.000Z');
  });

  it('POST /api/stripe/webhook ignores duplicate delivery for the same Stripe event id', async () => {
    const duplicateEvent = {
      id: 'evt_duplicate_delivery',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_live_vehicle',
          payment_status: 'paid',
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: '500.00',
            approved_weekly_price: '250.00',
            car_id: '1',
            checkout_kind: 'vehicle',
            payment_link_version: '1',
          },
          customer: 'cus_dup',
          subscription: 'sub_dup',
        },
      },
    };

    mockStripe.webhooksConstructEvent.mockReturnValue(duplicateEvent);

    const first = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'test-signature')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(first.status).toBe(200);
    expect(mockState.stripe_webhook_events).toHaveLength(1);
    expect(mockState.rentals).toHaveLength(1);

    const second = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'test-signature')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(second.status).toBe(200);
    expect(mockState.stripe_webhook_events).toHaveLength(1);
    expect(mockState.rentals).toHaveLength(1);
  });

  it('POST /api/stripe/webhook retries stale in-flight ledger events after reclaiming the claim', async () => {
    mockState.stripe_webhook_events = [
      {
        id: 999,
        stripe_event_id: 'evt_stale_processing',
        event_type: 'checkout.session.completed',
        status: 'processing',
        received_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      },
    ];

    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: 'evt_stale_processing',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_stale_reclaim',
          payment_status: 'paid',
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: '500.00',
            approved_weekly_price: '250.00',
            car_id: '1',
            checkout_kind: 'vehicle',
            payment_link_version: '1',
          },
          customer: 'cus_stale_reclaim',
          subscription: 'sub_stale_reclaim',
        },
      },
    });

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'test-signature')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(200);
    expect(mockState.rentals).toHaveLength(1);
    expect(mockState.stripe_webhook_events).toHaveLength(1);
    expect(mockState.stripe_webhook_events[0].status).toBe('processed');
  });

  it('POST /api/stripe/webhook blocks duplicate vehicle activation for the same car', async () => {
    mockState.rentals = [
      {
        id: 20,
        application_id: BLOCKING_APPLICATION_ID,
        bond_paid: 500,
        car_id: 1,
        status: 'Active',
        weekly_price: 250,
        start_date: '2026-03-01',
      },
    ];
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: 'evt_test_7',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_live_vehicle',
          payment_status: 'paid',
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: '500.00',
            approved_weekly_price: '250.00',
            car_id: '1',
            checkout_kind: 'vehicle',
            payment_link_version: '1',
          },
          customer: 'cus_123',
          subscription: 'sub_123',
        },
      },
    });

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'test-signature')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(200);
    expect(mockState.rentals).toHaveLength(1);
    expect(mockState.rentals[0].application_id).toBe(BLOCKING_APPLICATION_ID);
    expect(mockState.applications[1].status).toBe('Payment Review');
    expect(mockState.applications[1].paid_at).toBeTruthy();
    expect(mockState.applications[1].pending_checkout_session_id).toBe('cs_live_vehicle');
  });

  it('POST /api/stripe/webhook blocks vehicle activation when the car is under maintenance', async () => {
    mockState.cars[0].status = 'Maintenance';
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: 'evt_test_8',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_vehicle_maintenance',
          payment_status: 'paid',
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: '500.00',
            approved_weekly_price: '250.00',
            car_id: '1',
            checkout_kind: 'vehicle',
            payment_link_version: '1',
          },
          customer: 'cus_123',
          subscription: 'sub_maintenance',
        },
      },
    });

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'test-signature')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(200);
    expect(mockState.rentals).toHaveLength(0);
    expect(mockState.cars[0].status).toBe('Maintenance');
    expect(mockState.applications[1].status).toBe('Payment Review');
    expect(mockState.applications[1].pending_checkout_session_id).toBe('cs_vehicle_maintenance');
  });

  it('POST /api/stripe/webhook auto-activates a paid Payment Review case when the same session replays', async () => {
    mockState.applications[1].status = 'Payment Review';
    mockState.applications[1].paid_at = '2026-03-06T00:00:00.000Z';
    mockState.applications[1].pending_checkout_session_id = 'cs_vehicle_resume';
    mockState.cars[0].status = 'Available';
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: 'evt_test_9',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_vehicle_resume',
          payment_status: 'paid',
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: '500.00',
            approved_weekly_price: '250.00',
            car_id: '1',
            checkout_kind: 'vehicle',
            payment_link_version: '1',
          },
          customer: 'cus_resume',
          subscription: 'sub_resume',
        },
      },
    });

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'test-signature')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(200);
    expect(mockState.applications[1].status).toBe('Paid');
    expect(mockState.applications[1].paid_at).toBe('2026-03-06T00:00:00.000Z');
    expect(mockState.applications[1].pending_checkout_session_id).toBeNull();
    expect(mockState.cars[0].status).toBe('Rented');
    expect(mockState.rentals[0]).toMatchObject({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      status: 'Active',
      stripe_subscription_id: 'sub_resume',
    });
  });

  it('POST /api/stripe/webhook keeps the car rented when another live rental still exists', async () => {
    mockState.cars[0].status = 'Rented';
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        bond_paid: 500,
        car_id: 1,
        status: 'Active',
        weekly_price: 250,
        start_date: '2026-03-01',
        stripe_subscription_id: 'sub_completed',
      },
      {
        id: 21,
        application_id: BLOCKING_APPLICATION_ID,
        bond_paid: 500,
        car_id: 1,
        status: 'Active',
        weekly_price: 260,
        start_date: '2026-03-05',
        stripe_subscription_id: 'sub_live',
      },
    ];
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: 'evt_test_10',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_completed',
          cancellation_details: {
            comment: null,
            feedback: null,
            reason: 'cancellation_requested',
          },
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            car_id: '1',
          },
        },
      },
    });

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'test-signature')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(200);
    expect(mockState.cars[0].status).toBe('Rented');
    expect(mockState.rentals.find((rental) => rental.id === 20)?.status).toBe('Completed');
    expect(mockState.rentals.find((rental) => rental.id === 21)?.status).toBe('Active');
  });

  it('POST /api/stripe/webhook keeps the car unavailable after involuntary subscription cancellation', async () => {
    mockState.cars[0].status = 'Rented';
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        bond_paid: 500,
        car_id: 1,
        status: 'Active',
        weekly_price: 250,
        start_date: '2026-03-01',
        stripe_subscription_id: 'sub_failed',
      },
    ];
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: 'evt_test_11',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_failed',
          cancellation_details: {
            comment: null,
            feedback: null,
            reason: 'payment_failed',
          },
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            car_id: '1',
          },
        },
      },
    });

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'test-signature')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(200);
    expect(mockState.cars[0].status).toBe('Rented');
    expect(mockState.rentals.find((rental) => rental.id === 20)?.status).toBe('Cancelled');
  });
});
