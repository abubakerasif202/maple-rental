import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const {
  mockState,
  mockGetUser,
  mockSignInWithPassword,
  mockStorageFrom,
  mockCreateAuthClient,
} = vi.hoisted(() => ({
  mockState: {
    cars: [] as Array<Record<string, any>>,
    applications: [] as Array<Record<string, any>>,
    customers: [] as Array<Record<string, any>>,
    invoices: [] as Array<Record<string, any>>,
  },
  mockGetUser: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockStorageFrom: vi.fn(),
  mockCreateAuthClient: vi.fn(),
}));

vi.mock('../db/index.js', () => {
  const getTableRows = (table: string) => {
    if (table === 'cars') {
      return mockState.cars;
    }

    if (table === 'applications') {
      return mockState.applications;
    }

    if (table === 'customers') {
      return mockState.customers;
    }

    if (table === 'invoices') {
      return mockState.invoices;
    }

    return [];
  };

  const applyFilters = (
    rows: Array<Record<string, any>>,
    filters: Array<{ column: string; value: unknown }>
  ) =>
    rows.filter((row) =>
      filters.every(({ column, value }) => String(row[column]) === String(value))
    );

  const createSelectQuery = (
    table: string,
    filters: Array<{ column: string; value: unknown }> = []
  ) => ({
    order: vi.fn(async () => ({
      data: structuredClone(applyFilters(getTableRows(table), filters)),
      error: null,
    })),
    eq: vi.fn((column: string, value: unknown) =>
      createSelectQuery(table, [...filters, { column, value }])
    ),
    single: vi.fn(async () => {
      const [row] = applyFilters(getTableRows(table), filters);
      return row
        ? { data: structuredClone(row), error: null }
        : { data: null, error: { message: 'Not found' } };
    }),
  });

  const createMutationQuery = (
    table: string,
    action: 'update' | 'delete',
    payload?: Record<string, any>
  ) => ({
    eq: vi.fn(async (column: string, value: unknown) => {
      const rows = getTableRows(table);
      const nextRows =
        action === 'delete'
          ? rows.filter((row) => String(row[column]) !== String(value))
          : rows.map((row) =>
              String(row[column]) === String(value) ? { ...row, ...payload } : row
            );

      if (table === 'cars') {
        mockState.cars = nextRows;
      }

      if (table === 'applications') {
        mockState.applications = nextRows;
      }

      if (table === 'customers') {
        mockState.customers = nextRows;
      }

      if (table === 'invoices') {
        mockState.invoices = nextRows;
      }

      return { error: null };
    }),
  });

  const createInsertQuery = (table: string, records: Array<Record<string, any>>) => ({
    select: vi.fn(() => ({
      single: vi.fn(async () => {
        const currentRows = getTableRows(table);
        const nextId =
          currentRows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
        const insertedRow = { ...records[0], id: nextId };

        if (table === 'cars') {
          mockState.cars = [...mockState.cars, insertedRow];
        }

        if (table === 'applications') {
          mockState.applications = [...mockState.applications, insertedRow];
        }

        if (table === 'customers') {
          mockState.customers = [...mockState.customers, insertedRow];
        }

        if (table === 'invoices') {
          mockState.invoices = [...mockState.invoices, insertedRow];
        }

        return { data: { id: insertedRow.id }, error: null };
      }),
    })),
  });

  return {
    db: {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => createSelectQuery(table)),
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
    initializeDB: vi.fn(() => Promise.resolve()),
  };
});

import app from '../index.js';

beforeEach(() => {
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
      id: 1,
      name: 'Jane Driver',
      phone: '0412345678',
      email: 'jane@example.com',
      license_number: 'NSW12345',
      license_expiry: '2027-01-01',
      uber_status: 'Active',
      experience: 'New Driver',
      address: '1 Test Street',
      weekly_budget: '$300/week',
      intended_start_date: '2026-03-10',
      license_photo: 'docs/license-1.png',
      uber_screenshot: 'docs/uber-1.png',
      status: 'Pending',
      created_at: '2026-03-03T00:00:00.000Z',
    },
    {
      id: 2,
      name: 'Approved Driver',
      phone: '0499999999',
      email: 'approved@example.com',
      license_number: 'NSW99999',
      license_expiry: '2027-06-01',
      uber_status: 'Active',
      experience: '1-3 years',
      address: '2 Test Street',
      weekly_budget: '$350/week',
      intended_start_date: '2026-03-12',
      license_photo: 'https://project.supabase.co/storage/v1/object/public/applications/docs/license-2.png',
      uber_screenshot: null,
      status: 'Approved',
      created_at: '2026-03-04T00:00:00.000Z',
    },
  ];

  mockState.customers = [
    {
      id: 1,
      external_id: '60499',
      staff_number: '1012',
      full_name: 'Gagandeep Singh',
      preferred_name: 'Gagandeep Singh',
      company_name: 'Gagandeep',
      phone: '0423115111',
      email: 'gagandeep.561222@gmail.com',
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
      full_name: 'Hasan Nasir',
      preferred_name: 'Hasan Nasir',
      company_name: 'Hasan',
      phone: '0411127067',
      email: 'hasanchahal0@gmail.com',
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
      customer_name: 'Gagandeep Singh',
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
      customer_name: 'Hasan Nasir',
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

  mockGetUser.mockResolvedValue({
    data: { user: { email: 'admin@maplerentals.com.au' } },
    error: null,
  });
  mockSignInWithPassword.mockImplementation(async ({ email }: { email: string }) => ({
    data: {
      session: { access_token: 'fake-token' },
      user: { email },
    },
    error: null,
  }));
  mockCreateAuthClient.mockReturnValue({
    auth: {
      getUser: mockGetUser,
      signInWithPassword: mockSignInWithPassword,
    },
  });
  mockStorageFrom.mockImplementation((bucket: string) => ({
    upload: vi.fn(async (path: string) => ({ data: { path }, error: null })),
    createSignedUrl: vi.fn(async (path: string) => ({
      data: { signedUrl: `https://signed.example/${bucket}/${path}` },
      error: null,
    })),
  }));

  vi.clearAllMocks();
});

describe('Cars API', () => {
  it('GET /api/cars should return a list of cars', async () => {
    const res = await request(app).get('/api/cars');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].name).toBe('Toyota Camry');
  });

  it('GET /api/cars/:id should return a single car', async () => {
    const res = await request(app).get('/api/cars/1');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Toyota Camry');
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

  it('POST /api/auth/login should deny non-admin email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'notadmin@example.com', password: 'password' });

    expect(res.status).toBe(403);
  });
});

describe('Applications API', () => {
  it('GET /api/applications returns signed document URLs for admins', async () => {
    const res = await request(app)
      .get('/api/applications')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body[0].license_photo).toBe(
      'https://signed.example/applications/docs/license-1.png'
    );
    expect(res.body[0].uber_screenshot).toBe(
      'https://signed.example/applications/docs/uber-1.png'
    );
    expect(res.body[1].license_photo).toBe(
      'https://signed.example/applications/docs/license-2.png'
    );
  });
});

describe('Operational history API', () => {
  it('GET /api/customers returns customer summaries for admins', async () => {
    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.items[0].invoice_count).toBe(1);
    expect(res.body.items[0].total_billed).toBe(230.99);
  });

  it('GET /api/invoices returns invoice history for admins', async () => {
    const res = await request(app)
      .get('/api/invoices')
      .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.items[0].external_invoice_number).toBe('1882');
    expect(res.body.items[1].status).toBe('Paid');
  });
});

describe('Stripe API', () => {
  it('POST /api/stripe/create-subscription rejects caller supplied pricing fields', async () => {
    const res = await request(app).post('/api/stripe/create-subscription').send({
      car_id: 1,
      application_id: 2,
      custom_weekly_price: 1,
      custom_bond: 1,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('POST /api/stripe/create-subscription requires an application id for car checkout', async () => {
    const res = await request(app).post('/api/stripe/create-subscription').send({
      car_id: 1,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('POST /api/stripe/create-subscription rejects unavailable cars', async () => {
    const res = await request(app).post('/api/stripe/create-subscription').send({
      car_id: 2,
      application_id: 2,
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Selected vehicle is no longer available');
  });

  it('POST /api/stripe/create-subscription requires an approved application for car checkout', async () => {
    const res = await request(app).post('/api/stripe/create-subscription').send({
      car_id: 1,
      application_id: 1,
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Application must be approved before starting car checkout');
  });
});
