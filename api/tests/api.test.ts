import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { getTodayInAustralia } from "../../shared/applicationSubmission.js";
import { cancellationIdempotencyKey } from "../cancellationOperations.js";

const addDaysToDateOnly = (dateOnly: string, days: number) => {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

const getFutureDateOnly = (days: number) =>
  addDaysToDateOnly(getTodayInAustralia(), days);

const getPastDateOnly = (days: number) =>
  addDaysToDateOnly(getTodayInAustralia(), -days);

const buildStripePayout = (index: number) => ({
  id: `po_${index + 1}`,
  amount: (index + 1) * 10000,
  arrival_date: 1710000000 + index * 86400,
  status: "paid" as const,
});

const PENDING_APPLICATION_ID = "11111111-1111-4111-8111-111111111111";
const APPROVED_APPLICATION_ID = "22222222-2222-4222-8222-222222222222";
const UNDERSCORE_APPLICATION_ID = "33333333-3333-4333-8333-333333333333";
const UNDERSCORE_REJECTED_APPLICATION_ID =
  "44444444-4444-4444-8444-444444444444";
const BLOCKING_APPLICATION_ID = "99999999-9999-4999-8999-999999999999";
const UNKNOWN_APPLICATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type ApplicationSubmissionFields = {
  selected_car_id?: string | number;
  name: string;
  phone: string;
  email: string;
  license_number: string;
  license_expiry: string;
  uber_status: string;
  experience: string;
  address: string;
  weekly_budget?: string;
  intended_start_date: string;
  agreement_accepted: string;
  agreement_signature: string;
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
    passport_or_uber_profile_screenshot: string | ApplicationUploadFixture;
  }
>;

const PNG_FIXTURE_MAGIC = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_FIXTURE_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

const buildValidImageBuffer = (contentType: string, payload: Buffer) => {
  const normalized = contentType.toLowerCase();
  if (normalized === "image/png") {
    return Buffer.concat([PNG_FIXTURE_MAGIC, payload]);
  }

  if (normalized === "image/jpeg" || normalized === "image/jpg") {
    return Buffer.concat([JPEG_FIXTURE_MAGIC, payload]);
  }

  return payload;
};

const DEFAULT_APPLICATION_UPLOAD: ApplicationUploadFixture = {
  buffer: buildValidImageBuffer("image/png", Buffer.from("fake-image")),
  contentType: "image/png",
  filename: "license.png",
};

const DEFAULT_PASSPORT_UPLOAD: ApplicationUploadFixture = {
  buffer: buildValidImageBuffer("image/png", Buffer.from("passport-image")),
  contentType: "image/png",
  filename: "passport.png",
};

const buildApplicationUploadFixture = (
  value: string | ApplicationUploadFixture | undefined,
  basename: string,
): ApplicationUploadFixture => {
  if (!value) {
    return {
      ...DEFAULT_APPLICATION_UPLOAD,
      filename: `${basename}.png`,
    };
  }

  if (typeof value !== "string") {
    return value;
  }

  const dataUrlMatch = value.match(/^data:(.+);base64,(.+)$/);
  if (!dataUrlMatch) {
    throw new Error(`Unsupported test upload fixture for ${basename}`);
  }

  const [, contentType, encoded] = dataUrlMatch;
  const extension =
    contentType === "image/jpeg"
      ? "jpg"
      : contentType === "image/png"
        ? "png"
        : contentType.split("/").at(-1) || "bin";

  return {
    buffer: buildValidImageBuffer(contentType, Buffer.from(encoded, "base64")),
    contentType,
    filename: `${basename}.${extension}`,
  };
};

const createApplicationSubmissionRequest = (
  overrides: ApplicationSubmissionOverrides = {},
) => {
  const {
    license_photo,
    license_back_photo,
    passport_or_uber_profile_screenshot,
    ...fieldOverrides
  } = overrides;
  const payload: ApplicationSubmissionFields = {
    selected_car_id: "1",
    name: "Jane Driver",
    phone: "0412345678",
    email: "jane@example.com",
    license_number: "NSW12345",
    license_expiry: getFutureDateOnly(365),
    uber_status: "Active",
    experience: "New Driver",
    address: "1 Test Street",
    intended_start_date: getFutureDateOnly(7),
    agreement_accepted: "true",
    agreement_signature: "Jane Driver",
    ...fieldOverrides,
  };

  let req = request(app).post("/api/applications");
  Object.entries(payload).forEach(([key, value]) => {
    if (value == null) {
      return;
    }
    req = req.field(key, String(value));
  });

  const frontUpload = buildApplicationUploadFixture(license_photo, "license");
  const backUpload = buildApplicationUploadFixture(
    license_back_photo,
    "license-back",
  );
  const passportUpload = buildApplicationUploadFixture(
    passport_or_uber_profile_screenshot ?? DEFAULT_PASSPORT_UPLOAD,
    "passport",
  );

  req = req.attach("license_photo", frontUpload.buffer, {
    contentType: frontUpload.contentType,
    filename: frontUpload.filename,
  });
  req = req.attach("license_back_photo", backUpload.buffer, {
    contentType: backUpload.contentType,
    filename: backUpload.filename,
  });
  req = req.attach(
    "passport_or_uber_profile_screenshot",
    passportUpload.buffer,
    {
      contentType: passportUpload.contentType,
      filename: passportUpload.filename,
    },
  );

  return req;
};

const {
  mockState,
  mockGetUser,
  mockRefreshSession,
  mockSignInWithPassword,
  mockStorageFrom,
  mockCheckDBHealth,
  mockCheckDirectDatabaseHealth,
  mockCreateAuthClient,
  mockClosePostgresPool,
  mockDbRpc,
  mockGetSupabaseAuthConfigurationIssues,
  mockGetSupabaseConfigurationIssues,
  mockHasDirectDatabaseConnection,
  mockWithPostgresAdvisoryLock,
  mockBeforeApplicationsUpdate,
  mockMutationErrors,
  mockResendEmailsSend,
  mockStripe,
} = vi.hoisted(() => ({
  mockState: {
    cars: [] as Array<Record<string, any>>,
    applications: [] as Array<Record<string, any>>,
    rentals: [] as Array<Record<string, any>>,
    lease_agreements: [] as Array<Record<string, any>>,
    agreement_templates: [] as Array<Record<string, any>>,
    customers: [] as Array<Record<string, any>>,
    invoices: [] as Array<Record<string, any>>,
    bookings: [] as Array<Record<string, any>>,
    toll_transfer_notices: [] as Array<Record<string, any>>,
    toll_transfer_notice_audit_events: [] as Array<Record<string, any>>,
    toll_notice_delivery_attempts: [] as Array<Record<string, any>>,
    manual_invoices: [] as Array<Record<string, any>>,
    manual_invoice_items: [] as Array<Record<string, any>>,
    stripe_webhook_events: [] as Array<Record<string, any>>,
    stripe_cancellation_operations: [] as Array<Record<string, any>>,
    stripe_balance_transactions: [] as Array<Record<string, any>>,
    admin_audit_events: [] as Array<Record<string, any>>,
    queryLog: [] as Array<{
      columns?: string;
      filters: Array<Record<string, any>>;
      options: Record<string, any>;
      range?: Record<string, number> | null;
      table: string;
    }>,
    failOnDeleteTable: null as string | null,
    failOnAuditAction: null as string | null,
    leaseAgreementInsertErrorMode: null as
      | null
      | "missing_vehicle_label"
      | "car_id_required"
      | "legacy_application_id_required"
      | "generic_failure",
  },
  mockGetUser: vi.fn(),
  mockRefreshSession: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockStorageFrom: vi.fn(),
  mockCheckDBHealth: vi.fn(),
  mockCheckDirectDatabaseHealth: vi.fn(),
  mockCreateAuthClient: vi.fn(),
  mockClosePostgresPool: vi.fn(async () => undefined),
  mockDbRpc: vi.fn(),
  mockGetSupabaseAuthConfigurationIssues: vi.fn(() => []),
  mockGetSupabaseConfigurationIssues: vi.fn(() => []),
  mockHasDirectDatabaseConnection: vi.fn(() => false),
  mockWithPostgresAdvisoryLock: vi.fn(
    async (_lockKey: string, callback: () => Promise<unknown>) => callback(),
  ),
  mockBeforeApplicationsUpdate: vi.fn(() => undefined),
  mockMutationErrors: {
    applicationsUpdate: null as Record<string, any> | null,
  },
  mockResendEmailsSend: vi.fn(),
    mockStripe: {
      checkoutSessionsCreate: vi.fn(),
      checkoutSessionsExpire: vi.fn(),
      checkoutSessionsList: vi.fn(),
      checkoutSessionsRetrieve: vi.fn(),
      invoiceItemsCreate: vi.fn(),
      subscriptionsRetrieve: vi.fn(),
    subscriptionsUpdate: vi.fn(),
    subscriptionsCancel: vi.fn(),
    payoutsList: vi.fn(),
    webhooksConstructEvent: vi.fn(),
  },
}));

vi.mock("resend", () => {
  class MockResend {
    emails = {
      send: mockResendEmailsSend,
    };
  }

  return {
    Resend: MockResend,
  };
});

vi.mock("stripe", () => {
  class MockStripe {
    customers = { create: vi.fn() };
    products = { create: vi.fn() };
    prices = { create: vi.fn() };
    invoiceItems = { create: mockStripe.invoiceItemsCreate };
    subscriptions = {
      create: vi.fn(),
      retrieve: mockStripe.subscriptionsRetrieve,
      update: mockStripe.subscriptionsUpdate,
      cancel: mockStripe.subscriptionsCancel,
    };
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
      list: mockStripe.payoutsList,
    };
    balanceTransactions = {
      list: vi.fn(),
    };
  }

  return {
    default: MockStripe,
  };
});

vi.mock("../schemaCompat.js", async () => {
  const actual =
    await vi.importActual<typeof import("../schemaCompat.js")>(
      "../schemaCompat.js",
    );

  return {
    ...actual,
    getApplicationDuplicateCheckColumns: vi.fn(async () =>
      ["id", "phone", "email", "license_number:licenseNumber", "status"].join(
        ", ",
      ),
    ),
    getApplicationDocumentColumn: vi.fn(async (column: string) => {
      if (column === "license_back_photo") return "uberScreenshot";
      if (column === "passport_or_uber_profile_screenshot") {
        return "passportOrUberProfileScreenshot";
      }
      return "licensePhoto";
    }),
    getApplicationSelectColumns: vi.fn(async () =>
      [
        "id",
        "name",
        "phone",
        "email",
        "license_number:licenseNumber",
        "license_expiry:licenseExpiry",
        "uber_status:uberStatus",
        "experience",
        "address",
        "weekly_budget:weeklyBudget",
        "intended_start_date:intendedStartDate",
        "license_photo:licensePhoto",
        "license_back_photo:uberScreenshot",
        "passport_or_uber_profile_screenshot:passportOrUberProfileScreenshot",
        "agreement_accepted_at:agreementAcceptedAt",
        "agreement_signature:agreementSignature",
        "cancelled_at:cancelledAt",
        "cancel_reason:cancelReason",
        "assigned_car_id:assignedCarId",
        "approved_bond:approvedBond",
        "bond_notes:bondNotes",
        "bond_payment_method:bondPaymentMethod",
        "bond_payment_status:bondPaymentStatus",
        "approved_weekly_price:approvedWeeklyPrice",
        "payment_link_version:paymentLinkVersion",
        "payment_link_sent_at:paymentLinkSentAt",
        "approved_at:approvedAt",
        "paid_at:paidAt",
        "pending_checkout_session_id:pendingCheckoutSessionId",
        "status",
        "created_at:createdAt",
      ].join(", "),
    ),
    getApplicationListSelectColumns: vi.fn(async () =>
      [
        "id",
        "name",
        "phone",
        "email",
        "license_number:licenseNumber",
        "license_expiry:licenseExpiry",
        "uber_status:uberStatus",
        "experience",
        "address",
        "weekly_budget:weeklyBudget",
        "intended_start_date:intendedStartDate",
        "approved_bond:approvedBond",
        "bond_payment_status:bondPaymentStatus",
        "bond_payment_method:bondPaymentMethod",
        "bond_notes:bondNotes",
        "approved_vehicle:approvedVehicle",
        "approved_weekly_price:approvedWeeklyPrice",
        "payment_link_version:paymentLinkVersion",
        "payment_link_sent_at:paymentLinkSentAt",
        "approved_at:approvedAt",
        "agreement_accepted_at:agreementAcceptedAt",
        "agreement_signature:agreementSignature",
        "agreement_template_version:agreementTemplateVersion",
        "paid_at:paidAt",
        "pending_checkout_session_id:pendingCheckoutSessionId",
        "cancelled_at:cancelledAt",
        "cancel_reason:cancelReason",
        "status",
        "created_at:createdAt",
      ].join(", "),
    ),
    getApplicationImportedDataSelectColumns: vi.fn(async () =>
      [
        "id",
        "legacy_id:legacyId",
        "email",
        "phone",
        "license_number:licenseNumber",
        "experience",
        "status",
      ].join(", "),
    ),
  };
});

vi.mock("../db/index.js", () => {
  const getTableRows = (table: string) => {
    if (table === "cars") {
      return mockState.cars;
    }

    if (table === "applications") {
      return mockState.applications;
    }

    if (table === "rentals") {
      return mockState.rentals;
    }

    if (table === "lease_agreements") {
      return mockState.lease_agreements;
    }

    if (table === "agreement_templates") {
      return mockState.agreement_templates;
    }

    if (table === "customers") {
      return mockState.customers;
    }

    if (table === "invoices") {
      return mockState.invoices;
    }

    if (table === "bookings") {
      return mockState.bookings;
    }

    if (table === "toll_transfer_notices") {
      return mockState.toll_transfer_notices;
    }

    if (table === "toll_transfer_notice_audit_events") {
      return mockState.toll_transfer_notice_audit_events;
    }

    if (table === "manual_invoices") {
      return mockState.manual_invoices;
    }

    if (table === "manual_invoice_items") {
      return mockState.manual_invoice_items;
    }

    if (table === "stripe_webhook_events") {
      return mockState.stripe_webhook_events;
    }

    if (table === "stripe_cancellation_operations") {
      return mockState.stripe_cancellation_operations;
    }

    if (table === "stripe_balance_transactions") {
      return mockState.stripe_balance_transactions;
    }

    if (table === "admin_audit_events") {
      return mockState.admin_audit_events;
    }

    return [];
  };

  const setTableRows = (table: string, rows: Array<Record<string, any>>) => {
    if (table === "cars") {
      mockState.cars = rows;
      return;
    }

    if (table === "applications") {
      mockState.applications = rows;
      return;
    }

    if (table === "rentals") {
      mockState.rentals = rows;
      return;
    }

    if (table === "lease_agreements") {
      mockState.lease_agreements = rows;
      return;
    }

    if (table === "agreement_templates") {
      mockState.agreement_templates = rows;
      return;
    }

    if (table === "customers") {
      mockState.customers = rows;
      return;
    }

    if (table === "invoices") {
      mockState.invoices = rows;
      return;
    }

    if (table === "bookings") {
      mockState.bookings = rows;
      return;
    }

    if (table === "toll_transfer_notices") {
      mockState.toll_transfer_notices = rows;
      return;
    }

    if (table === "toll_transfer_notice_audit_events") {
      mockState.toll_transfer_notice_audit_events = rows;
      return;
    }

    if (table === "manual_invoices") {
      mockState.manual_invoices = rows;
      return;
    }

    if (table === "manual_invoice_items") {
      mockState.manual_invoice_items = rows;
      return;
    }

    if (table === "stripe_webhook_events") {
      mockState.stripe_webhook_events = rows;
      return;
    }

    if (table === "stripe_cancellation_operations") {
      mockState.stripe_cancellation_operations = rows;
      return;
    }

    if (table === "stripe_balance_transactions") {
      mockState.stripe_balance_transactions = rows;
      return;
    }

    if (table === "admin_audit_events") {
      mockState.admin_audit_events = rows;
    }
  };

  type QueryFilter =
    | { type: "eq"; column: string; value: unknown }
    | { type: "is"; column: string; value: unknown }
    | { type: "not"; column: string; operator: string; value: unknown }
    | { type: "gte"; column: string; value: unknown }
    | { type: "lte"; column: string; value: unknown }
    | { type: "ilike"; column: string; pattern: string }
    | { type: "in"; column: string; values: unknown[] }
    | {
        type: "or";
        referencedTable?: string;
        clauses: Array<
          | { type: "ilike"; column: string; search: string }
          | { type: "is"; column: string; value: string | null }
          | { type: "not"; column: string; operator: string; value: string }
          | { type: "in"; column: string; values: string[] }
        >;
      };

  const applyFilters = (
    rows: Array<Record<string, any>>,
    filters: QueryFilter[],
  ) =>
    rows.filter((row) =>
      filters.every((filter) => {
        const readValue = (column: string) => {
          if (column.includes(".")) {
            const [relation, ...rest] = column.split(".");
            const related = row[relation];
            const relatedRecord = Array.isArray(related) ? related[0] : related;
            return relatedRecord?.[rest.join(".")];
          }

          return row[column];
        };

        if (filter.type === "eq") {
          const rowValue = filter.column === "is_imported" && readValue(filter.column) == null
            ? ["demo", "imported", "legacy", "legacy-import", "test"].includes(
                String(row.source || "").toLowerCase(),
              ) || String(row.email || "").toLowerCase().endsWith("@example.invalid") ||
                String(row.phone || "") === "0000000000"
            : readValue(filter.column);
          if (filter.value == null) {
            return rowValue == null;
          }

          return String(rowValue) === String(filter.value);
        }

        if (filter.type === "is") {
          const rowValue = readValue(filter.column);
          if (filter.value == null) {
            return rowValue == null;
          }

          return String(rowValue) === String(filter.value);
        }

        if (filter.type === "gte") {
          const left = readValue(filter.column);
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

        if (filter.type === "lte") {
          const left = readValue(filter.column);
          const right = filter.value;

          if (left == null || right == null) {
            return false;
          }

          const leftAsNumber = Number(left);
          const rightAsNumber = Number(right);
          if (Number.isFinite(leftAsNumber) && Number.isFinite(rightAsNumber)) {
            return leftAsNumber <= rightAsNumber;
          }

          const leftAsTime = Date.parse(String(left));
          const rightAsTime = Date.parse(String(right));
          if (Number.isFinite(leftAsTime) && Number.isFinite(rightAsTime)) {
            return leftAsTime <= rightAsTime;
          }

          return String(left) <= String(right);
        }

        if (filter.type === "not") {
          if (filter.operator === "in") {
            const values = String(filter.value || "")
              .replace(/^\(|\)$/g, "")
              .split(",")
              .map((value) => value.trim().replace(/^"|"$/g, ""))
              .filter(Boolean);

            return !values.some((value) => String(readValue(filter.column)) === String(value));
          }

          if (filter.operator === "ilike") {
            const value = readValue(filter.column);
            if (value == null) {
              return false;
            }
            const source = String(value);
            const escapedPattern = String(filter.value || "")
              .replace(/[.+^${}()|[\]\\]/g, "\\$&")
              .replace(/[%*]/g, ".*")
              .replace(/_/g, ".");

            return !new RegExp(`^${escapedPattern}$`, "i").test(source);
          }

          if (filter.value == null) {
            return readValue(filter.column) != null;
          }

          const value = readValue(filter.column);
          if (value == null) {
            return false;
          }

          return String(value) !== String(filter.value);
        }

        if (filter.type === "ilike") {
          const source = String(readValue(filter.column) ?? "");
          const escapedPattern = filter.pattern
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/[%*]/g, ".*")
            .replace(/_/g, ".");

          return new RegExp(`^${escapedPattern}$`, "i").test(source);
        }

        if (filter.type === "in") {
          return filter.values.some(
            (value) => String(readValue(filter.column)) === String(value),
          );
        }

        const clauseColumn = (column: string) =>
          filter.referencedTable ? `${filter.referencedTable}.${column}` : column;

        return filter.clauses.some((clause) => {
          if (clause.type === "in") {
            return clause.values.some(
              (value) => String(readValue(clauseColumn(clause.column))) === String(value),
            );
          }

          if (clause.type === "is") {
            const rowValue = readValue(clauseColumn(clause.column));
            return clause.value == null
              ? rowValue == null
              : String(rowValue) === String(clause.value);
          }

          if (clause.type === "not") {
            const rowValue = readValue(clauseColumn(clause.column));
            if (rowValue == null) {
              return false;
            }

            if (clause.operator === "ilike") {
              const escapedPattern = String(clause.value || "")
                .replace(/[.+^${}()|[\]\\]/g, "\\$&")
                .replace(/[%*]/g, ".*")
                .replace(/_/g, ".");
              return !new RegExp(`^${escapedPattern}$`, "i").test(String(rowValue));
            }

            return String(rowValue) !== String(clause.value);
          }

          return String(readValue(clauseColumn(clause.column)) || "")
            .toLowerCase()
            .includes(clause.search.toLowerCase());
        });
      }),
    );

  const applyOrder = (
    rows: Array<Record<string, any>>,
    order?: { column: string; ascending: boolean } | null,
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
    range?: { from: number; to: number } | null,
  ) => {
    if (!range) {
      return rows;
    }

    return rows.slice(range.from, range.to + 1);
  };

  const buildUuidFromSequence = (sequence: number) => {
    const prefix = String(sequence).padStart(8, "0");
    const suffix = String(sequence).padStart(12, "0");
    return `${prefix}-0000-4000-8000-${suffix}`;
  };

  const splitPostgrestList = (value: string) =>
    value
      .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
      .map((entry) =>
        entry
          .trim()
          .replace(/^"|"$/g, "")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\"),
      )
      .filter(Boolean);

  const parseOrClauses = (expression: string) =>
    expression
      .split(/,(?=[A-Za-z_][A-Za-z0-9_]*\.)/)
      .map((clause) => {
        const [column, operator, ...rest] = clause.split(".");

        if (!column) {
          return null;
        }

        if (operator === "is") {
          const value = rest.join(".") === "null" ? null : rest.join(".");
          return { type: "is" as const, column, value };
        }

        if (operator === "not") {
          const [notOperator, ...notRest] = rest;
          if (!notOperator) {
            return null;
          }
          return {
            type: "not" as const,
            column,
            operator: notOperator,
            value: notRest.join("."),
          };
        }

        if (operator === "in") {
          const values = rest.join(".").replace(/^\(|\)$/g, "");
          const parsedValues = splitPostgrestList(values);
          return parsedValues.length > 0
            ? { type: "in" as const, column, values: parsedValues }
            : null;
        }

        if (operator !== "ilike") {
          return null;
        }

        const search = rest
          .join(".")
          .replace(/^%+|%+$/g, "")
          .replace(/^\*+|\*+$/g, "");
        return search ? { type: "ilike" as const, column, search } : null;
      })
      .filter((clause): clause is
        | { type: "ilike"; column: string; search: string }
        | { type: "is"; column: string; value: string | null }
        | { type: "not"; column: string; operator: string; value: string }
        | { type: "in"; column: string; values: string[] } =>
        Boolean(clause),
      );

  const createUnknownColumnError = (column: string) => {
    const camelColumnMap: Record<string, string> = {
      license_number: "licenseNumber",
      license_expiry: "licenseExpiry",
      license_photo: "licensePhoto",
      license_back_photo: "licenseBackPhoto",
      passport_or_uber_profile_screenshot:
        "passportOrUberProfileScreenshot",
      agreement_accepted_at: "agreementAcceptedAt",
      agreement_signature: "agreementSignature",
      cancelled_at: "cancelledAt",
      cancel_reason: "cancelReason",
    };

    return {
      code: "42703",
      details: null,
      hint: `Perhaps you meant to reference the column "applications.${camelColumnMap[column] ?? column}".`,
      message: `column applications.${column} does not exist`,
    };
  };

  const getInvalidApplicationSelectColumn = (columns?: string) => {
    if (typeof columns !== "string") {
      return null;
    }

    const invalidColumns = [
      "license_number",
      "license_expiry",
      "license_photo",
      "license_back_photo",
      "source",
    ];
    return (
      invalidColumns.find(
        (column) => columns.includes(column) && !columns.includes(`${column}:`),
      ) || null
    );
  };

  const createSelectQuery = (
    table: string,
    columns?: string,
    options: { count?: string; head?: boolean } = {},
    filters: QueryFilter[] = [],
    order?: { column: string; ascending: boolean } | null,
    range?: { from: number; to: number } | null,
  ) => {
    const invalidApplicationColumn =
      table === "applications"
        ? getInvalidApplicationSelectColumn(columns)
        : null;
    const includesApplicationInnerJoin =
      table === "rentals" && typeof columns === "string" && columns.includes("applications!inner");

    const attachRentalApplications = (
      rows: Array<Record<string, any>>,
    ): Array<Record<string, any>> => {
      if (!includesApplicationInnerJoin) {
        return rows;
      }

      return rows
        .map((row): Record<string, any> | null => {
          const application = mockState.applications.find(
            (candidate) => String(candidate.id) === String(row.application_id || row.applicationId),
          );
          return application ? { ...row, applications: structuredClone(application) } : null;
        })
        .filter((row): row is Record<string, any> => Boolean(row));
    };

    const resolveRows = async () => {
      mockState.queryLog.push({
        columns,
        filters: structuredClone(filters) as Array<Record<string, any>>,
        options: structuredClone(options),
        range: range ? structuredClone(range) : null,
        table,
      });

      if (invalidApplicationColumn) {
        return {
          data: null,
          error: createUnknownColumnError(invalidApplicationColumn),
          count: null,
        };
      }

      const filteredRows = applyFilters(attachRentalApplications(getTableRows(table)), filters);
      const orderedRows = applyOrder(filteredRows, order);
      if (range && range.from > 0 && range.from >= filteredRows.length) {
        return {
          data: null,
          error: {
            code: "PGRST103",
            details: `An offset of ${range.from} was requested, but there are only ${filteredRows.length} rows.`,
            hint: null,
            message: "Requested range not satisfiable",
          },
          count: null,
        };
      }
      const selectedRows = applyRange(orderedRows, range);

      return {
        data: options.head ? null : structuredClone(selectedRows),
        error: null,
        count: options.count === "exact" ? filteredRows.length : null,
      };
    };

    return {
      then: (
        onFulfilled: (value: {
          data: Array<Record<string, any>> | null;
          error: null | Record<string, any>;
          count: number | null;
        }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => resolveRows().then(onFulfilled, onRejected),
      order: vi.fn(
        (column: string, { ascending = true }: { ascending?: boolean } = {}) =>
          createSelectQuery(
            table,
            columns,
            options,
            filters,
            { column, ascending },
            range,
          ),
      ),
      eq: vi.fn((column: string, value: unknown) =>
        createSelectQuery(
          table,
          columns,
          options,
          [...filters, { type: "eq", column, value }],
          order,
          range,
        ),
      ),
      is: vi.fn((column: string, value: unknown) =>
        createSelectQuery(
          table,
          columns,
          options,
          [...filters, { type: "is", column, value }],
          order,
          range,
        ),
      ),
      gte: vi.fn((column: string, value: unknown) =>
        createSelectQuery(
          table,
          columns,
          options,
          [...filters, { type: "gte", column, value }],
          order,
          range,
        ),
      ),
      lte: vi.fn((column: string, value: unknown) =>
        createSelectQuery(
          table,
          columns,
          options,
          [...filters, { type: "lte", column, value }],
          order,
          range,
        ),
      ),
      ilike: vi.fn((column: string, pattern: string) =>
        createSelectQuery(
          table,
          columns,
          options,
          [...filters, { type: "ilike", column, pattern }],
          order,
          range,
        ),
      ),
      in: vi.fn((column: string, values: unknown[]) =>
        createSelectQuery(
          table,
          columns,
          options,
          [...filters, { type: "in", column, values }],
          order,
          range,
        ),
      ),
      not: vi.fn((column: string, _operator: string, value: unknown) =>
        createSelectQuery(
          table,
          columns,
          options,
          [...filters, { type: "not", column, operator: _operator, value }],
          order,
          range,
        ),
      ),
      or: vi.fn((expression: string, orOptions?: { referencedTable?: string; foreignTable?: string }) => {
        const clauses = parseOrClauses(expression);
        const referencedTable = orOptions?.referencedTable || orOptions?.foreignTable;
        return createSelectQuery(
          table,
          columns,
          options,
          clauses.length > 0 ? [...filters, { type: "or", clauses, referencedTable }] : filters,
          order,
          range,
        );
      }),
      range: vi.fn((from: number, to: number) =>
        createSelectQuery(table, columns, options, filters, order, {
          from,
          to,
        }),
      ),
      limit: vi.fn((count: number) =>
        createSelectQuery(table, columns, options, filters, order, {
          from: range?.from ?? 0,
          to: (range?.from ?? 0) + count - 1,
        }),
      ),
      single: vi.fn(async () => {
        mockState.queryLog.push({
          columns,
          filters: structuredClone(filters) as Array<Record<string, any>>,
          options: structuredClone(options),
          range: range ? structuredClone(range) : null,
          table,
        });

        if (invalidApplicationColumn) {
          return {
            data: null,
            error: createUnknownColumnError(invalidApplicationColumn),
          };
        }

        const filteredRows = applyFilters(attachRentalApplications(getTableRows(table)), filters);
        const orderedRows = applyOrder(filteredRows, order);
        const [row] = applyRange(orderedRows, range);
        return row
          ? { data: structuredClone(row), error: null }
          : {
              data: null,
              error: {
                code: "PGRST116",
                details: "The result contains 0 rows",
                message: "Not found",
              },
            };
      }),
      maybeSingle: vi.fn(async () => {
        mockState.queryLog.push({
          columns,
          filters: structuredClone(filters) as Array<Record<string, any>>,
          options: structuredClone(options),
          range: range ? structuredClone(range) : null,
          table,
        });

        if (invalidApplicationColumn) {
          return {
            data: null,
            error: createUnknownColumnError(invalidApplicationColumn),
          };
        }

        const filteredRows = applyFilters(attachRentalApplications(getTableRows(table)), filters);
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
    action: "update" | "delete",
    payload?: Record<string, any>,
    filters: QueryFilter[] = [],
  ) => {
    const applyMutation = async () => {
      if (
        action === "update" &&
        table === "applications" &&
        mockMutationErrors.applicationsUpdate
      ) {
        const error = structuredClone(mockMutationErrors.applicationsUpdate);
        mockMutationErrors.applicationsUpdate = null;
        return {
          data: null,
          error,
        };
      }

      if (action === "update" && table === "applications") {
        mockBeforeApplicationsUpdate();
      }

      if (action === "delete" && mockState.failOnDeleteTable === table) {
        mockState.failOnDeleteTable = null;
        return {
          data: null,
          error: { code: "23503", message: "fk violation" },
        };
      }

      const rows = getTableRows(table);
      const matchingRows = applyFilters(rows, filters);
      const nextRows =
        action === "delete"
          ? rows.filter(
              (row) =>
                !matchingRows.some(
                  (matchingRow) => String(matchingRow.id) === String(row.id),
                ),
            )
          : rows.map((row) =>
              matchingRows.some(
                (matchingRow) => String(matchingRow.id) === String(row.id),
              )
                ? { ...row, ...payload }
                : row,
            );

      setTableRows(table, nextRows);

      const updatedRows =
        action === "delete"
          ? []
          : nextRows.filter((row) =>
              matchingRows.some(
                (matchingRow) => String(matchingRow.id) === String(row.id),
              ),
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
        onRejected?: (reason: unknown) => unknown,
      ) =>
        applyMutation().then(
          ({ error }) => onFulfilled({ data: null, error }),
          onRejected,
        ),
      eq: vi.fn((column: string, value: unknown) =>
        createMutationQuery(table, action, payload, [
          ...filters,
          { type: "eq", column, value },
        ]),
      ),
      is: vi.fn((column: string, value: unknown) =>
        createMutationQuery(table, action, payload, [
          ...filters,
          { type: "is", column, value },
        ]),
      ),
      in: vi.fn((column: string, values: unknown[]) =>
        createMutationQuery(table, action, payload, [
          ...filters,
          { type: "in", column, values },
        ]),
      ),
      gte: vi.fn((column: string, value: unknown) =>
        createMutationQuery(table, action, payload, [
          ...filters,
          { type: "gte", column, value },
        ]),
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
                error: error || {
                  code: "PGRST116",
                  details: "The result contains 0 rows",
                  message: "Not found",
                },
              };
        }),
      })),
    };
  };

  const createInsertQuery = (
    table: string,
    records: Array<Record<string, any>>,
  ) => {
    const currentRows = getTableRows(table);
    const nextSequence =
      table === "applications" || table === "invoices" || table === "manual_invoices" || table === "manual_invoice_items"
        ? currentRows.length + 1
        : currentRows.reduce(
            (max, row) => Math.max(max, Number(row.id) || 0),
            0,
          ) + 1;
    const nextId =
      table === "applications" || table === "invoices" || table === "manual_invoices" || table === "manual_invoice_items"
        ? buildUuidFromSequence(nextSequence)
        : nextSequence;
    const insertedRow: Record<string, any> = { ...records[0], id: nextId };
    const leaseAgreementInsertError =
      table === "lease_agreements" &&
      mockState.leaseAgreementInsertErrorMode === "missing_vehicle_label" &&
      Object.prototype.hasOwnProperty.call(insertedRow, "vehicle_label")
        ? {
            code: "PGRST204",
            details: "Column lease_agreements.vehicle_label does not exist",
            message: "Could not find the vehicle_label column of lease_agreements in the schema cache",
          }
        : table === "lease_agreements" &&
            mockState.leaseAgreementInsertErrorMode === "car_id_required" &&
            insertedRow.car_id == null
          ? {
              code: "23502",
              details: "Failing row contains null for car_id",
              message: 'null value in column "car_id" of relation "lease_agreements" violates not-null constraint',
            }
          : table === "lease_agreements" &&
              mockState.leaseAgreementInsertErrorMode === "legacy_application_id_required"
            ? {
                code: "23502",
                details: "Failing row contains null for legacy_application_id",
                message: 'null value in column "legacy_application_id" of relation "lease_agreements" violates not-null constraint',
              }
            : table === "lease_agreements" &&
                mockState.leaseAgreementInsertErrorMode === "generic_failure"
              ? {
                  code: "57014",
                  details: "Statement cancelled",
                  message: "database statement was cancelled",
                }
          : null;
    const auditInsertError =
      table === "admin_audit_events" &&
      mockState.failOnAuditAction === insertedRow.action
        ? {
            code: "57014",
            details: "Audit insert failed",
            message: "database statement was cancelled",
          }
        : null;
    if (auditInsertError) {
      mockState.failOnAuditAction = null;
    }
    const insertError = auditInsertError || leaseAgreementInsertError;

    if (
      table === "stripe_webhook_events" &&
      typeof insertedRow.stripe_event_id === "string" &&
      mockState.stripe_webhook_events.some(
        (event) => event.stripe_event_id === insertedRow.stripe_event_id,
      )
    ) {
      return {
        error: {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "idx_stripe_webhook_events_event_id"',
        },
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: null, error: null })),
        })),
      };
    }

    if (
      table === "stripe_cancellation_operations" &&
      mockState.stripe_cancellation_operations.some(
        (operation) => operation.idempotency_key === insertedRow.idempotency_key,
      )
    ) {
      return {
        error: {
          code: "23505",
          message: "duplicate cancellation operation idempotency key",
        },
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: null,
            error: { code: "23505", message: "duplicate cancellation operation idempotency key" },
          })),
        })),
      };
    }

    if (table === "stripe_webhook_events" && !insertedRow.received_at) {
      insertedRow.received_at = new Date().toISOString();
    }

    if (table === "stripe_webhook_events" && !insertedRow.updated_at) {
      insertedRow.updated_at = new Date().toISOString();
    }

    if (!insertError && table === "cars") {
      mockState.cars = [...mockState.cars, insertedRow];
    }

    if (!insertError && table === "applications") {
      mockState.applications = [...mockState.applications, insertedRow];
    }

    if (!insertError && table === "rentals") {
      mockState.rentals = [...mockState.rentals, insertedRow];
    }

    if (!insertError && table === "lease_agreements") {
      mockState.lease_agreements = [...mockState.lease_agreements, insertedRow];
    }

    if (!insertError && table === "agreement_templates") {
      mockState.agreement_templates = [
        ...mockState.agreement_templates,
        {
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...insertedRow,
        },
      ];
    }

    if (table === "customers") {
      mockState.customers = [...mockState.customers, insertedRow];
    }

    if (table === "invoices") {
      mockState.invoices = [...mockState.invoices, insertedRow];
    }

    if (table === "bookings") {
      mockState.bookings = [...mockState.bookings, insertedRow];
    }

    if (table === "toll_transfer_notices") {
      mockState.toll_transfer_notices = [
        ...mockState.toll_transfer_notices,
        {
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...insertedRow,
        },
      ];
    }

    if (table === "toll_transfer_notice_audit_events") {
      mockState.toll_transfer_notice_audit_events = [
        ...mockState.toll_transfer_notice_audit_events,
        {
          created_at: new Date().toISOString(),
          ...insertedRow,
        },
      ];
    }

    if (table === "manual_invoices") {
      mockState.manual_invoices = [
        ...mockState.manual_invoices,
        {
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...insertedRow,
        },
      ];
    }

    if (table === "manual_invoice_items") {
      mockState.manual_invoice_items = [
        ...mockState.manual_invoice_items,
        ...records.map((record, index) => ({
          ...record,
          id: buildUuidFromSequence(currentRows.length + index + 1),
        })),
      ];
    }

    if (table === "stripe_webhook_events") {
      mockState.stripe_webhook_events = [
        ...mockState.stripe_webhook_events,
        insertedRow,
      ];
    }

    if (table === "stripe_cancellation_operations") {
      insertedRow.attempt_count = insertedRow.attempt_count || 0;
      insertedRow.status = insertedRow.status || "requested";
      mockState.stripe_cancellation_operations = [
        ...mockState.stripe_cancellation_operations,
        insertedRow,
      ];
    }

    if (!insertError && table === "admin_audit_events") {
      mockState.admin_audit_events = [
        ...mockState.admin_audit_events,
        insertedRow,
      ];
    }

    return {
      error: insertError,
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: insertError ? null : insertedRow,
          error: insertError,
        })),
      })),
    };
  };

  return {
    db: {
      rpc: mockDbRpc,
      from: vi.fn((table: string) => ({
        select: vi.fn(
          (columns?: string, options?: { count?: string; head?: boolean }) =>
            createSelectQuery(table, columns, options),
        ),
        insert: vi.fn((records: Array<Record<string, any>>) =>
          createInsertQuery(table, records),
        ),
        update: vi.fn((payload: Record<string, any>) =>
          createMutationQuery(table, "update", payload),
        ),
        delete: vi.fn(() => createMutationQuery(table, "delete")),
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

vi.mock("../db/postgres.js", () => {
  const getTableRows = (table: string) => {
    if (table === "cars") {
      return mockState.cars;
    }

    if (table === "applications") {
      return mockState.applications;
    }

    if (table === "rentals") {
      return mockState.rentals;
    }

    if (table === "stripe_webhook_events") {
      return mockState.stripe_webhook_events;
    }

    return [];
  };

  const setTableRows = (table: string, rows: Array<Record<string, any>>) => {
    if (table === "cars") {
      mockState.cars = rows;
      return;
    }

    if (table === "applications") {
      mockState.applications = rows;
      return;
    }

    if (table === "rentals") {
      mockState.rentals = rows;
      return;
    }

    if (table === "stripe_webhook_events") {
      mockState.stripe_webhook_events = rows;
    }
  };

  const parseQuotedIdentifiers = (source: string) =>
    source
      .split(",")
      .map(
        (segment) =>
          segment
            .trim()
            .match(/^"((?:[^"]|"")+)"/)?.[1]
            ?.replace(/""/g, '"') || null,
      )
      .filter((value): value is string => Boolean(value));

  const parseSelectExpression = (expression: string) => {
    const trimmed = expression.trim();
    const aliasMatch = trimmed.match(/^(.*?)(?:\s+AS\s+([a-zA-Z_][\w]*))?$/i);
    const rawSource = aliasMatch?.[1]?.trim() || trimmed;
    const alias = aliasMatch?.[2] || rawSource.replace(/^"|"$/g, "");
    const source =
      rawSource.startsWith('"') && rawSource.endsWith('"')
        ? rawSource.slice(1, -1).replace(/""/g, '"')
        : rawSource;

    return { alias, source };
  };

  const createTransactionalQuery = () =>
    vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.startsWith("SELECT status FROM cars WHERE id = $1 FOR UPDATE")) {
        const car = mockState.cars.find(
          (row) => String(row.id) === String(values[0]),
        );
        return {
          rowCount: car ? 1 : 0,
          rows: car ? [{ status: car.status }] : [],
        };
      }

      const applicationSelectMatch = sql.match(
        /^SELECT (.+) FROM "?applications"? WHERE id = \$1 FOR UPDATE$/,
      );
      if (applicationSelectMatch) {
        const application = mockState.applications.find(
          (row) => String(row.id) === String(values[0]),
        );
        const selectedRow = application
          ? applicationSelectMatch[1]
              .split(",")
              .map(parseSelectExpression)
              .reduce<Record<string, unknown>>((accumulator, column) => {
                accumulator[column.alias] =
                  application[column.source] ?? application[column.alias];
                return accumulator;
              }, {})
          : null;

        return {
          rowCount: application ? 1 : 0,
          rows: selectedRow ? [selectedRow] : [],
        };
      }

      if (sql.startsWith('INSERT INTO "rentals"')) {
        const columnsMatch = sql.match(
          /^INSERT INTO "rentals" \((.+)\) VALUES \(/,
        );
        const columns = columnsMatch
          ? parseQuotedIdentifiers(columnsMatch[1])
          : [];
        const nextId =
          mockState.rentals.reduce(
            (max, row) => Math.max(max, Number(row.id) || 0),
            0,
          ) + 1;
        const insertedRow = columns.reduce<Record<string, unknown>>(
          (accumulator, column, index) => {
            accumulator[column] = values[index];
            return accumulator;
          },
          { id: nextId },
        );
        mockState.rentals = [...mockState.rentals, insertedRow];
        return { rowCount: 1, rows: [] };
      }

      if (sql.startsWith('INSERT INTO "stripe_webhook_events"')) {
        const columnsMatch = sql.match(
          /^INSERT INTO "stripe_webhook_events" \((.+)\) VALUES \(/,
        );
        const columns = columnsMatch
          ? parseQuotedIdentifiers(columnsMatch[1])
          : [];
        const nextId =
          mockState.stripe_webhook_events.reduce(
            (max, row) => Math.max(max, Number(row.id) || 0),
            0,
          ) + 1;
        const insertedRow = columns.reduce<Record<string, unknown>>(
          (accumulator, column, index) => {
            accumulator[column] = values[index];
            return accumulator;
          },
          { id: nextId },
        );
        mockState.stripe_webhook_events = [
          ...mockState.stripe_webhook_events,
          insertedRow,
        ];
        return { rowCount: 1, rows: [] };
      }

      if (
        sql.startsWith(
          "SELECT id, event_type FROM stripe_webhook_events WHERE stripe_event_id = $1 FOR UPDATE",
        )
      ) {
        const ledgerRow = mockState.stripe_webhook_events.find(
          (row) => String(row.stripe_event_id) === String(values[0]),
        );
        return {
          rowCount: ledgerRow ? 1 : 0,
          rows: ledgerRow
            ? [{ id: ledgerRow.id, event_type: ledgerRow.event_type ?? null }]
            : [],
        };
      }

      const updateMatch = sql.match(
        /^UPDATE "([^"]+)" SET (.+) WHERE id = \$\d+$/,
      );
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
    checkDirectDatabaseHealth: mockCheckDirectDatabaseHealth,
    closePostgresPool: mockClosePostgresPool,
    getDirectDatabaseConnectionString: vi.fn(() => ""),
    hasDirectDatabaseConnection: mockHasDirectDatabaseConnection,
    withPostgresAdvisoryLock: mockWithPostgresAdvisoryLock,
    withPostgresTransaction: vi.fn(
      async (
        callback: (client: {
          query: ReturnType<typeof vi.fn>;
        }) => Promise<unknown>,
      ) => callback({ query: createTransactionalQuery() }),
    ),
  };
});

process.env.NODE_ENV = "test";
process.env.CHECKOUT_LINK_SECRET = "test-checkout-secret";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.MAINTENANCE_RESET_TOKEN_SECRET = "test-maintenance-reset-secret-32-characters";
process.env.STRIPE_SECRET_KEY = "sk_test_123";
process.env.STRIPE_WEBHOOK_SECRET = "test-webhook-secret";
process.env.STRIPE_WEEKLY_RENTAL_PRODUCT_ID = "prod_weekly_rental";

const { default: app } = await import("../index.js");
const { createCheckoutToken, verifyCheckoutToken } =
  await import("../checkoutTokens.js");

const getQueryTables = () => mockState.queryLog.map((query) => query.table);
const expectNoImportedApplicationPreload = () => {
  expect(
    mockState.queryLog.some(
      (query) =>
        query.table === "applications" &&
        query.columns?.includes("legacy_id") &&
        !query.filters.some((filter) => filter.type === "in" || filter.type === "or"),
    ),
  ).toBe(false);
};
const expectNoUnfilteredCustomerLookup = () => {
  expect(
    mockState.queryLog.some(
      (query) => query.table === "customers" && query.filters.length === 0,
    ),
  ).toBe(false);
};
const expectNoDuplicateRentalRehydration = () => {
  expect(
    mockState.queryLog.some(
      (query) =>
        query.table === "rentals" &&
        query.filters.some(
          (filter) =>
            filter.type === "in" &&
            filter.column === "id",
        ),
    ),
  ).toBe(false);
};

beforeEach(() => {
  mockState.queryLog = [];
  delete process.env.MAPLE_ENABLE_IMPORTED_DATA_RESET;
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
      archived_at: null,
      name: "Toyota Camry",
      model_year: 2024,
      weekly_price: 250,
      bond: 500,
      status: "Available",
      image: "/camry-deep-blue.webp",
      created_at: "2026-03-01T00:00:00.000Z",
    },
    {
      id: 2,
      archived_at: null,
      name: "Toyota Prius",
      model_year: 2023,
      weekly_price: 275,
      bond: 600,
      status: "Rented",
      image: "/camry-pearl-white.webp",
      created_at: "2026-03-02T00:00:00.000Z",
    },
  ];

  mockState.applications = [
    {
      id: PENDING_APPLICATION_ID,
      approved_at: null,
      approved_bond: null,
      bond_notes: null,
      bond_payment_method: null,
      bond_payment_status: null,
      approved_vehicle: null,
      approved_weekly_price: null,
      assigned_car_id: null,
      name: "Jane Driver",
      phone: "0412345678",
      email: "jane@example.com",
      license_number: "NSW12345",
      license_expiry: getFutureDateOnly(365),
      uber_status: "Active",
      experience: "New Driver",
      address: "1 Test Street",
      weekly_budget: "$300/week",
      intended_start_date: getFutureDateOnly(1),
      license_photo: "docs/license-1.png",
      license_back_photo: "docs/license-back-1.png",
      passport_or_uber_profile_screenshot: null,
      agreement_accepted_at: "2026-03-03T00:00:00.000Z",
      agreement_signature: "Jane Driver",
      agreement_template_version: 1,
      cancelled_at: null,
      cancel_reason: null,
      paid_at: null,
      payment_link_sent_at: null,
      payment_link_version: 0,
      pending_checkout_session_id: null,
      status: "Pending",
      created_at: "2026-03-03T00:00:00.000Z",
    },
    {
      id: APPROVED_APPLICATION_ID,
      approved_at: "2026-03-05T00:00:00.000Z",
      approved_bond: 500,
      bond_notes: null,
      bond_payment_method: null,
      bond_payment_status: "to_collect",
      approved_vehicle: "Toyota Camry",
      approved_weekly_price: 250,
      assigned_car_id: 1,
      name: "Approved Driver",
      phone: "0499999999",
      email: "approved@example.com",
      license_number: "NSW99999",
      license_expiry: getFutureDateOnly(425),
      uber_status: "Active",
      experience: "1-3 years",
      address: "2 Test Street",
      weekly_budget: "$350/week",
      intended_start_date: getFutureDateOnly(2),
      license_photo:
        "https://project.supabase.co/storage/v1/object/public/applications/docs/license-2.png",
      license_back_photo: null,
      passport_or_uber_profile_screenshot:
        "https://project.supabase.co/storage/v1/object/public/applications/docs/passport-2.png",
      agreement_accepted_at: "2026-03-04T00:00:00.000Z",
      agreement_signature: "Approved Driver",
      agreement_template_version: 1,
      cancelled_at: null,
      cancel_reason: null,
      paid_at: null,
      payment_link_sent_at: "2026-03-05T00:00:00.000Z",
      payment_link_version: 1,
      pending_checkout_session_id: null,
      status: "Approved",
      created_at: "2026-03-04T00:00:00.000Z",
    },
  ];

  mockState.rentals = [];
  mockState.lease_agreements = [];
  mockState.leaseAgreementInsertErrorMode = null;
  mockState.agreement_templates = [
    {
      active: true,
      content: "# Car Lease Agreement\n\nDriver: {{renteeName}}\n\n{{feeSchedule}}",
      created_at: "2026-03-01T00:00:00.000Z",
      id: 1,
      name: "Car Lease Agreement",
      template_key: "car-lease",
      updated_at: "2026-03-01T00:00:00.000Z",
      updated_by: "test",
      version: 2,
    },
  ];
  mockState.stripe_webhook_events = [];
  mockState.stripe_cancellation_operations = [];
  mockState.stripe_balance_transactions = [];
  mockState.admin_audit_events = [];
  mockState.failOnAuditAction = null;
  mockState.toll_transfer_notices = [];
  mockState.toll_transfer_notice_audit_events = [];
  mockState.toll_notice_delivery_attempts = [];
  mockState.manual_invoices = [];
  mockState.manual_invoice_items = [];

  mockState.customers = [
    {
      id: 1,
      external_id: "60499",
      staff_number: "1012",
      full_name: "Alex Driver",
      preferred_name: "Alex Driver",
      company_name: "Alex Driver Pty Ltd",
      phone: "0400000001",
      email: "alex.driver@example.invalid",
      date_of_birth: "1999-09-24",
      street: null,
      city: null,
      postcode: null,
      state: null,
      source: "legacy-import",
      created_at: "2026-03-05T00:00:00.000Z",
      updated_at: "2026-03-05T00:00:00.000Z",
    },
    {
      id: 2,
      external_id: "61617",
      staff_number: "1013",
      full_name: "Jordan Rider",
      preferred_name: "Jordan Rider",
      company_name: "Jordan Rider Pty Ltd",
      phone: "0400000002",
      email: "jordan.rider@example.invalid",
      date_of_birth: "2001-05-15",
      street: null,
      city: null,
      postcode: null,
      state: null,
      source: "legacy-import",
      created_at: "2026-03-05T00:00:00.000Z",
      updated_at: "2026-03-05T00:00:00.000Z",
    },
  ];

  mockState.invoices = [
    {
      id: 1,
      external_invoice_number: "1882",
      customer_id: 1,
      customer_name: "Alex Driver",
      car_registration: "CNO40S",
      invoice_date: "2026-03-05",
      due_label: "Wed 11 Mar",
      amount: 230.99,
      balance: 230.99,
      transaction_summary: "",
      source: "legacy-import",
      created_at: "2026-03-05T00:00:00.000Z",
    },
    {
      id: 2,
      external_invoice_number: "1881",
      customer_id: 2,
      customer_name: "Jordan Rider",
      car_registration: "YNU55M",
      invoice_date: "2026-03-04",
      due_label: "Wed 04 Mar",
      amount: 386.09,
      balance: 0,
      transaction_summary: "$386.09 - 04 Mar 2026 - Direct Debit",
      source: "legacy-import",
      created_at: "2026-03-04T00:00:00.000Z",
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
    data: { user: { email: "admin@maplerentals.com.au" } },
    error: null,
  });
  mockRefreshSession.mockImplementation(async () => ({
    data: {
      session: {
        access_token: "refreshed-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "refresh-token",
      },
      user: { email: "admin@maplerentals.com.au" },
    },
    error: null,
  }));
  mockSignInWithPassword.mockImplementation(
    async ({ email }: { email: string }) => ({
      data: {
        session: {
          access_token: "fake-token",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: "refresh-token",
        },
        user: { email },
      },
      error: null,
    }),
  );
  mockCreateAuthClient.mockReturnValue({
    auth: {
      getUser: mockGetUser,
      refreshSession: mockRefreshSession,
      signInWithPassword: mockSignInWithPassword,
    },
  });
  mockCheckDBHealth.mockResolvedValue({ configured: true });
  mockCheckDirectDatabaseHealth.mockResolvedValue({
    configured: true,
    issues: [],
    mode: "session",
    source: "DATABASE_URL",
  });
  mockClosePostgresPool.mockResolvedValue(undefined);
  mockGetSupabaseAuthConfigurationIssues.mockReturnValue([]);
  mockGetSupabaseConfigurationIssues.mockReturnValue([]);
  mockHasDirectDatabaseConnection.mockReturnValue(true);
  mockDbRpc.mockImplementation(
    async (functionName: string, args: Record<string, unknown>) => {
      const now = new Date().toISOString();

      if (functionName === "claim_stripe_cancellation_operation") {
        const operation = mockState.stripe_cancellation_operations.find(
          (row) => row.id === args.p_operation_id,
        );
        if (!operation) return { data: [], error: null };
        const stale = operation.status === "stripe_processing" && String(operation.processing_started_at || "") < String(args.p_stale_before || "");
        if (!["requested", "reconciliation_pending", "failed"].includes(operation.status) && !stale) return { data: [], error: null };
        Object.assign(operation, { attempt_count: Number(operation.attempt_count || 0) + 1, processing_started_at: now, status: "stripe_processing", updated_at: now });
        return { data: [operation], error: null };
      }

      if (functionName === "get_admin_dashboard_summary") {
        return {
          data: null,
          error: {
            code: "PGRST202",
            message: "Function public.get_admin_dashboard_summary was not found in the schema cache",
          },
        };
      }

      if (functionName === "create_manual_invoice_transaction") {
        const invoiceInput = args.p_invoice as Record<string, unknown>;
        const itemInputs = args.p_items as Array<Record<string, unknown>>;
        const invoiceNumber = String(invoiceInput.invoice_number || "").toUpperCase();
        if (
          mockState.manual_invoices.some(
            (invoice) => invoice.invoice_number === invoiceNumber,
          )
        ) {
          return { data: null, error: { code: "23505", message: "duplicate" } };
        }

        const invoiceId = `00000000-0000-4000-8000-${String(
          mockState.manual_invoices.length + 1,
        ).padStart(12, "0")}`;
        const items: Array<Record<string, any>> = itemInputs.map((item, index) => {
          const quantity = Number(item.quantity || 0);
          const unitPrice = Number(item.unit_price || 0);
          const gst = Number(item.gst || 0);
          return {
            ...item,
            amount: Number((quantity * unitPrice + gst).toFixed(2)),
            id: `00000000-0000-4000-8001-${String(index + 1).padStart(12, "0")}`,
            invoice_id: invoiceId,
          };
        });
        const subtotal = Number(
          items
            .reduce(
              (total, item) =>
                total + Number(item.quantity || 0) * Number(item.unit_price || 0),
              0,
            )
            .toFixed(2),
        );
        const gst = Number(
          items.reduce((total, item) => total + Number(item.gst || 0), 0).toFixed(2),
        );
        const invoice = {
          ...invoiceInput,
          created_at: now,
          gst,
          id: invoiceId,
          invoice_number: invoiceNumber,
          items,
          subtotal,
          total_inc_gst: Number((subtotal + gst).toFixed(2)),
          updated_at: now,
        };
        mockState.manual_invoices.push(invoice);
        mockState.manual_invoice_items.push(...items);
        return { data: invoice, error: null };
      }

      if (functionName === "aggregate_stripe_balance_transactions") {
        const start = String(args.p_start || "");
        const end = String(args.p_end || "");
        const rows = mockState.stripe_balance_transactions.filter((transaction) => {
          const createdAt = String(transaction.created_at || "");
          return createdAt >= start && createdAt <= end;
        });
        return {
          data: {
            count: rows.length,
            gross: rows.reduce((total, row) => total + Number(row.amount || 0), 0),
            net: rows.reduce((total, row) => total + Number(row.net || 0), 0),
          },
          error: null,
        };
      }

      if (functionName === "list_current_customer_invoice_summaries") {
        const importedSources = new Set(["demo", "imported", "legacy", "legacy-import", "test"]);
        const isImported = (row: Record<string, any>) =>
          row.is_imported === true ||
          (row.is_imported == null && importedSources.has(String(row.source || "").toLowerCase()));
        const currentInvoices = mockState.invoices.filter((invoice) => !isImported(invoice));
        const search = String(args.p_search || "").trim().toLowerCase();
        const eligible: Array<Record<string, any>> = mockState.customers
          .filter((customer) => !isImported(customer))
          .map((customer): Record<string, any> => {
            const invoices = currentInvoices.filter(
              (invoice) => invoice.customer_id === customer.id,
            );
            return {
              ...customer,
              invoice_count: invoices.length,
              last_invoice_date:
                invoices
                  .map((invoice) => invoice.invoice_date)
                  .filter(Boolean)
                  .sort()
                  .at(-1) || null,
              outstanding_balance: invoices.reduce(
                (total, invoice) => total + Number(invoice.balance || 0),
                0,
              ),
              total_billed: invoices.reduce(
                (total, invoice) => total + Number(invoice.amount || 0),
                0,
              ),
            };
          })
          .filter((customer) => {
            const searchable = [
              customer.full_name,
              customer.email,
              customer.phone,
              customer.company_name,
              customer.staff_number,
              customer.external_id,
            ];
            const matchesSearch =
              !search || searchable.some((value) => String(value || "").toLowerCase().includes(search));
            const hasOperationalData =
              searchable.slice(1).some((value) => String(value || "").trim()) ||
              customer.invoice_count > 0 ||
              customer.total_billed > 0 ||
              customer.outstanding_balance > 0 ||
              customer.last_invoice_date != null;
            return matchesSearch && hasOperationalData;
          })
          .sort((left, right) =>
            String(left.full_name || "").localeCompare(String(right.full_name || "")) ||
            Number(left.id) - Number(right.id),
          );
        const pageSize = Math.max(1, Math.min(Number(args.p_page_size) || 25, 100));
        const totalItems = eligible.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        const page = Math.min(Math.max(1, Number(args.p_page) || 1), totalPages);
        return {
          data: {
            items: eligible.slice((page - 1) * pageSize, page * pageSize),
            page,
            pageSize,
            totalItems,
            totalPages,
          },
          error: null,
        };
      }

      if (
        functionName === "create_agreement_template_version" ||
        functionName === "revise_agreement_template"
      ) {
        const source =
          functionName === "revise_agreement_template"
            ? mockState.agreement_templates.find(
                (template) => template.id === Number(args.p_source_id),
              )
            : null;
        if (functionName === "revise_agreement_template" && !source) {
          return { data: null, error: null };
        }
        const templateKey = String(source?.template_key || args.p_template_key || "");
        const active = source ? source.active === true : args.p_activate === true;
        if (active) {
          mockState.agreement_templates.forEach((template) => {
            if (template.template_key === templateKey) template.active = false;
          });
        }
        const versions = mockState.agreement_templates
          .filter((template) => template.template_key === templateKey)
          .map((template) => Number(template.version || 0));
        const created = {
          active,
          content: String(args.p_content || ""),
          created_at: now,
          id:
            Math.max(0, ...mockState.agreement_templates.map((template) => Number(template.id))) +
            1,
          name: String(args.p_name || source?.name || ""),
          template_key: templateKey,
          updated_at: now,
          updated_by: String(args.p_updated_by || ""),
          version: Math.max(0, ...versions) + 1,
        };
        mockState.agreement_templates.push(created);
        return { data: created, error: null };
      }

      if (functionName === "activate_agreement_template") {
        const selected = mockState.agreement_templates.find(
          (template) => template.id === Number(args.p_template_id),
        );
        if (!selected) return { data: null, error: null };
        mockState.agreement_templates.forEach((template) => {
          if (template.template_key === selected.template_key) template.active = false;
        });
        selected.active = true;
        selected.updated_at = now;
        selected.updated_by = String(args.p_updated_by || "");
        return { data: selected, error: null };
      }

      if (functionName === "claim_toll_notice_delivery") {
        const noticeId = Number(args.p_notice_id);
        const recipientEmail = String(args.p_recipient_email || "").trim().toLowerCase();
        const contentHash = String(args.p_content_hash || "");
        let attempt = mockState.toll_notice_delivery_attempts.find(
          (candidate) =>
            candidate.toll_transfer_notice_id === noticeId &&
            candidate.recipient_email === recipientEmail &&
            candidate.content_hash === contentHash,
        );
        if (!attempt) {
          const id = `00000000-0000-4000-8002-${String(
            mockState.toll_notice_delivery_attempts.length + 1,
          ).padStart(12, "0")}`;
          attempt = {
            attempt_count: 0,
            content_hash: contentHash,
            created_at: now,
            id,
            idempotency_key: `toll-notice-${id}`,
            recipient_email: recipientEmail,
            status: "pending",
            toll_transfer_notice_id: noticeId,
            updated_at: now,
          };
          mockState.toll_notice_delivery_attempts.push(attempt);
        }
        const claimed = ["pending", "failed"].includes(String(attempt.status));
        if (claimed) {
          attempt.attempt_count = Number(attempt.attempt_count || 0) + 1;
          attempt.error_message = null;
          attempt.status = "sending";
          attempt.updated_at = now;
        }
        return { data: { ...attempt, claimed }, error: null };
      }

      if (functionName === "finalize_toll_notice_delivery") {
        const attempt = mockState.toll_notice_delivery_attempts.find(
          (candidate) => candidate.id === args.p_attempt_id,
        );
        if (!attempt) {
          return { data: null, error: { message: "Delivery attempt not found" } };
        }
        attempt.provider_message_id = args.p_provider_message_id || null;
        attempt.sent_at = now;
        attempt.status = "sent";
        attempt.updated_at = now;
        const notice = mockState.toll_transfer_notices.find(
          (candidate) => candidate.id === attempt.toll_transfer_notice_id,
        );
        if (!notice) return { data: null, error: { message: "Notice not found" } };
        notice.sent_at = notice.sent_at || now;
        notice.sent_to = attempt.recipient_email;
        notice.status = "sent";
        notice.updated_at = now;
        const alreadyAudited = mockState.toll_transfer_notice_audit_events.some(
          (event) =>
            event.action === "send_email" &&
            event.metadata?.delivery_attempt_id === attempt.id,
        );
        if (!alreadyAudited) {
          mockState.toll_transfer_notice_audit_events.push({
            action: "send_email",
            actor: args.p_actor,
            created_at: now,
            metadata: {
              delivery_attempt_id: attempt.id,
              provider_message_id: attempt.provider_message_id,
              recipient_email: attempt.recipient_email,
            },
            toll_transfer_notice_id: notice.id,
          });
        }
        return { data: notice, error: null };
      }

      if (functionName === "fail_toll_notice_delivery") {
        const attempt = mockState.toll_notice_delivery_attempts.find(
          (candidate) => candidate.id === args.p_attempt_id,
        );
        if (attempt) {
          attempt.error_message = String(args.p_error_message || "Unknown delivery failure");
          attempt.status = "failed";
          attempt.updated_at = now;
        }
        return { data: null, error: null };
      }

      if (functionName !== "apply_stripe_rental_status_event") {
        return {
          data: null,
          error: { message: `Unexpected database RPC in test: ${functionName}` },
        };
      }

      const subscriptionId = String(args.p_subscription_id || "");
      const rental = mockState.rentals.find(
        (candidate) => candidate.stripe_subscription_id === subscriptionId,
      );
      if (!rental) {
        return { data: [{ matched: false, applied: false }], error: null };
      }

      const incomingCreatedAt = String(args.p_event_created_at || "");
      const existingCreatedAt = rental.stripe_status_event_created_at
        ? String(rental.stripe_status_event_created_at)
        : null;
      const incomingTerminal = args.p_terminal === true;
      const applied =
        !existingCreatedAt ||
        existingCreatedAt < incomingCreatedAt ||
        (existingCreatedAt === incomingCreatedAt &&
          incomingTerminal &&
          rental.stripe_status_event_terminal !== true);

      if (applied) {
        rental.status = String(args.p_status || rental.status);
        if (args.p_end_date) {
          rental.end_date = String(args.p_end_date);
        }
        rental.stripe_status_event_created_at = incomingCreatedAt;
        rental.stripe_status_event_id = String(args.p_event_id || "");
        rental.stripe_status_event_terminal = incomingTerminal;
      }

      return { data: [{ matched: true, applied }], error: null };
    },
  );
  mockWithPostgresAdvisoryLock.mockImplementation(
    async (_lockKey: string, callback: () => Promise<unknown>) => callback(),
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
    data: { id: "email_123" },
    error: null,
    headers: null,
  });
  mockMutationErrors.applicationsUpdate = null;

  mockStripe.checkoutSessionsCreate.mockReset();
  mockStripe.checkoutSessionsExpire.mockReset();
  mockStripe.checkoutSessionsList.mockReset();
  mockStripe.checkoutSessionsRetrieve.mockReset();
  mockStripe.invoiceItemsCreate.mockReset();
  mockStripe.subscriptionsRetrieve.mockReset();
  mockStripe.subscriptionsUpdate.mockReset();
  mockStripe.subscriptionsCancel.mockReset();
  mockStripe.payoutsList.mockReset();
  mockStripe.webhooksConstructEvent.mockReset();

  mockStripe.checkoutSessionsCreate.mockResolvedValue({
    id: "cs_test_123",
    url: "https://checkout.stripe.com/c/pay/cs_test_123",
  });
  mockStripe.checkoutSessionsExpire.mockResolvedValue({ id: "cs_test_123" });
  mockStripe.checkoutSessionsList.mockResolvedValue({
    data: [],
    has_more: false,
  });
  mockStripe.checkoutSessionsRetrieve.mockResolvedValue({
    id: "cs_test_123",
    url: "https://checkout.stripe.com/c/pay/cs_test_123",
    status: "complete",
    payment_status: "paid",
    payment_method_types: ["card"],
    metadata: {
      application_id: APPROVED_APPLICATION_ID,
      approved_bond: "500.00",
      approved_weekly_price: "250.00",
      car_id: "1",
      checkout_kind: "vehicle",
      payment_link_version: "1",
    },
    customer: "cus_123",
    subscription: "sub_123",
  });
  mockStripe.subscriptionsRetrieve.mockResolvedValue({
    id: "sub_test_123",
    metadata: { application_id: APPROVED_APPLICATION_ID, car_id: "1" },
    status: "active",
  });
  mockStripe.subscriptionsUpdate.mockResolvedValue({
    id: "sub_test_123",
    cancel_at_period_end: true,
    status: "active",
  });
  mockStripe.subscriptionsCancel.mockResolvedValue({
    id: "sub_test_123",
    status: "canceled",
  });
  mockStripe.payoutsList.mockResolvedValue({
    data: [],
    has_more: false,
  });
  mockStripe.webhooksConstructEvent.mockReset();
  mockBeforeApplicationsUpdate.mockReset();

  vi.clearAllMocks();
});


describe("Removed cars API", () => {
  it("does not expose the removed car collection", async () => {
    const res = await request(app)
      .get("/api/cars")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("API route not found");
  });

  it("does not allow recreating car records", async () => {
    const res = await request(app)
      .post("/api/cars")
      .set("Authorization", "Bearer fake-token")
      .send({ name: "ABC12D" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("API route not found");
  });
});

describe("Public rental plan API", () => {
  it("GET /api/stripe/rental-plans returns public plan summaries without price fields", async () => {
    const res = await request(app).get("/api/stripe/rental-plans");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({
      id: "weekly",
      name: "Weekly Rental",
      cadenceLabel: "Weekly billing",
    });
    expect(res.body[0].pricing).toBeUndefined();
    expect(res.body[0].priceAud).toBeUndefined();
    expect(res.body[0].bondAud).toBeUndefined();
  });
});

describe("Auth API", () => {
  it("POST /api/auth/login should log in an admin", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin@maplerentals.com.au", password: "password" });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe("admin@maplerentals.com.au");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("POST /api/auth/login sets a cross-site compatible cookie when the frontend is on another host", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://admin.maplerentals.com.au")
      .send({ username: "admin@maplerentals.com.au", password: "password" });

    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]?.[0]).toContain("SameSite=None");
    expect(res.headers["set-cookie"]?.[0]).toContain("Secure");
  });

  it("POST /api/auth/login allows a configured CORS origin with a trailing slash", async () => {
    const previousCorsOrigin = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = "https://admin.maplerentals.com.au/";

    try {
      const { createApp } = await import("../index.js");
      const scopedApp = createApp();

      const res = await request(scopedApp)
        .post("/api/auth/login")
        .set("Origin", "https://admin.maplerentals.com.au")
        .send({ username: "admin@maplerentals.com.au", password: "password" });

      expect(res.status).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBe(
        "https://admin.maplerentals.com.au",
      );
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    } finally {
      if (previousCorsOrigin === undefined) {
        delete process.env.CORS_ORIGIN;
      } else {
        process.env.CORS_ORIGIN = previousCorsOrigin;
      }
    }
  });

  it("GET /api/auth/verify refreshes an expired Supabase access token stored in the admin cookie", async () => {
    const agent = request.agent(app);
    const loginRes = await agent
      .post("/api/auth/login")
      .send({ username: "admin@maplerentals.com.au", password: "password" });

    expect(loginRes.status).toBe(200);
    const adminCookie = loginRes.headers["set-cookie"]?.[0]?.split(";")[0];
    expect(adminCookie).toBeTruthy();

    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "JWT expired" },
    });

    const verifyRes = await agent.get("/api/auth/verify").set("Cookie", adminCookie);

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.user.username).toBe("admin@maplerentals.com.au");
    expect(mockRefreshSession).toHaveBeenCalledWith({
      refresh_token: "refresh-token",
    });
    expect(verifyRes.headers["set-cookie"]).toBeDefined();
  });

  it("POST /api/auth/logout rejects cookie-authenticated writes without a trusted origin", async () => {
    const agent = request.agent(app);
    const loginRes = await agent
      .post("/api/auth/login")
      .send({ username: "admin@maplerentals.com.au", password: "password" });

    expect(loginRes.status).toBe(200);
    const adminCookie = loginRes.headers["set-cookie"]?.[0]?.split(";")[0];
    expect(adminCookie).toBeTruthy();

    const rejectedRes = await agent.post("/api/auth/logout").set("Cookie", adminCookie);
    expect(rejectedRes.status).toBe(403);
    expect(rejectedRes.body.error).toContain(
      "Cross-site admin request rejected",
    );

    const allowedRes = await agent
      .post("/api/auth/logout")
      .set("Cookie", adminCookie)
      .set("Origin", "http://localhost:3000");

    expect(allowedRes.status).toBe(200);
    expect(allowedRes.body.message).toBe("Logged out");
    const setCookieHeaders = allowedRes.headers["set-cookie"];
    const clearedCookies = Array.isArray(setCookieHeaders)
      ? setCookieHeaders
      : [];
    expect(clearedCookies).toHaveLength(3);
    expect(
      clearedCookies.some(
        (cookie) =>
          cookie.includes("admin_token=;") &&
          cookie.includes("Path=/") &&
          cookie.includes("HttpOnly") &&
          cookie.includes("SameSite=None") &&
          cookie.includes("Secure"),
      ),
    ).toBe(true);
    expect(
      clearedCookies.some(
        (cookie) =>
          cookie.includes("admin_token=;") &&
          cookie.includes("Path=/") &&
          cookie.includes("HttpOnly") &&
          cookie.includes("SameSite=Strict") &&
          !cookie.includes("Secure"),
      ),
    ).toBe(true);
  });

  it("POST /api/auth/login should deny non-admin email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "notadmin@example.com", password: "password" });

    expect(res.status).toBe(403);
  });

  it("POST /api/auth/login returns validation errors for malformed usernames instead of crashing in rate limiting", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: { nested: "value" }, password: "password" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });
});

describe("Agreements API", () => {
  it("GET /api/agreements/car-lease/template requires admin auth", async () => {
    const res = await request(app).get("/api/agreements/car-lease/template");

    expect(res.status).toBe(401);
  });

  it("POST /api/agreements/car-lease/render requires admin auth", async () => {
    const res = await request(app)
      .post("/api/agreements/car-lease/render")
      .send({
        renteeName: "Approved Driver",
        vehicleModel: "Toyota Camry Hybrid",
      });

    expect(res.status).toBe(401);
  });

  it("GET /api/applications/agreement-template returns the shared legal agreement text and version", async () => {
    const res = await request(app).get("/api/applications/agreement-template");

    expect(res.status).toBe(200);
    expect(res.body.agreement).toContain("# Car Lease Agreement");
    expect(res.body.agreementTemplateVersion).toBe(2);
  });

  it("GET /api/admin/agreements requires admin auth", async () => {
    const res = await request(app).get("/api/admin/agreements");

    expect(res.status).toBe(401);
  });

  it("GET /api/admin/agreements returns versioned agreement templates", async () => {
    const res = await request(app)
      .get("/api/admin/agreements")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      active: true,
      name: "Car Lease Agreement",
      version: 2,
    });
  });

  it("PUT /api/admin/agreements/:id creates a new template version", async () => {
    const res = await request(app)
      .put("/api/admin/agreements/1")
      .set("Authorization", "Bearer fake-token")
      .send({
        content: "# Car Lease Agreement\n\nUpdated {{renteeName}}",
        name: "Car Lease Agreement",
      });

    expect(res.status).toBe(200);
    expect(mockState.agreement_templates).toHaveLength(2);
    expect(mockState.agreement_templates.at(-1)).toMatchObject({
      active: true,
      content: "# Car Lease Agreement\n\nUpdated {{renteeName}}",
      version: 3,
    });
  });

  it("POST /api/admin/agreements/:id/activate selects the active template version", async () => {
    mockState.agreement_templates.push({
      active: false,
      content: "# Car Lease Agreement\n\nVersion three",
      created_at: "2026-03-02T00:00:00.000Z",
      id: 2,
      name: "Car Lease Agreement",
      template_key: "car-lease",
      updated_at: "2026-03-02T00:00:00.000Z",
      updated_by: "test",
      version: 3,
    });

    const res = await request(app)
      .post("/api/admin/agreements/2/activate")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(mockState.agreement_templates.find((template) => template.id === 1)?.active).toBe(false);
    expect(mockState.agreement_templates.find((template) => template.id === 2)?.active).toBe(true);
  });

  it("POST /api/agreements blocks creation before payment is completed", async () => {
    const res = await request(app)
      .post("/api/agreements")
      .set("Authorization", "Bearer fake-token")
      .send({
        application_id: PENDING_APPLICATION_ID,
        car_id: 1,
        content: "# Draft agreement",
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("payment is completed");
    expect(mockState.lease_agreements).toHaveLength(0);
  });

  it("POST /api/agreements allows admins to generate an agreement with a vehicle label after payment", async () => {
    mockState.applications[1].status = "Paid";

    const res = await request(app)
      .post("/api/agreements")
      .set("Authorization", "Bearer fake-token")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        content: "# Draft agreement",
        vehicle_label: "Any approved vehicle",
      });

    expect(res.status).toBe(201);
    expect(mockState.lease_agreements).toHaveLength(1);
    expect(mockState.lease_agreements[0]).toMatchObject({
      application_id: APPROVED_APPLICATION_ID,
      status: "generated",
      vehicle_label: "Any approved vehicle",
    });
  });

  it("POST /api/agreements ignores car_id and saves the manual vehicle label", async () => {
    mockState.applications[1].status = "Paid";
    mockState.cars[1].status = "Maintenance";

    const res = await request(app)
      .post("/api/agreements")
      .set("Authorization", "Bearer fake-token")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 2,
        content: "# Draft agreement",
        vehicle_label: "Maintenance-listed vehicle",
      });

    expect(res.status).toBe(201);
    expect(mockState.lease_agreements).toHaveLength(1);
    expect(mockState.lease_agreements[0]).toMatchObject({
      application_id: APPROVED_APPLICATION_ID,
      vehicle_label: "Maintenance-listed vehicle",
    });
  });

  it("POST /api/agreements stores agreements only for paid applications", async () => {
    mockState.applications[1].status = "Paid";

    const res = await request(app)
      .post("/api/agreements")
      .set("Authorization", "Bearer fake-token")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        content: "# Final agreement",
      });

    expect(res.status).toBe(201);
    expect(mockState.lease_agreements).toHaveLength(1);
    expect(mockState.lease_agreements[0]).toMatchObject({
      application_id: APPROVED_APPLICATION_ID,
      content: "# Final agreement",
    });
  });

  it("POST /api/agreements appends an immutable agreement history row", async () => {
    mockState.applications[1].status = "Paid";
    mockState.lease_agreements = [{
      id: 31,
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      content: "# Old agreement",
      status: "generated",
      vehicle_label: "OLD01",
      created_at: "2026-03-08T00:00:00.000Z",
    }];

    const res = await request(app)
      .post("/api/agreements")
      .set("Authorization", "Bearer fake-token")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        content: "# Updated agreement",
        vehicle_label: "NEW02",
      });

    expect(res.status).toBe(201);
    expect(mockState.lease_agreements).toHaveLength(2);
    expect(mockState.lease_agreements[0]).toMatchObject({
      id: 31,
      car_id: 1,
      content: "# Old agreement",
      vehicle_label: "OLD01",
    });
    expect(mockState.lease_agreements[1]).toMatchObject({
      content: "# Updated agreement",
      vehicle_label: "NEW02",
    });
  });

  it("POST /api/agreements preserves repeated generations as separate records", async () => {
    mockState.applications[1].status = "Paid";
    const payload = {
      application_id: APPROVED_APPLICATION_ID,
      content: "# Final agreement",
      vehicle_label: "FZS37Y",
    };

    const first = await request(app)
      .post("/api/agreements")
      .set("Authorization", "Bearer fake-token")
      .send(payload);
    const second = await request(app)
      .post("/api/agreements")
      .set("Authorization", "Bearer fake-token")
      .send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(mockState.lease_agreements).toHaveLength(2);
    expect(mockState.lease_agreements[0].content).toBe("# Final agreement");
    expect(mockState.lease_agreements[1].content).toBe("# Final agreement");
  });

  it("POST /api/agreements saves manual vehicle agreements when vehicle_label is missing in legacy storage", async () => {
    mockState.applications[1].status = "Paid";
    mockState.leaseAgreementInsertErrorMode = "missing_vehicle_label";

    const res = await request(app)
      .post("/api/agreements")
      .set("Authorization", "Bearer fake-token")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        content: "# Agreement\nVehicle / Number Plate: Toyota Camry - ABC12D",
        vehicle_label: "Toyota Camry - ABC12D",
      });

    expect(res.status).toBe(201);
    expect(mockState.lease_agreements).toHaveLength(1);
    expect(mockState.lease_agreements[0]).toMatchObject({
      application_id: APPROVED_APPLICATION_ID,
      content: "# Agreement\nVehicle / Number Plate: Toyota Camry - ABC12D",
    });
    expect(mockState.lease_agreements[0]).not.toHaveProperty("vehicle_label");
  });

  it("POST /api/agreements returns a useful safe schema error when car_id is still required", async () => {
    mockState.applications[1].status = "Paid";
    mockState.leaseAgreementInsertErrorMode = "car_id_required";

    const res = await request(app)
      .post("/api/agreements")
      .set("Authorization", "Bearer fake-token")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        content: "# Agreement\nVehicle / Number Plate: Toyota Camry - ABC12D",
        vehicle_label: "Toyota Camry - ABC12D",
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Failed to save lease agreement");
    expect(mockState.lease_agreements).toHaveLength(0);
  });

  it("POST /api/agreements identifies the live legacy_application_id schema drift", async () => {
    mockState.applications[1].status = "Paid";
    mockState.leaseAgreementInsertErrorMode = "legacy_application_id_required";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await request(app)
      .post("/api/agreements")
      .set("Authorization", "Bearer fake-token")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        content: "# Agreement",
        vehicle_label: "FZS37Y",
      });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain("retired application ID");
    expect(errorSpy).toHaveBeenCalledWith(
      "Lease agreement save failed",
      expect.objectContaining({
        code: "23502",
        column: "legacy_application_id",
        constraint: null,
        operation: "insert",
        table: "lease_agreements",
      }),
    );
    errorSpy.mockRestore();
  });

  it("POST /api/agreements returns a safe database error reference", async () => {
    mockState.applications[1].status = "Paid";
    mockState.leaseAgreementInsertErrorMode = "generic_failure";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await request(app)
      .post("/api/agreements")
      .set("Authorization", "Bearer fake-token")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        content: "# Agreement",
        vehicle_label: "FZS37Y",
      });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      code: "57014",
      error: "Failed to save lease agreement. Please try again or contact support if it continues.",
    });
    expect(errorSpy.mock.calls[0]?.[1]).not.toHaveProperty("content");
    errorSpy.mockRestore();
  });

  it("POST /api/agreements/car-lease/render handles missing DOB and renders manual bond details", async () => {
    mockState.agreement_templates[0].content = [
      "# Car Lease Agreement",
      "DOB: {{renteeDob}}",
      "{{feeSchedule}}",
    ].join("\n");

    const res = await request(app)
      .post("/api/agreements/car-lease/render")
      .set("Authorization", "Bearer fake-token")
      .send({
        bondAmount: "$1.00",
        bondPaymentMethod: "Not yet collected",
        bondPaymentStatus: "To be collected by admin",
        renteeName: "Muhammad Bilal",
      });

    expect(res.status).toBe(200);
    expect(res.body.agreement).toContain("DOB: Not provided");
    expect(res.body.agreement).toContain("4.1 Security Bond: $1.00");
    expect(res.body.agreement).toContain("Bond Payment Status: To be collected by admin");
    expect(res.body.agreement).toContain("Bond Payment Method: Not yet collected");
  });

  it("GET /api/agreements returns saved agreements without relying on embedded foreign-key relations", async () => {
    mockState.lease_agreements = [
      {
        id: 31,
        application_id: APPROVED_APPLICATION_ID,
        vehicle_label: "CZ55XY",
        content: "# Agreement",
        status: "generated",
        created_at: "2026-03-08T00:00:00.000Z",
      },
    ];

    const res = await request(app)
      .get("/api/agreements")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: 31,
      applicant_name: "Approved Driver",
      car_name: "CZ55XY",
    });
  });

  it("GET /api/agreements/:id returns the saved agreement with applicant and car labels", async () => {
    mockState.lease_agreements = [
      {
        id: 31,
        application_id: APPROVED_APPLICATION_ID,
        vehicle_label: "CZ55XY",
        content: "# Agreement",
        status: "generated",
        created_at: "2026-03-08T00:00:00.000Z",
      },
    ];

    const res = await request(app)
      .get("/api/agreements/31")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 31,
      applicant_name: "Approved Driver",
      car_name: "CZ55XY",
    });
  });

  it("GET /api/agreements/:id rejects malformed agreement ids", async () => {
    const res = await request(app)
      .get("/api/agreements/not-a-number")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("does not expose a lease agreement deletion endpoint", async () => {
    const res = await request(app)
      .delete("/api/agreements/not-a-number")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(404);
  });
});

describe("IndexNow admin route", () => {
  it("POST /admin/test-indexnow requires admin auth", async () => {
    const res = await request(app).post("/admin/test-indexnow").send({
      url: "http://localhost:5173/cars/1",
    });

    expect(res.status).toBe(401);
  });

  it("POST /admin/test-indexnow accepts authenticated admin submissions", async () => {
    const res = await request(app)
      .post("/admin/test-indexnow")
      .set("Authorization", "Bearer fake-token")
      .send({
        url: "http://localhost:5173/cars/1",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("Applications API", () => {
  it("GET /api/live reports process liveness without dependency checks", async () => {
    const res = await request(app).get("/api/live");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "ok",
      environment: "test",
    });
    expect(mockCheckDBHealth).not.toHaveBeenCalled();
    expect(mockCheckDirectDatabaseHealth).not.toHaveBeenCalled();
  });

  it("GET /api/health reports database readiness", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "ok",
      database: "ok",
      directDatabase: "ok",
      paymentActivationMode: "transactional",
    });
  });

  it("GET /api/health returns 503 when the configured direct database health check fails", async () => {
    mockCheckDirectDatabaseHealth.mockRejectedValueOnce(
      new Error("direct database unavailable"),
    );

    const res = await request(app).get("/api/health");

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      status: "error",
      database: "ok",
      directDatabase: "unavailable",
      paymentActivationMode: "transactional",
    });
  });

  it("GET /api/health returns 503 when payment activation schema checks fail", async () => {
    mockCheckDirectDatabaseHealth.mockResolvedValueOnce({
      configured: true,
      mode: "session",
      schemaIssues: ["missing rentals.stripe_subscription_id"],
      source: "DATABASE_URL",
    });

    const res = await request(app).get("/api/health");

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      status: "error",
      database: "ok",
      directDatabase: "unavailable",
      directDatabaseSchemaIssues: ["missing rentals.stripe_subscription_id"],
    });
  });

  it("GET /api/health returns 503 when the database health check fails", async () => {
    mockCheckDBHealth.mockRejectedValueOnce(new Error("database unavailable"));

    const res = await request(app).get("/api/health");

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      status: "error",
      database: "unavailable",
      paymentActivationMode: "transactional",
    });
  });

  it("GET /api/health reports restricted payment handling without direct DB access", async () => {
    mockHasDirectDatabaseConnection.mockReturnValue(false);
    mockCheckDirectDatabaseHealth.mockResolvedValueOnce({
      configured: false,
      issues: [],
      mode: "none",
      source: null,
    });

    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "ok",
      database: "ok",
      directDatabase: "not_configured",
      paymentActivationMode: "restricted",
    });
  });

  it("GET /api/health coalesces concurrent database probes", async () => {
    let resolveHealthCheck!: (value: {
      configured: boolean;
      issues: string[];
    }) => void;
    mockCheckDBHealth.mockReturnValueOnce(
      new Promise<{ configured: boolean; issues: string[] }>((resolve) => {
        resolveHealthCheck = resolve;
      }),
    );

    const firstRequest = request(app)
      .get("/api/health")
      .then((response) => response);
    const secondRequest = request(app)
      .get("/api/health")
      .then((response) => response);

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
    expect(firstResponse.body.database).toBe("ok");
    expect(secondResponse.body.database).toBe("ok");
  });

  it("POST /api/inquiries sends the inquiry through Resend when configured", async () => {
    process.env.RESEND_API_KEY = "test-resend";
    const startDate = getFutureDateOnly(7);
    const endDate = getFutureDateOnly(14);

    const res = await request(app).post("/api/inquiries").send({
      name: "Jordan Prospect",
      email: "jordan.prospect@example.com",
      phone: "0400 000 111",
      startDate,
      endDate,
      message: "Looking for a Camry Hybrid for airport work.",
    });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(mockResendEmailsSend).toHaveBeenCalledTimes(2);
  });

  it("POST /api/inquiries returns 500 when Resend resolves with a provider error", async () => {
    process.env.RESEND_API_KEY = "test-resend";
    mockResendEmailsSend.mockResolvedValueOnce({
      data: null,
      error: { message: "Provider rejected request" },
      headers: null,
    });
    const startDate = getFutureDateOnly(7);
    const endDate = getFutureDateOnly(14);

    const res = await request(app).post("/api/inquiries").send({
      name: "Jordan Prospect",
      email: "jordan.prospect@example.com",
      phone: "0400 000 111",
      startDate,
      endDate,
      message: "Looking for a Camry Hybrid for airport work.",
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to submit availability inquiry");
  });

  it("POST /api/inquiries returns 202 when only the user confirmation email fails", async () => {
    process.env.RESEND_API_KEY = "test-resend";
    mockResendEmailsSend.mockResolvedValueOnce({
      data: { id: "email_admin_123" },
      error: null,
      headers: null,
    });
    mockResendEmailsSend.mockResolvedValueOnce({
      data: null,
      error: { message: "Provider rejected request" },
      headers: null,
    });
    const startDate = getFutureDateOnly(7);
    const endDate = getFutureDateOnly(14);

    const res = await request(app).post("/api/inquiries").send({
      name: "Jordan Prospect",
      email: "jordan.prospect@example.com",
      phone: "0400 000 111",
      startDate,
      endDate,
      message: "Looking for a Camry Hybrid for airport work.",
    });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
  });

  it("POST /api/inquiries returns 503 when inquiry delivery is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    const startDate = getFutureDateOnly(7);
    const endDate = getFutureDateOnly(14);

    const res = await request(app).post("/api/inquiries").send({
      name: "Jordan Prospect",
      email: "jordan.prospect@example.com",
      phone: "0400 000 111",
      startDate,
      endDate,
    });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain("temporarily unavailable");
  });

  it("POST /api/inquiries returns 400 when required fields are missing", async () => {
    const res = await request(app).post("/api/inquiries").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it("POST /api/inquiries returns 400 when the email is invalid", async () => {
    const startDate = getFutureDateOnly(7);
    const endDate = getFutureDateOnly(14);

    const res = await request(app).post("/api/inquiries").send({
      name: "Jordan Prospect",
      email: "not-an-email",
      phone: "0400000111",
      startDate,
      endDate,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("POST /api/inquiries returns 400 when the phone number is not a valid Australian mobile", async () => {
    const startDate = getFutureDateOnly(7);
    const endDate = getFutureDateOnly(14);

    const res = await request(app).post("/api/inquiries").send({
      name: "Jordan Prospect",
      email: "jordan@example.com",
      phone: "123456",
      startDate,
      endDate,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("POST /api/inquiries returns 400 when end date is before start date", async () => {
    const startDate = getFutureDateOnly(14);
    const endDate = getFutureDateOnly(7);

    const res = await request(app).post("/api/inquiries").send({
      name: "Jordan Prospect",
      email: "jordan@example.com",
      phone: "0400000111",
      startDate,
      endDate,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("POST /api/inquiries returns 400 when start date is in the past", async () => {
    const startDate = getPastDateOnly(7);
    const endDate = getFutureDateOnly(7);

    const res = await request(app).post("/api/inquiries").send({
      name: "Jordan Prospect",
      email: "jordan@example.com",
      phone: "0400000111",
      startDate,
      endDate,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("POST /api/inquiries returns 400 when the name is too short", async () => {
    const startDate = getFutureDateOnly(7);
    const endDate = getFutureDateOnly(14);

    const res = await request(app).post("/api/inquiries").send({
      name: "A",
      email: "jordan@example.com",
      phone: "0400000111",
      startDate,
      endDate,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("GET /api/applications returns paginated admin rows without eagerly signing documents", async () => {
    mockStorageFrom.mockClear();
    mockState.applications = [
      {
        ...mockState.applications[1],
        id: "33333333-3333-4333-8333-333333333334",
        created_at: "2026-03-06T00:00:00.000Z",
        email: "latest@example.com",
        name: "Latest Driver",
        status: "Pending",
      },
      {
        ...mockState.applications[1],
        id: APPROVED_APPLICATION_ID,
        created_at: "2026-03-05T00:00:00.000Z",
      },
      {
        ...mockState.applications[0],
        id: PENDING_APPLICATION_ID,
        created_at: "2026-03-04T00:00:00.000Z",
      },
    ];

    const res = await request(app)
      .get("/api/applications?page=2&pageSize=1")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      page: 2,
      pageSize: 1,
      total: 3,
      totalItems: 3,
      totalPages: 3,
    });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(APPROVED_APPLICATION_ID);
    expect(mockStorageFrom).not.toHaveBeenCalled();
  });

  it("GET /api/applications applies search, status filters, and page-size caps on the server", async () => {
    mockState.applications = [
      {
        ...mockState.applications[0],
        created_at: "2026-03-04T00:00:00.000Z",
        status: "Pending",
      },
      {
        ...mockState.applications[1],
        created_at: "2026-03-05T00:00:00.000Z",
        status: "Approved",
      },
      {
        ...mockState.applications[1],
        approved_vehicle: "Mazda CX-5",
        created_at: "2026-03-06T00:00:00.000Z",
        email: "mazda@example.com",
        id: "33333333-3333-4333-8333-333333333335",
        name: "Mazda Driver",
        phone: "0412345000",
        status: "Paid",
      },
    ];

    const res = await request(app)
      .get("/api/applications?page=1&pageSize=500&search=Mazda&status=Paid")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(100);
    expect(res.body.total).toBe(1);
    expect(res.body.totalPages).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      approved_vehicle: "Mazda CX-5",
      email: "mazda@example.com",
      status: "Paid",
    });
  });

  it("GET /api/applications recovers from an unsatisfiable PostgREST range", async () => {
    mockState.applications = [
      {
        ...mockState.applications[1],
        created_at: "2026-03-06T00:00:00.000Z",
        id: "33333333-3333-4333-8333-333333333334",
      },
      {
        ...mockState.applications[0],
        created_at: "2026-03-05T00:00:00.000Z",
      },
    ];

    const res = await request(app)
      .get("/api/applications?page=2&pageSize=100")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      page: 1,
      pageSize: 100,
      total: 2,
      totalItems: 2,
      totalPages: 1,
    });
    expect(res.body.items).toHaveLength(2);
  });

  it("GET /api/applications/:id/documents/:document rejects non-UUID ids", async () => {
    const res = await request(app)
      .get("/api/applications/not-a-uuid/documents/license_photo")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("GET /api/applications/:id/documents/:document rejects external document URLs", async () => {
    const externalDocumentUrl = "https://attacker.example/documents/admin-phishing.html";
    mockState.applications[0].license_photo = externalDocumentUrl;
    mockState.applications[0].licensePhoto = externalDocumentUrl;
    mockStorageFrom.mockClear();

    const res = await request(app)
      .get(`/api/applications/${PENDING_APPLICATION_ID}/documents/license_photo`)
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Document not found");
    expect(mockStorageFrom).not.toHaveBeenCalled();
  });

  it("GET /api/rentals returns paginated rows and caps the page size", async () => {
    mockState.rentals = [
      {
        id: 301,
        application_id: APPROVED_APPLICATION_ID,
        created_at: "2026-03-06T00:00:00.000Z",
        status: "Active",
        vehicle_registration: "CZ55XY-3",
      },
      {
        id: 302,
        application_id: APPROVED_APPLICATION_ID,
        created_at: "2026-03-05T00:00:00.000Z",
        status: "Active",
        vehicle_registration: "CZ55XY-2",
      },
      {
        id: 303,
        application_id: PENDING_APPLICATION_ID,
        created_at: "2026-03-04T00:00:00.000Z",
        status: "Pending",
        vehicle_registration: "CZ55XY-1",
      },
    ];

    const res = await request(app)
      .get("/api/rentals?page=2&pageSize=500")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(100);
    expect(res.body.total).toBe(3);
    expect(res.body.totalPages).toBe(1);
    expect(res.body.page).toBe(1);
    expect(res.body.items).toHaveLength(3);
    expect(getQueryTables().filter((table) => table === "rentals")).toHaveLength(3);
    expect(mockState.queryLog).toHaveLength(3);
    expectNoImportedApplicationPreload();
    expectNoDuplicateRentalRehydration();
  });

  it("GET /api/rentals slices the requested page on the server", async () => {
    mockState.rentals = [
      {
        id: 401,
        application_id: APPROVED_APPLICATION_ID,
        created_at: "2026-03-06T00:00:00.000Z",
        status: "Active",
        vehicle_registration: "CZ55XY-4",
      },
      {
        id: 402,
        application_id: APPROVED_APPLICATION_ID,
        created_at: "2026-03-05T00:00:00.000Z",
        status: "Active",
        vehicle_registration: "CZ55XY-3",
      },
      {
        id: 403,
        application_id: APPROVED_APPLICATION_ID,
        created_at: "2026-03-04T00:00:00.000Z",
        status: "Active",
        vehicle_registration: "CZ55XY-2",
      },
    ];

    const res = await request(app)
      .get("/api/rentals?page=2&pageSize=1")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      page: 2,
      pageSize: 1,
      total: 3,
      totalPages: 3,
    });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      id: 402,
      vehicle_registration: "CZ55XY-3",
    });
    expect(getQueryTables().filter((table) => table === "rentals")).toHaveLength(1);
    expect(mockState.queryLog.length).toBeLessThanOrEqual(2);
    expectNoImportedApplicationPreload();
    expectNoDuplicateRentalRehydration();
  });

  it("GET /api/rentals searches server-side across older records", async () => {
    mockState.rentals = Array.from({ length: 120 }, (_, index) => ({
      application_id:
        index === 0 ? APPROVED_APPLICATION_ID : PENDING_APPLICATION_ID,
      created_at: new Date(Date.UTC(2026, 2, 1 - index)).toISOString(),
      id: 400 + index,
      status: index === 0 ? "Active" : "Pending",
      vehicle_registration: index === 0 ? "OLD-SEARCH-REGO" : `ZZ-${index}`,
    }));

    const res = await request(app)
      .get("/api/rentals?search=OLD-SEARCH-REGO")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      id: 400,
      vehicle_registration: "OLD-SEARCH-REGO",
    });
    expect(getQueryTables()).toEqual(expect.arrayContaining(["applications", "rentals"]));
    expect(mockState.queryLog.length).toBeLessThanOrEqual(2);
    expectNoImportedApplicationPreload();
    expectNoDuplicateRentalRehydration();
  });

  it("GET /api/rentals excludes imported application-linked rentals without loading all imported ids", async () => {
    const importedApplicationId = "00000000-0000-4000-8000-000000000999";
    mockState.applications = [
      ...mockState.applications,
      {
        id: importedApplicationId,
        approved_vehicle: "Imported Toyota",
        created_at: "2026-03-01T00:00:00.000Z",
        email: "legacy@example.invalid",
        experience: "Imported from live fleet data",
        license_number: "legacy-999",
        name: "Legacy Imported Driver",
        phone: "0000000000",
        status: "Paid",
      },
    ];
    mockState.rentals = [
      {
        id: 501,
        application_id: importedApplicationId,
        created_at: "2026-03-07T00:00:00.000Z",
        status: "Active",
        vehicle_registration: "IMPORTED-1",
      },
      {
        id: 502,
        application_id: APPROVED_APPLICATION_ID,
        created_at: "2026-03-06T00:00:00.000Z",
        status: "Active",
        vehicle_registration: "LIVE-1",
      },
    ];

    const res = await request(app)
      .get("/api/rentals?page=1&pageSize=25")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      application_id: APPROVED_APPLICATION_ID,
      vehicle_registration: "LIVE-1",
    });
    expect(getQueryTables().filter((table) => table === "rentals")).toHaveLength(1);
    expect(mockState.queryLog.length).toBeLessThanOrEqual(2);
    expectNoImportedApplicationPreload();
    expectNoDuplicateRentalRehydration();
  });

  it("GET /api/rentals paginates after excluding imported application-linked rentals", async () => {
    const importedApplications = Array.from({ length: 4 }, (_, index) => ({
      id: `00000000-0000-4000-8000-0000000008${index}`,
      approved_vehicle: `Imported Vehicle ${index}`,
      created_at: `2026-03-0${index + 1}T00:00:00.000Z`,
      email: `legacy-${index}@example.invalid`,
      experience: "Imported from live fleet data",
      license_number: `legacy-${index}`,
      name: `Legacy Imported Driver ${index}`,
      phone: "0000000000",
      status: "Paid",
    }));
    const validApplications = Array.from({ length: 5 }, (_, index) => ({
      id: `00000000-0000-4000-8000-0000000009${index}`,
      approved_vehicle: `Valid Vehicle ${index}`,
      created_at: `2026-03-${10 + index}T00:00:00.000Z`,
      email: `valid-${index}@example.com`,
      experience: "1-3 years",
      license_number: `NSW9000${index}`,
      name: `Valid Driver ${index}`,
      phone: `049999990${index}`,
      status: "Paid",
    }));
    mockState.applications = [
      ...mockState.applications,
      ...importedApplications,
      ...validApplications,
    ];
    mockState.rentals = [
      ...importedApplications.map((application, index) => ({
        id: 600 + index,
        application_id: application.id,
        created_at: new Date(Date.UTC(2026, 2, 20 - index)).toISOString(),
        status: "Active",
        vehicle_registration: `IMPORTED-${index}`,
      })),
      ...validApplications.map((application, index) => ({
        id: 700 + index,
        application_id: application.id,
        created_at: new Date(Date.UTC(2026, 2, 10 - index)).toISOString(),
        status: "Active",
        vehicle_registration: `VALID-${index}`,
      })),
    ];

    const page1 = await request(app)
      .get("/api/rentals?page=1&pageSize=2")
      .set("Authorization", "Bearer fake-token");
    const page2 = await request(app)
      .get("/api/rentals?page=2&pageSize=2")
      .set("Authorization", "Bearer fake-token");

    expect(page1.status).toBe(200);
    expect(page1.body).toMatchObject({
      page: 1,
      pageSize: 2,
      total: 5,
      totalItems: 5,
      totalPages: 3,
    });
    expect(page1.body.items.map((rental: Record<string, any>) => rental.vehicle_registration)).toEqual([
      "VALID-0",
      "VALID-1",
    ]);

    expect(page2.status).toBe(200);
    expect(page2.body).toMatchObject({
      page: 2,
      pageSize: 2,
      total: 5,
      totalItems: 5,
      totalPages: 3,
    });
    expect(page2.body.items.map((rental: Record<string, any>) => rental.vehicle_registration)).toEqual([
      "VALID-2",
      "VALID-3",
    ]);
  });

  it("GET /api/rentals search paginates only valid rental matches", async () => {
    const importedApplication = {
      id: "00000000-0000-4000-8000-000000000881",
      approved_vehicle: "Imported Search Vehicle",
      created_at: "2026-03-01T00:00:00.000Z",
      email: "legacy-search@example.invalid",
      experience: "Legacy renter import",
      license_number: "legacy-search",
      name: "Legacy Search Driver",
      phone: "0000000000",
      status: "Paid",
    };
    const validApplications = Array.from({ length: 3 }, (_, index) => ({
      id: `00000000-0000-4000-8000-00000000098${index}`,
      approved_vehicle: `Search Vehicle ${index}`,
      created_at: `2026-03-${10 + index}T00:00:00.000Z`,
      email: `search-valid-${index}@example.com`,
      experience: "1-3 years",
      license_number: `NSW9800${index}`,
      name: `Search Valid Driver ${index}`,
      phone: `048888880${index}`,
      status: "Paid",
    }));
    mockState.applications = [
      ...mockState.applications,
      importedApplication,
      ...validApplications,
    ];
    mockState.rentals = [
      {
        id: 800,
        application_id: importedApplication.id,
        created_at: "2026-03-20T00:00:00.000Z",
        status: "Active",
        vehicle_registration: "SEARCH-IMPORTED",
      },
      ...validApplications.map((application, index) => ({
        id: 810 + index,
        application_id: application.id,
        created_at: new Date(Date.UTC(2026, 2, 10 - index)).toISOString(),
        status: "Active",
        vehicle_registration: `SEARCH-VALID-${index}`,
      })),
    ];

    const res = await request(app)
      .get("/api/rentals?search=SEARCH&page=2&pageSize=2")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      page: 2,
      pageSize: 2,
      total: 3,
      totalItems: 3,
      totalPages: 2,
    });
    expect(res.body.items.map((rental: Record<string, any>) => rental.vehicle_registration)).toEqual([
      "SEARCH-VALID-2",
    ]);
  });

  it("GET /api/rentals keeps valid application rentals visible when optional import marker fields are null", async () => {
    const nullableApplicationId = "00000000-0000-4000-8000-000000001234";
    mockState.applications = [
      ...mockState.applications,
      {
        ...mockState.applications[1],
        id: nullableApplicationId,
        approved_vehicle: "NULL-SAFE-REG",
        email: null,
        experience: null,
        legacy_id: null,
        license_number: null,
        name: "Nullable Valid Driver",
        phone: null,
        status: "Paid",
      },
    ];
    mockState.rentals = [
      {
        id: 875,
        application_id: nullableApplicationId,
        created_at: "2026-03-21T00:00:00.000Z",
        status: "Active",
        vehicle_registration: "NULL-SAFE-REG",
      },
    ];

    const res = await request(app)
      .get("/api/rentals?page=1&pageSize=25")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 1,
      totalItems: 1,
      totalPages: 1,
    });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      application_id: nullableApplicationId,
      vehicle_registration: "NULL-SAFE-REG",
    });
    expectNoImportedApplicationPreload();
    expectNoDuplicateRentalRehydration();
  });

  it("GET /api/rentals still excludes an imported application when any one canonical marker is present", async () => {
    const importedByExperienceId = "00000000-0000-4000-8000-000000001235";
    const validApplicationId = "00000000-0000-4000-8000-000000001236";
    mockState.applications = [
      ...mockState.applications,
      {
        ...mockState.applications[1],
        id: importedByExperienceId,
        email: null,
        experience: "Legacy renter import",
        legacy_id: null,
        license_number: null,
        phone: null,
        status: "Paid",
      },
      {
        ...mockState.applications[1],
        id: validApplicationId,
        approved_vehicle: "VALID-MARKER-CHECK",
        email: null,
        experience: null,
        legacy_id: null,
        license_number: null,
        phone: null,
        status: "Paid",
      },
    ];
    mockState.rentals = [
      {
        id: 876,
        application_id: importedByExperienceId,
        created_at: "2026-03-22T00:00:00.000Z",
        status: "Active",
        vehicle_registration: "IMPORTED-MARKER",
      },
      {
        id: 877,
        application_id: validApplicationId,
        created_at: "2026-03-21T00:00:00.000Z",
        status: "Active",
        vehicle_registration: "VALID-MARKER-CHECK",
      },
    ];

    const res = await request(app)
      .get("/api/rentals?page=1&pageSize=25")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(1);
    expect(res.body.items.map((rental: Record<string, any>) => rental.vehicle_registration)).toEqual([
      "VALID-MARKER-CHECK",
    ]);
  });

  it("GET /api/rentals excludes unlinked rentals under the current application-backed rental invariant", async () => {
    mockState.rentals = [
      {
        id: 878,
        application_id: null,
        created_at: "2026-03-22T00:00:00.000Z",
        status: "Active",
        vehicle_registration: "UNLINKED-REG",
      },
      {
        id: 879,
        application_id: APPROVED_APPLICATION_ID,
        created_at: "2026-03-21T00:00:00.000Z",
        status: "Active",
        vehicle_registration: "LINKED-REG",
      },
    ];

    const res = await request(app)
      .get("/api/rentals?page=1&pageSize=25")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(1);
    expect(res.body.items.map((rental: Record<string, any>) => rental.vehicle_registration)).toEqual([
      "LINKED-REG",
    ]);
    expectNoImportedApplicationPreload();
  });

  it("POST /api/applications supports camel-case Supabase application schemas", async () => {
    mockState.applications[1].status = "Paid";
    mockState.applications[1].paid_at = "2026-03-07T00:00:00.000Z";

    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: "New Driver",
      phone: "0400111222",
      email: "newdriver@example.com",
      license_number: "NSW55555",
      license_expiry: getFutureDateOnly(365),
      uber_status: "Applying",
      experience: "New Driver",
      address: "55 Test Street",
      weekly_budget: "$350/week",
      intended_start_date: getFutureDateOnly(7),
      license_photo: "data:image/png;base64,ZmFrZQ==",
      license_back_photo: "data:image/png;base64,ZmFrZQ==",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.checkout_url).toBeUndefined();
    expect(mockState.applications).toHaveLength(3);
    expect(mockState.applications[2]).toMatchObject({
      email: "newdriver@example.com",
      license_number: "NSW55555",
      status: "Pending",
      agreement_template_version: 2,
    });
  });

  it("POST /api/applications allows submissions without a preferred vehicle selection", async () => {
    mockState.applications[1].status = "Paid";
    mockState.applications[1].paid_at = "2026-03-07T00:00:00.000Z";

    const res = await createApplicationSubmissionRequest({
      selected_car_id: undefined,
      name: "Review Match Driver",
      phone: "0400333444",
      email: "review-match@example.com",
      license_number: "NSW31313",
      license_expiry: getFutureDateOnly(365),
      uber_status: "Applying",
      experience: "New Driver",
      address: "9 Review Street",
      weekly_budget: "$340/week",
      intended_start_date: getFutureDateOnly(7),
      license_photo: "data:image/png;base64,ZmFrZQ==",
      license_back_photo: "data:image/png;base64,ZmFrZQ==",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.checkout_url).toBeUndefined();
    expect(mockState.applications).toHaveLength(3);
    expect(mockState.applications[2]).toMatchObject({
      email: "review-match@example.com",
      license_number: "NSW31313",
      status: "Pending",
    });
  });

  it("POST /api/applications accepts valid submissions that exceed the global JSON parser limit", async () => {
    mockState.applications[1].status = "Paid";
    mockState.applications[1].paid_at = "2026-03-07T00:00:00.000Z";
    const largeImagePayload = `data:image/png;base64,${"A".repeat(140 * 1024)}`;

    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: "Large Payload Driver",
      phone: "0400999888",
      email: "large-payload@example.com",
      license_number: "NSW88888",
      license_expiry: getFutureDateOnly(365),
      uber_status: "Applying",
      experience: "New Driver",
      address: "101 Parser Street",
      weekly_budget: "$390/week",
      intended_start_date: getFutureDateOnly(7),
      license_photo: largeImagePayload,
      license_back_photo: largeImagePayload,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.checkout_url).toBeUndefined();
    expect(mockState.applications.at(-1)?.email).toBe(
      "large-payload@example.com",
    );
  });

  it("POST /api/applications rejects multipart envelopes with too many text fields", async () => {
    let submission = request(app).post("/api/applications");
    for (let index = 0; index < 21; index += 1) {
      submission = submission.field(`unexpected_${index}`, "value");
    }

    const res = await submission;

    expect(res.status).toBe(413);
    expect(res.body.error).toContain("multipart limits");
    expect(mockState.applications).toHaveLength(2);
  });

  it("POST /api/applications creates a pending application without generating an agreement or checkout link", async () => {
    process.env.LEASE_OWNER_NAME = "Maple Rentals";
    process.env.LEASE_OWNER_ADDRESS =
      "13/27-33 Addlestone Rd, Merrylands NSW 2160";
    process.env.LEASE_OWNER_EMAIL = "admin@maplerentals.com.au";
    mockState.applications[1].status = "Paid";
    mockState.applications[1].paid_at = "2026-03-07T00:00:00.000Z";

    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: "Agreement Driver",
      phone: "0400222333",
      email: "agreement@example.com",
      license_number: "NSW12121",
      license_expiry: getFutureDateOnly(365),
      uber_status: "Applying",
      experience: "New Driver",
      address: "44 Agreement Street",
      weekly_budget: "$360/week",
      intended_start_date: getFutureDateOnly(7),
      license_photo: "data:image/png;base64,ZmFrZQ==",
      license_back_photo: "data:image/png;base64,ZmFrZQ==",
    });

    expect(res.status).toBe(200);
    expect(res.body.checkout_url).toBeUndefined();
    expect(mockState.lease_agreements).toHaveLength(0);
    expect(mockState.applications.at(-1)).toMatchObject({
      status: "Pending",
      agreement_template_version: 2,
    });
  });

  it("POST /api/applications escapes applicant-controlled HTML before sending emails", async () => {
    process.env.RESEND_API_KEY = "test-resend";
    mockResendEmailsSend.mockClear();
    mockState.applications[1].status = "Paid";
    mockState.applications[1].paid_at = "2026-03-07T00:00:00.000Z";

    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: "<img src=x onerror=alert(1)>",
      phone: "0400111222",
      email: "markup@example.com",
      license_number: "NSW77777",
      license_expiry: getFutureDateOnly(365),
      uber_status: "Applying",
      experience: "<b>Experienced</b>",
      address: '<a href=\"https://evil.example\">Click me</a>',
      weekly_budget: "$350/week",
      intended_start_date: getFutureDateOnly(7),
      license_photo: "data:image/png;base64,ZmFrZQ==",
      license_back_photo: "data:image/png;base64,ZmFrZQ==",
    });

    expect(res.status).toBe(200);
    expect(mockResendEmailsSend).toHaveBeenCalledTimes(2);
    expect(mockResendEmailsSend).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        html: expect.stringContaining("&lt;img src=x onerror=alert(1)&gt;"),
      }),
    );
    expect(mockResendEmailsSend).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        html: expect.stringContaining("&lt;img src=x onerror=alert(1)&gt;"),
      }),
    );
    expect(mockResendEmailsSend.mock.calls[1]?.[0]?.html).not.toContain(
      "<img src=x onerror=alert(1)>",
    );
  });

  it("POST /api/applications rejects unsupported image formats", async () => {
    mockState.applications[1].status = "Paid";
    mockState.applications[1].paid_at = "2026-03-07T00:00:00.000Z";

    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: "Unsafe Driver",
      phone: "0400111222",
      email: "unsafe@example.com",
      license_number: "NSW22222",
      license_expiry: getFutureDateOnly(365),
      uber_status: "Applying",
      experience: "New Driver",
      address: "77 Test Street",
      weekly_budget: "$320/week",
      intended_start_date: getFutureDateOnly(7),
      license_photo: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      license_back_photo: "data:image/png;base64,ZmFrZQ==",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("JPG or PNG");
    expect(mockState.applications).toHaveLength(2);
  });

  it("POST /api/applications validates phone and date fields on the server", async () => {
    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: "Direct API Driver",
      phone: "12345",
      email: "direct-api@example.com",
      license_number: "NSW42424",
      license_expiry: getPastDateOnly(1),
      uber_status: "Applying",
      experience: "New Driver",
      address: "88 Test Street",
      weekly_budget: "$320/week",
      intended_start_date: getPastDateOnly(1),
      license_photo: "data:image/png;base64,ZmFrZQ==",
      license_back_photo: "data:image/png;base64,ZmFrZQ==",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Valid Australian mobile number required",
        }),
        expect.objectContaining({ message: "License must not be expired" }),
        expect.objectContaining({
          message: "Start date must be today or later",
        }),
      ]),
    );
    expect(mockState.applications).toHaveLength(2);
  });

  it("POST /api/applications stores applicant phone numbers in a normalized format", async () => {
    mockState.applications[1].status = "Paid";
    mockState.applications[1].paid_at = "2026-03-07T00:00:00.000Z";

    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: "Normalized Phone Driver",
      phone: "0400 000 111",
      email: "normalized-phone@example.com",
      license_number: "NSW55555",
      license_expiry: getFutureDateOnly(365),
      uber_status: "Applying",
      experience: "New Driver",
      address: "88 Test Street",
      weekly_budget: "$320/week",
      intended_start_date: getFutureDateOnly(7),
      license_photo: "data:image/png;base64,ZmFrZQ==",
      license_back_photo: "data:image/png;base64,ZmFrZQ==",
    });

    expect(res.status).toBe(200);
    expect(mockState.applications.at(-1)?.phone).toBe("0400000111");
  });

  it("PUT /api/applications/:id/status returns 404 when the application does not exist", async () => {
    const res = await request(app)
      .put(`/api/applications/${UNKNOWN_APPLICATION_ID}/status`)
      .set("Authorization", "Bearer fake-token")
      .send({ status: "Rejected" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Application not found");
  });

  it("PUT /api/applications/:id/status rejects non-UUID ids", async () => {
    const res = await request(app)
      .put("/api/applications/not-a-uuid/status")
      .set("Authorization", "Bearer fake-token")
      .send({ status: "Rejected" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("POST /api/applications blocks public overwrites for rejected applications", async () => {
    mockState.applications[0] = {
      ...mockState.applications[0],
      assigned_car_id: 2,
      approved_at: "2026-03-06T00:00:00.000Z",
      approved_bond: 700,
      approved_weekly_price: 320,
      paid_at: "2026-03-07T00:00:00.000Z",
      payment_link_sent_at: "2026-03-06T00:00:00.000Z",
      payment_link_version: 4,
      pending_checkout_session_id: "cs_old_pending",
      status: "Rejected",
    };

    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: "Jane Driver",
      phone: "0412345678",
      email: "jane@example.com",
      license_number: "NSW12345",
      license_expiry: getFutureDateOnly(365),
      uber_status: "Active",
      experience: "3+ years",
      address: "99 Updated Street",
      weekly_budget: "$410/week",
      intended_start_date: getFutureDateOnly(7),
      license_photo: "data:image/png;base64,ZmFrZQ==",
      license_back_photo: "data:image/png;base64,ZmFrZQ==",
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already been reviewed");
    expect(mockState.applications).toHaveLength(2);
    expect(mockState.applications[0]).toMatchObject({
      id: PENDING_APPLICATION_ID,
      status: "Rejected",
      assigned_car_id: 2,
      approved_at: "2026-03-06T00:00:00.000Z",
      approved_bond: 700,
      approved_weekly_price: 320,
      paid_at: "2026-03-07T00:00:00.000Z",
      payment_link_sent_at: "2026-03-06T00:00:00.000Z",
      payment_link_version: 4,
      pending_checkout_session_id: "cs_old_pending",
      address: "1 Test Street",
      experience: "New Driver",
    });
  });

  it("POST /api/applications blocks public overwrites for pending applications", async () => {
    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: "Jane Driver",
      phone: "0412345678",
      email: "jane@example.com",
      license_number: "NSW12345",
      license_expiry: getFutureDateOnly(365),
      uber_status: "Active",
      experience: "1-3 years",
      address: "12 Mixed Case Street",
      weekly_budget: "$360/week",
      intended_start_date: getFutureDateOnly(10),
      license_photo: "data:image/png;base64,ZmFrZQ==",
      license_back_photo: "data:image/png;base64,ZmFrZQ==",
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already under review");
    expect(mockState.applications[0].address).toBe("1 Test Street");
  });

  it("POST /api/applications treats rejected email lookups case-insensitively", async () => {
    mockState.applications[0].status = "Rejected";

    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: "Jane Driver",
      phone: "0412345678",
      email: "Jane@Example.com",
      license_number: "NSW12345",
      license_expiry: getFutureDateOnly(365),
      uber_status: "Active",
      experience: "1-3 years",
      address: "12 Mixed Case Street",
      weekly_budget: "$360/week",
      intended_start_date: getFutureDateOnly(10),
      license_photo: "data:image/png;base64,ZmFrZQ==",
      license_back_photo: "data:image/png;base64,ZmFrZQ==",
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already been reviewed");
    expect(mockState.applications).toHaveLength(2);
    expect(mockState.applications[0]).toMatchObject({
      id: PENDING_APPLICATION_ID,
      email: "jane@example.com",
      address: "1 Test Street",
      experience: "New Driver",
    });
  });

  it("POST /api/applications normalizes Australian mobile formats before duplicate checks", async () => {
    mockState.applications[0].status = "Rejected";

    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: "Jane Driver",
      phone: "+61 412 345 678",
      email: "Jane@Example.com",
      license_number: "NSW12345",
      license_expiry: getFutureDateOnly(365),
      uber_status: "Active",
      experience: "1-3 years",
      address: "12 Mixed Case Street",
      weekly_budget: "$360/week",
      intended_start_date: getFutureDateOnly(10),
      license_photo: "data:image/png;base64,ZmFrZQ==",
      license_back_photo: "data:image/png;base64,ZmFrZQ==",
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already been reviewed");
    expect(mockState.applications).toHaveLength(2);
  });

  it("POST /api/applications does not treat underscores in emails as wildcard matches", async () => {
    mockState.applications = [
      {
        ...mockState.applications[0],
        id: UNDERSCORE_APPLICATION_ID,
        email: "fooxbar@example.com",
        phone: "0400000000",
        license_number: "NSW00000",
      },
      {
        ...mockState.applications[0],
        id: UNDERSCORE_REJECTED_APPLICATION_ID,
        email: "foo_bar@example.com",
        phone: "0412345678",
        license_number: "NSW12345",
        status: "Rejected",
      },
    ];

    const res = await createApplicationSubmissionRequest({
      selected_car_id: 1,
      name: "Jane Driver",
      phone: "0412345678",
      email: "foo_bar@example.com",
      license_number: "NSW12345",
      license_expiry: getFutureDateOnly(365),
      uber_status: "Active",
      experience: "1-3 years",
      address: "12 Exact Match Street",
      weekly_budget: "$360/week",
      intended_start_date: getFutureDateOnly(10),
      license_photo: "data:image/png;base64,ZmFrZQ==",
      license_back_photo: "data:image/png;base64,ZmFrZQ==",
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already been reviewed");
    expect(
      mockState.applications.find(
        (application) => application.id === UNDERSCORE_APPLICATION_ID,
      )?.address,
    ).toBe("1 Test Street");
    expect(
      mockState.applications.find(
        (application) => application.id === UNDERSCORE_REJECTED_APPLICATION_ID,
      )?.address,
    ).toBe("1 Test Street");
  });
});

describe("Operational history API", () => {
  const makeOperationalRowsCurrent = () => {
    mockState.customers = mockState.customers.map((customer, index) => ({
      ...customer,
      email: index === 0 ? "alex.driver@example.com" : "jordan.rider@example.com",
      source: "current",
    }));
    mockState.invoices = mockState.invoices.map((invoice) => ({
      ...invoice,
      source: "current",
    }));
  };

  it("GET /api/customers excludes imported legacy customer rows by default", async () => {
    const res = await request(app)
      .get("/api/customers")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(0);
    expect(res.body.items).toEqual([]);
  });

  it("GET /api/customers returns customer summaries for admins", async () => {
    makeOperationalRowsCurrent();

    const res = await request(app)
      .get("/api/customers")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.page).toBe(1);
    expect(res.body.totalItems).toBe(2);
    expect(res.body.items[0].invoice_count).toBe(1);
    expect(res.body.items[0].total_billed).toBe(230.99);
  });

  it("GET /api/customers supports paginated search results for admins", async () => {
    makeOperationalRowsCurrent();

    const res = await request(app)
      .get("/api/customers")
      .query({ search: "Jordan", pageSize: 1, page: 1 })
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(1);
    expect(res.body.totalPages).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].full_name).toBe("Jordan Rider");
  });

  it("GET /api/customers excludes name-only customer rows without invoice activity", async () => {
    makeOperationalRowsCurrent();
    mockState.customers.push({
      id: 3,
      external_id: null,
      staff_number: null,
      full_name: "Name Only Customer",
      preferred_name: null,
      company_name: null,
      phone: null,
      email: null,
      date_of_birth: null,
      street: null,
      city: null,
      postcode: null,
      state: null,
      source: "current",
      created_at: "2026-03-05T00:00:00.000Z",
      updated_at: "2026-03-05T00:00:00.000Z",
    });

    const res = await request(app)
      .get("/api/customers")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(2);
    expect(res.body.items.map((customer: any) => customer.full_name)).not.toContain(
      "Name Only Customer",
    );
  });

  it("GET /api/invoices returns invoice history for admins", async () => {
    makeOperationalRowsCurrent();

    const res = await request(app)
      .get("/api/invoices")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.page).toBe(1);
    expect(res.body.totalItems).toBe(2);
    expect(res.body.items[0].external_invoice_number).toBe("1882");
    expect(res.body.items[1].status).toBe("Paid");
  });

  it("GET /api/invoices supports paginated search results for admins", async () => {
    makeOperationalRowsCurrent();

    const res = await request(app)
      .get("/api/invoices")
      .query({ search: "YNU55M", pageSize: 1, page: 1 })
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(1);
    expect(res.body.totalPages).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].external_invoice_number).toBe("1881");
  });

  it("GET /api/invoices recovers from an unsatisfiable PostgREST range", async () => {
    makeOperationalRowsCurrent();

    const res = await request(app)
      .get("/api/invoices?page=2&pageSize=100")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      available: true,
      page: 1,
      pageSize: 100,
      totalItems: 2,
      totalPages: 1,
    });
    expect(res.body.items).toHaveLength(2);
  });

  it("GET /api/financials/stats excludes imported applications and rentals", async () => {
    mockState.applications = [
      {
        ...mockState.applications[0],
        id: PENDING_APPLICATION_ID,
        legacy_id: 101,
        email: "legacy-cno40s@example.invalid",
        phone: "0000000000",
        license_number: "LEGACY-CNO40S",
        experience: "Imported from live fleet data on 2026-05-17.",
      },
      {
        ...mockState.applications[1],
        id: BLOCKING_APPLICATION_ID,
        legacy_id: null,
        email: "real.driver@example.com",
        phone: "0400000001",
        license_number: "NSW123456",
        experience: "Five years driving rideshare in Sydney.",
      },
    ];
    mockState.rentals = [
      {
        id: 20,
        application_id: PENDING_APPLICATION_ID,
        car_id: 1,
        status: "Active",
        start_date: "2026-05-17",
        weekly_price: 11817,
        legacy_application_id: 101,
      },
      {
        id: 21,
        application_id: BLOCKING_APPLICATION_ID,
        car_id: 2,
        status: "Active",
        start_date: "2026-05-18",
        weekly_price: 260,
        legacy_application_id: null,
        stripe_subscription_id: "sub_live",
      },
    ];

    const res = await request(app)
      .get("/api/financials/stats")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total_applications: 1,
      active_rentals: 1,
      total_weekly_income: 260,
    });
  });

  it("GET /api/financials/dashboard-summary returns authoritative admin metrics", async () => {
    mockState.applications = [
      {
        ...mockState.applications[0],
        id: PENDING_APPLICATION_ID,
        legacy_id: null,
        email: "pending.driver@example.com",
        phone: "0400000200",
        license_number: "NSW200001",
        experience: "Recent applicant",
        status: "Pending",
        created_at: "2026-03-05T00:00:00.000Z",
      },
      {
        ...mockState.applications[1],
        id: BLOCKING_APPLICATION_ID,
        legacy_id: null,
        email: "paid.driver@example.com",
        phone: "0400000201",
        license_number: "NSW200002",
        experience: "Experienced driver",
        status: "Paid",
        approved_weekly_price: 275,
        paid_at: "2026-03-06T00:00:00.000Z",
        created_at: "2026-03-04T00:00:00.000Z",
      },
    ];
    mockState.rentals = [
      {
        id: 20,
        application_id: BLOCKING_APPLICATION_ID,
        status: "Active",
        start_date: "2026-03-07",
        weekly_price: 275,
        created_at: "2026-03-07T00:00:00.000Z",
      },
    ];
    mockState.invoices = [
      {
        ...mockState.invoices[0],
        id: 1,
        balance: 120,
        amount: 220,
        status: "Open",
        invoice_date: "2026-03-06",
      },
      {
        ...mockState.invoices[1],
        id: 2,
        balance: 0,
        amount: 180,
        status: "Paid",
        invoice_date: "2026-03-05",
      },
    ];
    mockState.lease_agreements = [
      {
        id: 1,
        application_id: BLOCKING_APPLICATION_ID,
        status: "saved",
        created_at: "2026-03-06T00:00:00.000Z",
      },
    ];
    mockState.admin_audit_events = [
      {
        id: 1,
        action: "application_payment_approved",
        actor: "admin@maplerentals.com.au",
        created_at: "2026-03-06T02:00:00.000Z",
        target_type: "application",
        target_id: BLOCKING_APPLICATION_ID,
      },
    ];

    const res = await request(app)
      .get("/api/financials/dashboard-summary")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total_applications: 2,
      pending_applications: 1,
      paid_applications: 1,
      active_rentals: 1,
      weekly_recurring_revenue: 275,
      outstanding_invoices: 120,
      overdue_invoices: 1,
      agreements_generated: 1,
      agreements_awaiting_attention: 0,
      total_customers: expect.any(Number),
    });
    expect(res.body.status_distribution).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Pending", value: 1 }),
        expect.objectContaining({ label: "Paid", value: 1 }),
      ]),
    );
    expect(res.body.recent_payments[0]).toMatchObject({
      id: BLOCKING_APPLICATION_ID,
      type: "payment",
      title: expect.stringContaining("marked paid"),
    });
    expect(res.body.recent_admin_actions[0]).toMatchObject({
      actor: "admin@maplerentals.com.au",
      type: "audit",
    });
  });

  it("GET /api/financials/dashboard-summary uses the bounded database aggregate", async () => {
    const databaseSummary = {
      active_rentals: 3,
      agreements_awaiting_attention: 1,
      agreements_generated: 4,
      applications_by_status: { Paid: 3 },
      outstanding_invoices: 90,
      overdue_invoices: 1,
      pending_applications: 0,
      paid_applications: 3,
      recent_admin_actions: [],
      recent_applications: [],
      recent_payments: [],
      recent_rental_activity: [],
      revenue_trend: [],
      status_distribution: [{ label: "Paid", value: 3 }],
      summary_generated_at: "2026-07-20T00:00:00.000Z",
      total_applications: 3,
      total_customers: 3,
      total_weekly_income: 900,
      weekly_recurring_revenue: 900,
    };
    mockDbRpc.mockResolvedValueOnce({ data: databaseSummary, error: null });

    const res = await request(app)
      .get("/api/financials/dashboard-summary")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(databaseSummary);
    expect(mockDbRpc).toHaveBeenCalledWith("get_admin_dashboard_summary");
  });

  it("GET /api/financials/weekly returns zero projections when only imported active rentals exist", async () => {
    mockState.applications = [
      {
        ...mockState.applications[0],
        id: PENDING_APPLICATION_ID,
        legacy_id: 101,
        email: "legacy-cno40s@example.invalid",
        phone: "0000000000",
        license_number: "LEGACY-CNO40S",
        experience: "Imported from live fleet data on 2026-05-17.",
      },
    ];
    mockState.rentals = [
      {
        id: 20,
        application_id: PENDING_APPLICATION_ID,
        car_id: 1,
        status: "Active",
        start_date: "2026-05-17",
        weekly_price: 11817,
        legacy_application_id: 101,
      },
    ];
    mockStripe.payoutsList.mockResolvedValueOnce({ data: [] });

    const res = await request(app)
      .get("/api/financials/weekly?startDate=2026-05-18&endDate=2026-05-24")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      projected_gross_weekly: 0,
      projected_net_weekly: 0,
      estimated_platform_fees: 0,
      actual_payouts_weekly: 0,
      recent_payouts: [],
      recent_payouts_truncated: false,
    });
  });

  it("GET /api/financials/weekly paginates Stripe payouts beyond the first page", async () => {
    mockState.applications = [];
    mockState.rentals = [];
    mockState.stripe_balance_transactions = [
      {
        id: "txn_csv_1",
        type: "payment",
        source: "py_csv_1",
        amount: 300,
        fee: 3.3,
        net: 296.7,
        currency: "aud",
        created_at: "2026-05-20T15:01:00.000Z",
        description: "Subscription update",
        transfer: "po_csv_1",
      },
    ];

    const firstPage = Array.from({ length: 10 }, (_, index) => buildStripePayout(index));
    const secondPage = [buildStripePayout(10)];

    mockStripe.payoutsList
      .mockResolvedValueOnce({
        data: firstPage,
        has_more: true,
      })
      .mockResolvedValueOnce({
        data: secondPage,
        has_more: false,
      });

    const res = await request(app)
      .get("/api/financials/weekly?startDate=2026-05-18&endDate=2026-05-24")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(mockStripe.payoutsList).toHaveBeenCalledTimes(2);
    expect(mockStripe.payoutsList.mock.calls[1]?.[0]).toMatchObject({
      starting_after: "po_10",
    });
    expect(res.body).toMatchObject({
      actual_payouts_weekly: 6600,
      imported_balance_gross: 300,
      imported_balance_net: 296.7,
      imported_balance_transactions: [
        {
          id: "txn_csv_1",
          type: "payment",
          amount: 300,
          fee: 3.3,
          net: 296.7,
          currency: "aud",
          created_at: "2026-05-20T15:01:00.000Z",
          description: "Subscription update",
          source: "py_csv_1",
          transfer: "po_csv_1",
        },
      ],
      recent_payouts: firstPage.slice(0, 10).map((payout) => ({
        id: payout.id,
        amount: payout.amount / 100,
        arrival_date: new Date(payout.arrival_date * 1000).toISOString().slice(0, 10),
        status: payout.status,
      })),
      recent_payouts_truncated: true,
    });
  });

  it("POST /api/admin/rentals/:id/cancel-subscription requires admin auth", async () => {
    const res = await request(app)
      .post("/api/admin/rentals/20/cancel-subscription")
      .send({ confirm: "CANCEL SUBSCRIPTION", cancelAtPeriodEnd: true });

    expect(res.status).toBe(401);
  });

  it("POST /api/admin/rentals/:id/cancel-subscription rejects the wrong confirmation phrase", async () => {
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        status: "Active",
        start_date: "2026-03-01",
        weekly_price: 250,
        stripe_subscription_id: "sub_active",
      },
    ];

    const res = await request(app)
      .post("/api/admin/rentals/20/cancel-subscription")
      .set("Authorization", "Bearer fake-token")
      .send({ confirm: "cancel", cancelAtPeriodEnd: true });

    expect(res.status).toBe(400);
    expect(mockStripe.subscriptionsUpdate).not.toHaveBeenCalled();
    expect(mockStripe.subscriptionsCancel).not.toHaveBeenCalled();
  });

  it("POST /api/admin/rentals/:id/cancel-subscription returns 400 when no subscription is linked", async () => {
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        status: "Active",
        start_date: "2026-03-01",
        weekly_price: 250,
        stripe_subscription_id: null,
      },
    ];

    const res = await request(app)
      .post("/api/admin/rentals/20/cancel-subscription")
      .set("Authorization", "Bearer fake-token")
      .send({ confirm: "CANCEL SUBSCRIPTION", cancelAtPeriodEnd: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("No Stripe subscription");
  });

  it("POST /api/admin/rentals/:id/cancel-subscription schedules period-end cancellation", async () => {
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        status: "Active",
        start_date: "2026-03-01",
        weekly_price: 250,
        stripe_subscription_id: "sub_active",
      },
    ];
    mockStripe.subscriptionsUpdate.mockResolvedValueOnce({
      id: "sub_active",
      cancel_at_period_end: true,
      status: "active",
      current_period_end: Math.floor(
        new Date("2026-04-01T00:00:00Z").getTime() / 1000,
      ),
    });

    const res = await request(app)
      .post("/api/admin/rentals/20/cancel-subscription")
      .set("Authorization", "Bearer fake-token")
      .send({
        confirm: "CANCEL SUBSCRIPTION",
        cancelAtPeriodEnd: true,
        reason: "Driver returning vehicle",
      });

    expect(res.status).toBe(200);
    expect(mockStripe.subscriptionsUpdate).toHaveBeenCalledWith(
      "sub_active",
      expect.objectContaining({
        cancel_at_period_end: true,
        metadata: expect.objectContaining({
          admin_cancellation_reason: "Driver returning vehicle",
        }),
      }),
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^maple-cancel-/) }),
    );
    expect(mockState.rentals[0].status).toBe("Active");
    expect(res.body).toMatchObject({
      success: true,
      rentalId: "20",
      cancelAtPeriodEnd: true,
      stripeStatus: "active",
    });
  });

  it("POST /api/admin/rentals/:id/cancel-subscription cancels immediately and updates local rental", async () => {
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        status: "Active",
        start_date: "2026-03-01",
        weekly_price: 250,
        stripe_subscription_id: "sub_active",
      },
    ];
    mockStripe.subscriptionsCancel.mockResolvedValueOnce({
      id: "sub_active",
      status: "canceled",
    });

    const res = await request(app)
      .post("/api/admin/rentals/20/cancel-subscription")
      .set("Authorization", "Bearer fake-token")
      .send({ confirm: "CANCEL SUBSCRIPTION", cancelAtPeriodEnd: false });

    expect(res.status).toBe(200);
    expect(mockStripe.subscriptionsCancel).toHaveBeenCalledWith(
      "sub_active",
      {},
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^maple-cancel-/),
      }),
    );
    expect(mockState.rentals[0].status).toBe("Cancelled");
    expect(res.body.stripeStatus).toBe("canceled");
  });

  it("POST /api/admin/rentals/:id/cancel-subscription atomically claims one concurrent operation and passes its persisted idempotency key to Stripe", async () => {
    mockState.rentals = [{
      id: 20,
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      status: "Active",
      start_date: "2026-03-01",
      weekly_price: 250,
      stripe_subscription_id: "sub_concurrent",
    }];
    let releaseStripeRetrieve!: () => void;
    let markStripeRetrieveStarted!: () => void;
    const stripeRetrieveStarted = new Promise<void>((resolve) => {
      markStripeRetrieveStarted = resolve;
    });
    const stripeRetrieveRelease = new Promise<void>((resolve) => {
      releaseStripeRetrieve = resolve;
    });
    mockStripe.subscriptionsRetrieve.mockImplementation(async () => {
      markStripeRetrieveStarted();
      await stripeRetrieveRelease;
      return { id: "sub_concurrent", status: "active" };
    });
    mockStripe.subscriptionsCancel.mockResolvedValue({
      id: "sub_concurrent",
      status: "canceled",
    });

    const requests = [
      request(app)
        .post("/api/admin/rentals/20/cancel-subscription")
        .set("Authorization", "Bearer fake-token")
        .send({ confirm: "CANCEL SUBSCRIPTION", cancelAtPeriodEnd: false })
        .then((response) => response),
      request(app)
        .post("/api/admin/rentals/20/cancel-subscription")
        .set("Authorization", "Bearer fake-token")
        .send({ confirm: "CANCEL SUBSCRIPTION", cancelAtPeriodEnd: false })
        .then((response) => response),
    ];
    await stripeRetrieveStarted;
    await new Promise<void>((resolve) => setImmediate(resolve));
    releaseStripeRetrieve();
    const [first, second] = await Promise.all(requests);

    expect([first.status, second.status].sort()).toEqual([200, 202]);
    expect(mockState.stripe_cancellation_operations).toHaveLength(1);
    expect(mockStripe.subscriptionsCancel).toHaveBeenCalledTimes(1);
    expect(mockStripe.subscriptionsCancel).toHaveBeenCalledWith(
      "sub_concurrent",
      {},
      { idempotencyKey: mockState.stripe_cancellation_operations[0].idempotency_key },
    );
  });

  it("POST /api/admin/rentals/:id/cancel-subscription reclaims a stale stripe_processing operation", async () => {
    const idempotencyKey = cancellationIdempotencyKey({
      operationType: "rental",
      targetId: "20",
      mode: "immediate",
      relationshipId: "sub_stale_claim",
    });
    mockState.rentals = [{
      id: 20,
      application_id: APPROVED_APPLICATION_ID,
      status: "Active",
      stripe_subscription_id: "sub_stale_claim",
    }];
    mockState.stripe_cancellation_operations = [{
      id: "77777777-7777-4777-8777-777777777777",
      operation_type: "rental",
      rental_id: 20,
      requested_mode: "immediate",
      stripe_subscription_id: "sub_stale_claim",
      idempotency_key: idempotencyKey,
      status: "stripe_processing",
      attempt_count: 1,
      processing_started_at: "2026-01-01T00:00:00.000Z",
    }];
    mockStripe.subscriptionsRetrieve.mockResolvedValue({ id: "sub_stale_claim", status: "active" });
    mockStripe.subscriptionsCancel.mockResolvedValue({ id: "sub_stale_claim", status: "canceled" });

    const res = await request(app)
      .post("/api/admin/rentals/20/cancel-subscription")
      .set("Authorization", "Bearer fake-token")
      .send({ confirm: "CANCEL SUBSCRIPTION", cancelAtPeriodEnd: false });

    expect(res.status).toBe(200);
    expect(mockState.stripe_cancellation_operations[0].attempt_count).toBe(2);
    expect(mockStripe.subscriptionsCancel).toHaveBeenCalledTimes(1);
  });

  it("POST /api/admin/rentals/:id/cancel-subscription keeps confirmed Stripe state reconcilable when the completion audit fails", async () => {
    mockState.rentals = [{
      id: 20,
      application_id: APPROVED_APPLICATION_ID,
      status: "Active",
      stripe_subscription_id: "sub_audit_failure",
    }];
    mockState.failOnAuditAction = "stripe_cancellation_completed";
    mockStripe.subscriptionsRetrieve.mockResolvedValue({ id: "sub_audit_failure", status: "active" });
    mockStripe.subscriptionsCancel.mockResolvedValue({ id: "sub_audit_failure", status: "canceled" });

    const res = await request(app)
      .post("/api/admin/rentals/20/cancel-subscription")
      .set("Authorization", "Bearer fake-token")
      .send({ confirm: "CANCEL SUBSCRIPTION", cancelAtPeriodEnd: false });

    expect(res.status).toBe(202);
    expect(mockStripe.subscriptionsCancel).toHaveBeenCalledTimes(1);
    expect(mockState.stripe_cancellation_operations[0]).toMatchObject({
      status: "reconciliation_pending",
      stripe_completed_at: expect.any(String),
    });
    expect(mockState.stripe_cancellation_operations[0].status).not.toBe("failed");
  });

  it("POST /api/admin/rentals/cancellation-operations/:operationId/reconcile verifies Stripe and saves the period-end effective date", async () => {
    const operationId = "88888888-8888-4888-8888-888888888888";
    mockState.rentals = [{
      id: 20,
      application_id: APPROVED_APPLICATION_ID,
      status: "Active",
      stripe_subscription_id: "sub_period_reconcile",
    }];
    mockState.stripe_cancellation_operations = [{
      id: operationId,
      operation_type: "rental",
      rental_id: 20,
      requested_mode: "period_end",
      stripe_subscription_id: "sub_period_reconcile",
      status: "reconciliation_pending",
    }];
    mockStripe.subscriptionsRetrieve.mockResolvedValue({
      id: "sub_period_reconcile",
      status: "active",
      cancel_at_period_end: true,
      current_period_end: Math.floor(new Date("2026-04-15T00:00:00Z").getTime() / 1000),
    });

    const res = await request(app)
      .post(`/api/admin/rentals/cancellation-operations/${operationId}/reconcile`)
      .set("Authorization", "Bearer fake-token")
      .send({});

    expect(res.status).toBe(200);
    expect(mockStripe.subscriptionsRetrieve).toHaveBeenCalledWith("sub_period_reconcile");
    expect(mockState.rentals[0]).toMatchObject({ status: "Active", end_date: "2026-04-15" });
    expect(mockState.stripe_cancellation_operations[0].status).toBe("completed");
  });

  it("POST /api/admin/rentals/cancellation-operations/:operationId/reconcile rejects a stale application payment-link version before Stripe access", async () => {
    const operationId = "99999999-9999-4999-8999-999999999998";
    mockState.applications[0].payment_link_version = 4;
    mockState.stripe_cancellation_operations = [{
      id: operationId,
      operation_type: "application",
      application_id: PENDING_APPLICATION_ID,
      expected_payment_link_version: 3,
      requested_mode: "immediate",
      status: "stripe_completed",
    }];

    const res = await request(app)
      .post(`/api/admin/rentals/cancellation-operations/${operationId}/reconcile`)
      .set("Authorization", "Bearer fake-token")
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("payment version changed");
    expect(mockStripe.subscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it("POST /api/admin/rentals/cancellation-operations/:operationId/reconcile rejects a changed rental subscription relationship after verifying Stripe", async () => {
    const operationId = "99999999-9999-4999-8999-999999999997";
    mockState.rentals = [{
      id: 20,
      application_id: APPROVED_APPLICATION_ID,
      status: "Active",
      stripe_subscription_id: "sub_replaced",
    }];
    mockState.stripe_cancellation_operations = [{
      id: operationId,
      operation_type: "rental",
      rental_id: 20,
      requested_mode: "immediate",
      stripe_subscription_id: "sub_original",
      status: "stripe_completed",
    }];
    mockStripe.subscriptionsRetrieve.mockResolvedValue({ id: "sub_original", status: "canceled" });

    const res = await request(app)
      .post(`/api/admin/rentals/cancellation-operations/${operationId}/reconcile`)
      .set("Authorization", "Bearer fake-token")
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("subscription relationship changed");
    expect(mockStripe.subscriptionsRetrieve).toHaveBeenCalledWith("sub_original");
    expect(mockState.rentals[0].status).toBe("Active");
  });

  it("POST /api/admin/maintenance/reset-imported-data/dry-run rejects missing confirmation", async () => {
    const res = await request(app)
      .post("/api/admin/maintenance/reset-imported-data/dry-run")
      .set("Authorization", "Bearer fake-token")
      .send({ confirm: "wrong" });

    expect(res.status).toBe(400);
  });

  it("GET /api/admin/maintenance/imported-data-reset/dry-run reports imported rows without a confirmation phrase", async () => {
    mockState.applications[0].legacy_id = 101;
    mockState.applications[0].email = "legacy-cno40s@example.invalid";
    mockState.applications[0].phone = "0000000000";
    mockState.applications[0].license_number = "LEGACY-CNO40S";
    mockState.applications[0].experience = "Imported from live fleet data on 2026-05-17.";
    mockState.rentals = [
      {
        id: 20,
        application_id: PENDING_APPLICATION_ID,
        car_id: 1,
        status: "Active",
        start_date: "2026-05-17",
        weekly_price: 250,
        legacy_application_id: 101,
        stripe_subscription_id: null,
      },
    ];
    const beforeApplications = structuredClone(mockState.applications);
    const beforeRentals = structuredClone(mockState.rentals);

    const res = await request(app)
      .get("/api/admin/maintenance/imported-data-reset/dry-run")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.resetEnabled).toBe(false);
    expect(res.body.counts.applications).toBeGreaterThan(0);
    expect(res.body.counts.rentals).toBeGreaterThan(0);
    expect(mockState.applications).toEqual(beforeApplications);
    expect(mockState.rentals).toEqual(beforeRentals);
  });

  it("GET /api/admin/maintenance/imported-data-reset/export still works while reset is disabled", async () => {
    const res = await request(app)
      .get("/api/admin/maintenance/imported-data-reset/export")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.resetEnabled).toBe(false);
    expect(res.body.confirm).toBe("RESET IMPORTED DATA AND FINANCIALS");
    expect(res.body.rows).toBeTruthy();
  });

  it("POST /api/admin/maintenance/imported-data-reset rejects destructive reset when the feature flag is absent", async () => {
    const res = await request(app)
      .post("/api/admin/maintenance/imported-data-reset")
      .set("Authorization", "Bearer fake-token")
      .send({ confirm: "RESET IMPORTED DATA AND FINANCIALS" });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: "MAINTENANCE_RESET_DISABLED",
      resetEnabled: false,
    });
  });

  it("POST /api/admin/maintenance/imported-data-reset rejects destructive reset when the feature flag is false", async () => {
    process.env.MAPLE_ENABLE_IMPORTED_DATA_RESET = "false";

    const res = await request(app)
      .post("/api/admin/maintenance/imported-data-reset")
      .set("Authorization", "Bearer fake-token")
      .send({ confirm: "RESET IMPORTED DATA AND FINANCIALS" });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: "MAINTENANCE_RESET_DISABLED",
      resetEnabled: false,
    });
  });

  it("POST /api/admin/maintenance/imported-data-reset requires the exact confirmation phrase", async () => {
    process.env.MAPLE_ENABLE_IMPORTED_DATA_RESET = "true";

    const res = await request(app)
      .post("/api/admin/maintenance/imported-data-reset")
      .set("Authorization", "Bearer fake-token")
      .send({ confirm: "RESET IMPORTED DATA" });

    expect(res.status).toBe(400);
  });

  it("POST /api/admin/maintenance/imported-data-reset requires a signed dry-run token", async () => {
    process.env.MAPLE_ENABLE_IMPORTED_DATA_RESET = "true";

    const res = await request(app)
      .post("/api/admin/maintenance/imported-data-reset")
      .set("Authorization", "Bearer fake-token")
      .send({ confirm: "RESET IMPORTED DATA AND FINANCIALS" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/dry-run token/i);
  });

  it("GET /api/admin/maintenance/imported-data-reset/dry-run rejects non-admin users", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { email: "driver@example.com" } },
      error: null,
    });

    const res = await request(app)
      .get("/api/admin/maintenance/imported-data-reset/dry-run")
      .set("Authorization", "Bearer fake-token");

    expect([401, 403]).toContain(res.status);
  });

  it("POST /api/admin/maintenance/reset-imported-data/dry-run reports imported rows without mutating data", async () => {
    mockState.applications[0].legacy_id = 101;
    mockState.rentals = [
      {
        id: 20,
        application_id: PENDING_APPLICATION_ID,
        car_id: 1,
        status: "Active",
        start_date: "2026-03-01",
        weekly_price: 250,
        legacy_application_id: 101,
        stripe_subscription_id: null,
      },
    ];
    const beforeApplications = structuredClone(mockState.applications);
    const beforeRentals = structuredClone(mockState.rentals);
    const beforeCustomers = structuredClone(mockState.customers);
    const beforeInvoices = structuredClone(mockState.invoices);
    const beforeManualInvoices = structuredClone(mockState.manual_invoices);
    const beforeManualInvoiceItems = structuredClone(mockState.manual_invoice_items);

    const res = await request(app)
      .post("/api/admin/maintenance/reset-imported-data/dry-run")
      .set("Authorization", "Bearer fake-token")
      .send({ confirm: "RESET IMPORTED DATA AND FINANCIALS" });

    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.counts.applications).toBeGreaterThan(0);
    expect(res.body.counts.rentals).toBeGreaterThan(0);
    expect(res.body.counts.customers).toBeGreaterThan(0);
    expect(mockState.applications).toEqual(beforeApplications);
    expect(mockState.rentals).toEqual(beforeRentals);
    expect(mockState.customers).toEqual(beforeCustomers);
    expect(mockState.invoices).toEqual(beforeInvoices);
    expect(mockState.manual_invoices).toEqual(beforeManualInvoices);
    expect(mockState.manual_invoice_items).toEqual(beforeManualInvoiceItems);
  });

  it("POST /api/admin/maintenance/reset-imported-data deletes imported rows and preserves live rentals", async () => {
    process.env.MAPLE_ENABLE_IMPORTED_DATA_RESET = "true";

    mockState.applications[0].legacy_id = 101;
    mockState.applications = [
      {
        ...mockState.applications[0],
        legacy_id: 101,
        id: APPROVED_APPLICATION_ID,
      },
      {
        ...mockState.applications[1],
        legacy_id: null,
        id: BLOCKING_APPLICATION_ID,
      },
    ];
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        status: "Active",
        start_date: "2026-03-01",
        weekly_price: 250,
        legacy_application_id: 101,
        stripe_subscription_id: null,
      },
      {
        id: 21,
        application_id: BLOCKING_APPLICATION_ID,
        car_id: 2,
        status: "Active",
        start_date: "2026-03-02",
        weekly_price: 260,
        legacy_application_id: null,
        stripe_subscription_id: "sub_live",
      },
    ];
    mockState.customers = [
      { id: 1, full_name: "Legacy Customer", source: "legacy-import" },
      { id: 2, full_name: "Live Customer", source: "current" },
    ];
    mockState.invoices = [
      { id: 1, customer_id: 1, source: "legacy-import" },
      { id: 2, customer_id: 2, source: "current" },
    ];
    mockState.manual_invoices = [
      { id: "m1", notes: "Legacy import invoice" },
      { id: "m2", bill_to_email: "driver@example.invalid" },
    ];
    mockState.manual_invoice_items = [{ id: "i1", invoice_id: "m1" }];
    mockState.failOnDeleteTable = null;

    const dryRun = await request(app)
      .get("/api/admin/maintenance/imported-data-reset/dry-run")
      .set("Authorization", "Bearer fake-token");

    const res = await request(app)
      .post("/api/admin/maintenance/reset-imported-data")
      .set("Authorization", "Bearer fake-token")
      .send({
        confirm: "RESET IMPORTED DATA AND FINANCIALS",
        dryRunToken: dryRun.body.dryRunToken,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockState.applications).toHaveLength(1);
    expect(mockState.applications[0].id).toBe(BLOCKING_APPLICATION_ID);
    expect(mockState.rentals).toHaveLength(1);
    expect(mockState.rentals[0].id).toBe(21);
    expect(mockState.customers).toHaveLength(1);
    expect(mockState.customers[0].id).toBe(2);
    expect(mockState.invoices).toHaveLength(1);
    expect(mockState.invoices[0].id).toBe(2);
    expect(mockState.manual_invoices).toHaveLength(0);
    expect(mockState.manual_invoice_items).toHaveLength(0);
    expect(mockState.cars[0].status).toBe("Available");
  });

  it("POST /api/admin/maintenance/reset-imported-data returns a safe invoice failure payload", async () => {
    process.env.MAPLE_ENABLE_IMPORTED_DATA_RESET = "true";

    mockState.applications[0].legacy_id = 101;
    mockState.failOnDeleteTable = "invoices";

    const dryRun = await request(app)
      .get("/api/admin/maintenance/imported-data-reset/dry-run")
      .set("Authorization", "Bearer fake-token");

    const res = await request(app)
      .post("/api/admin/maintenance/reset-imported-data")
      .set("Authorization", "Bearer fake-token")
      .send({
        confirm: "RESET IMPORTED DATA AND FINANCIALS",
        dryRunToken: dryRun.body.dryRunToken,
      });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      error: "Failed to reset imported data",
      step: "delete_invoices",
      table: "invoices",
      message: "Reset failed while deleting invoices rows.",
      hint: "Check invoice child tables or foreign key constraints.",
    });
  });

  it("POST /api/admin/manual-invoices creates a manual invoice with calculated totals", async () => {
    const res = await request(app)
      .post("/api/admin/manual-invoices")
      .set("Authorization", "Bearer fake-token")
      .send({
        invoice_number: "MR-INV-TEST-0001",
        status: "issued",
        issue_date: "2026-05-14",
        due_date: "2026-05-21",
        bill_to_name: "Approved Driver",
        bill_to_abn_mobile: "0499999999",
        vehicle_reference: "Toyota Camry / CZ55XY / Rental 20",
        rental_period_reference: "14 May 2026 - 21 May 2026",
        notes: "Payment due by due date.",
        additional_details: "Manual bond tracking only.",
        items: [
          {
            description: "Weekly rental subscription",
            quantity: 1,
            unit_price: 250,
            gst: 25,
          },
          {
            description: "Manual bond",
            quantity: 1,
            unit_price: 500,
            gst: 0,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.invoice_number).toBe("MR-INV-TEST-0001");
    expect(res.body.subtotal).toBe(750);
    expect(res.body.gst).toBe(25);
    expect(res.body.total_inc_gst).toBe(775);
    expect(mockState.manual_invoice_items).toHaveLength(2);
  });

  it("POST /api/admin/manual-invoices rejects invalid invoice data", async () => {
    const res = await request(app)
      .post("/api/admin/manual-invoices")
      .set("Authorization", "Bearer fake-token")
      .send({
        bill_to_name: "",
        issue_date: "not-a-date",
        items: [],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("POST /api/admin/manual-invoices rejects duplicate invoice numbers", async () => {
    mockState.manual_invoices = [
      {
        id: "invoice-1",
        invoice_number: "MR-INV-DUP",
        status: "draft",
        issue_date: "2026-05-14",
        bill_to_name: "Existing Driver",
        subtotal: 10,
        gst: 1,
        total_inc_gst: 11,
      },
    ];

    const res = await request(app)
      .post("/api/admin/manual-invoices")
      .set("Authorization", "Bearer fake-token")
      .send({
        invoice_number: "MR-INV-DUP",
        status: "draft",
        issue_date: "2026-05-14",
        bill_to_name: "Approved Driver",
        items: [{ description: "Weekly rental", quantity: 1, unit_price: 250, gst: 25 }],
      });

    expect(res.status).toBe(409);
  });

  it("GET /api/admin/manual-invoices/:id/pdf returns a Maple Rentals PDF", async () => {
    mockState.manual_invoices = [
      {
        id: "invoice-1",
        invoice_number: "MR-INV-PDF",
        status: "issued",
        issue_date: "2026-05-14",
        due_date: "2026-05-21",
        bill_to_name: "Approved Driver",
        bill_to_abn_mobile: "0499999999",
        vehicle_reference: "Toyota Camry",
        rental_period_reference: "14 May - 21 May",
        notes: "Thanks",
        additional_details: "Manual invoice",
        subtotal: 250,
        gst: 25,
        total_inc_gst: 275,
      },
    ];
    mockState.manual_invoice_items = [
      {
        id: "item-1",
        invoice_id: "invoice-1",
        description: "Weekly rental subscription",
        quantity: 1,
        unit_price: 250,
        gst: 25,
        amount: 275,
        sort_order: 0,
      },
    ];

    const res = await request(app)
      .get("/api/admin/manual-invoices/invoice-1/pdf")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain(
      "maple-rentals-invoice-MR-INV-PDF.pdf",
    );
    expect(res.text || res.body.toString("latin1")).toContain("MAPLE RENTALS");
    expect(res.text || res.body.toString("latin1")).toContain("062202");
  });
});

describe("Toll Transfer Notices API", () => {
  const validTollNoticePayload = () => ({
    application_id: APPROVED_APPLICATION_ID,
    authorised_officer_name: "Saffaraz Rajabi",
    car_id: 1,
    customer_id: 1,
    declaration_date: "2026-04-30",
    declaration_place: "Merrylands NSW",
    nominee_address: "10 Driver Street",
    nominee_country: "AUSTRALIA",
    nominee_dob: "1999-09-24",
    nominee_full_name: "Approved Driver",
    nominee_phone: "0499999999",
    nominee_postcode: "2160",
    nominee_state: "NSW",
    nominee_suburb: "MERRYLANDS",
    rental_id: 20,
    responsible_type: "responsible",
    toll_notice_number: "TN123456789",
    toll_trip_date: "2026-04-29",
    vehicle_registration: "CZ55XY",
    witness_jp_number: "123456",
    witness_name: "Witness Person",
    witness_qualification: "Justice of the Peace",
  });

  it("GET /api/toll-notices is admin protected", async () => {
    const res = await request(app).get("/api/toll-notices");

    expect(res.status).toBe(401);
  });

  it("GET /api/toll-notices/rental-options prefills customer and vehicle details", async () => {
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        vehicle_registration: "CZ55XY",
        status: "Active",
        start_date: "2026-03-01",
        weekly_price: 250,
      },
    ];
    mockState.customers[0] = {
      ...mockState.customers[0],
      city: "Merrylands",
      date_of_birth: "1999-09-24",
      email: "approved@example.com",
      full_name: "Approved Driver",
      phone: "0499999999",
      postcode: "2160",
      source: "current",
      state: "NSW",
      street: "10 Driver Street",
    };

    const res = await request(app)
      .get("/api/toll-notices/rental-options?search=CZ55XY")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      application_id: APPROVED_APPLICATION_ID,
      customer_id: 1,
      nominee_dob: "1999-09-24",
      nominee_full_name: "Approved Driver",
      nominee_phone: "0499999999",
      vehicle_registration: "CZ55XY",
    });
    expect(getQueryTables()).toEqual(expect.arrayContaining(["applications", "rentals", "customers"]));
    expect(mockState.queryLog.length).toBeLessThanOrEqual(3);
    expectNoImportedApplicationPreload();
    expectNoDuplicateRentalRehydration();
    const customerQuery = mockState.queryLog.find((query) => query.table === "customers");
    expect(customerQuery?.filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "or",
        }),
      ]),
    );
    expect(customerQuery?.range).toEqual({ from: 0, to: 149 });
  });

  it("GET /api/toll-notices/rental-options keeps empty searches bounded", async () => {
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        created_at: "2026-03-07T00:00:00.000Z",
        status: "Active",
        vehicle_registration: "CZ55XY",
      },
    ];
    mockState.customers[0] = {
      ...mockState.customers[0],
      email: "approved@example.com",
      full_name: "Approved Driver",
      phone: "0499999999",
      source: "current",
    };

    const res = await request(app)
      .get("/api/toll-notices/rental-options?search=")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(getQueryTables()).toEqual(expect.arrayContaining(["rentals", "customers"]));
    expect(mockState.queryLog.length).toBeLessThanOrEqual(3);
    expectNoImportedApplicationPreload();
    expectNoDuplicateRentalRehydration();
    expectNoUnfilteredCustomerLookup();
  });

  it("GET /api/toll-notices/rental-options includes valid rentals with null optional import marker fields", async () => {
    const nullableApplicationId = "00000000-0000-4000-8000-000000002234";
    mockState.applications = [
      ...mockState.applications,
      {
        ...mockState.applications[1],
        id: nullableApplicationId,
        approved_vehicle: "NULL-TOLL-REG",
        email: null,
        experience: null,
        legacy_id: null,
        license_number: null,
        name: "Nullable Toll Driver",
        phone: null,
        status: "Paid",
      },
    ];
    mockState.rentals = [
      {
        id: 24,
        application_id: nullableApplicationId,
        created_at: "2026-03-09T00:00:00.000Z",
        status: "Active",
        vehicle_registration: "NULL-TOLL-REG",
      },
    ];

    const res = await request(app)
      .get("/api/toll-notices/rental-options?search=NULL-TOLL")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      application_id: nullableApplicationId,
      vehicle_registration: "NULL-TOLL-REG",
    });
    expectNoImportedApplicationPreload();
    expectNoUnfilteredCustomerLookup();
  });

  it("GET /api/toll-notices/rental-options uses valid rentals after imported rows", async () => {
    const importedApplications = Array.from({ length: 4 }, (_, index) => ({
      id: `00000000-0000-4000-8000-0000000007${index}`,
      approved_vehicle: `Imported Toll Vehicle ${index}`,
      created_at: `2026-03-0${index + 1}T00:00:00.000Z`,
      email: `legacy-toll-${index}@example.invalid`,
      experience: "Imported from live fleet data",
      license_number: `legacy-toll-${index}`,
      name: `Legacy Toll Driver ${index}`,
      phone: "0000000000",
      status: "Paid",
    }));
    const validApplications = Array.from({ length: 2 }, (_, index) => ({
      id: `00000000-0000-4000-8000-0000000006${index}`,
      approved_vehicle: `Valid Toll Vehicle ${index}`,
      address: `${10 + index} Toll Street Merrylands NSW 2160`,
      created_at: `2026-03-${10 + index}T00:00:00.000Z`,
      email: `valid-toll-${index}@example.com`,
      experience: "1-3 years",
      license_number: `NSW6000${index}`,
      name: `Valid Toll Driver ${index}`,
      phone: `047777770${index}`,
      status: "Paid",
    }));
    mockState.applications = [
      ...mockState.applications,
      ...importedApplications,
      ...validApplications,
    ];
    mockState.rentals = [
      ...importedApplications.map((application, index) => ({
        id: 900 + index,
        application_id: application.id,
        created_at: new Date(Date.UTC(2026, 2, 20 - index)).toISOString(),
        status: "Active",
        vehicle_registration: `TOLL-IMPORTED-${index}`,
      })),
      ...validApplications.map((application, index) => ({
        id: 950 + index,
        application_id: application.id,
        created_at: new Date(Date.UTC(2026, 2, 10 - index)).toISOString(),
        status: "Active",
        vehicle_registration: `TOLL-VALID-${index}`,
      })),
    ];

    const res = await request(app)
      .get("/api/toll-notices/rental-options?search=")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.items.map((item: Record<string, any>) => item.vehicle_registration)).toEqual([
      "TOLL-VALID-0",
      "TOLL-VALID-1",
    ]);
  });

  it("GET /api/toll-notices/rental-options prefers email and phone over duplicate customer names", async () => {
    mockState.applications[1] = {
      ...mockState.applications[1],
      email: "correct-driver@example.com",
      name: "Duplicate Driver",
      phone: "0411111111",
    };
    mockState.customers = [
      {
        id: 10,
        city: "Wrongtown",
        date_of_birth: "1980-01-01",
        email: "wrong-driver@example.com",
        full_name: "Duplicate Driver",
        phone: "0499999999",
        postcode: "2000",
        source: "current",
        state: "NSW",
        street: "1 Wrong Street",
      },
      {
        id: 11,
        city: "Merrylands",
        date_of_birth: "1999-09-24",
        email: "correct-driver@example.com",
        full_name: "Duplicate Driver",
        phone: "0411111111",
        postcode: "2160",
        source: "current",
        state: "NSW",
        street: "10 Correct Street",
      },
    ];
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        created_at: "2026-03-07T00:00:00.000Z",
        status: "Active",
        vehicle_registration: "DUP-NAME",
      },
    ];

    const res = await request(app)
      .get("/api/toll-notices/rental-options?search=DUP-NAME")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      customer_id: 11,
      nominee_address: "10 Correct Street",
      nominee_phone: "0411111111",
      vehicle_registration: "DUP-NAME",
    });
  });

  it("GET /api/toll-notices/rental-options can find older rentals beyond the previous capped lookup", async () => {
    mockState.customers[0] = {
      ...mockState.customers[0],
      city: "Merrylands",
      date_of_birth: "1999-09-24",
      email: "approved@example.com",
      full_name: "Approved Driver",
      phone: "0499999999",
      postcode: "2160",
      source: "current",
      state: "NSW",
      street: "10 Driver Street",
    };
    mockState.rentals = Array.from({ length: 120 }, (_, index) => ({
      application_id: APPROVED_APPLICATION_ID,
      created_at: new Date(Date.UTC(2026, 2, 1 - index)).toISOString(),
      id: 500 + index,
      status: "Active",
      vehicle_registration: index === 0 ? "OLD-TOLL-SEARCH" : `NOISE-${index}`,
    }));

    const res = await request(app)
      .get("/api/toll-notices/rental-options?search=OLD-TOLL-SEARCH")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      application_id: APPROVED_APPLICATION_ID,
      nominee_full_name: "Approved Driver",
      vehicle_registration: "OLD-TOLL-SEARCH",
    });
    expect(getQueryTables()).toEqual(expect.arrayContaining(["applications", "rentals", "customers"]));
    expect(mockState.queryLog.length).toBeLessThanOrEqual(3);
    expectNoImportedApplicationPreload();
    expectNoDuplicateRentalRehydration();
    expectNoUnfilteredCustomerLookup();
  });

  it("POST /api/toll-notices rejects missing required fields", async () => {
    const res = await request(app)
      .post("/api/toll-notices")
      .set("Authorization", "Bearer fake-token")
      .send({
        ...validTollNoticePayload(),
        nominee_full_name: "",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("POST /api/toll-notices accepts manually entered date values", async () => {
    const res = await request(app)
      .post("/api/toll-notices")
      .set("Authorization", "Bearer fake-token")
      .send({
        ...validTollNoticePayload(),
        declaration_date: "30/04/2026",
        nominee_dob: "24/09/1999",
        responsible_type: "new-owner",
        toll_trip_date: "29/04/2026",
      });

    expect(res.status).toBe(201);
    expect(mockState.toll_transfer_notices[0]).toMatchObject({
      declaration_date: "2026-04-30",
      nominee_dob: "1999-09-24",
      responsible_type: "new-owner",
      toll_trip_date: "2026-04-29",
    });
  });

  it("POST /api/toll-notices allows blank toll number and date fields", async () => {
    const res = await request(app)
      .post("/api/toll-notices")
      .set("Authorization", "Bearer fake-token")
      .send({
        ...validTollNoticePayload(),
        declaration_date: "",
        responsible_type: "previous-owner",
        toll_notice_number: "",
        toll_trip_date: "",
      });

    expect(res.status).toBe(201);
    expect(mockState.toll_transfer_notices[0]).toMatchObject({
      declaration_date: null,
      responsible_type: "previous-owner",
      toll_notice_number: null,
      toll_trip_date: null,
    });
  });

  it("POST /api/toll-notices saves generated records and audit events", async () => {
    const res = await request(app)
      .post("/api/toll-notices")
      .set("Authorization", "Bearer fake-token")
      .send(validTollNoticePayload());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 1,
      pdf_url: "/api/toll-notices/1/pdf",
      status: "generated",
    });
    expect(mockState.toll_transfer_notices).toHaveLength(1);
    expect(mockState.toll_transfer_notices[0]).toMatchObject({
      application_id: APPROVED_APPLICATION_ID,
      nominee_full_name: "Approved Driver",
      pdf_url: "/api/toll-notices/1/pdf",
      toll_notice_number: "TN123456789",
      vehicle_registration: "CZ55XY",
    });
    expect(mockState.toll_transfer_notice_audit_events[0]).toMatchObject({
      action: "generate",
      toll_transfer_notice_id: 1,
    });
  });

  it("GET /api/toll-notices/:id/pdf returns a PDF for the saved toll notice", async () => {
    await request(app)
      .post("/api/toll-notices")
      .set("Authorization", "Bearer fake-token")
      .send(validTollNoticePayload());

    const res = await request(app)
      .get("/api/toll-notices/1/pdf")
      .set("Authorization", "Bearer fake-token")
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(1000);
    expect(mockState.toll_transfer_notice_audit_events.at(-1)).toMatchObject({
      action: "download",
      toll_transfer_notice_id: 1,
    });
  });

  it("PATCH /api/toll-notices/:id/status marks a notice as sent", async () => {
    await request(app)
      .post("/api/toll-notices")
      .set("Authorization", "Bearer fake-token")
      .send(validTollNoticePayload());

    const res = await request(app)
      .patch("/api/toll-notices/1/status")
      .set("Authorization", "Bearer fake-token")
      .send({ status: "sent" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, status: "sent" });
    expect(mockState.toll_transfer_notices[0].status).toBe("sent");
    expect(mockState.toll_transfer_notice_audit_events.at(-1)).toMatchObject({
      action: "send",
      toll_transfer_notice_id: 1,
    });
  });

  it("POST /api/toll-notices/:id/send emails the generated PDF and persists send metadata", async () => {
    process.env.RESEND_API_KEY = "test-resend";
    mockResendEmailsSend.mockClear();

    await request(app)
      .post("/api/toll-notices")
      .set("Authorization", "Bearer fake-token")
      .send(validTollNoticePayload());

    const res = await request(app)
      .post("/api/toll-notices/1/send")
      .set("Authorization", "Bearer fake-token")
      .send({ recipient_email: "tolls@example.invalid" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 1,
      sent_to: "tolls@example.invalid",
      status: "sent",
    });
    expect(mockResendEmailsSend).toHaveBeenCalledTimes(1);
    expect(mockResendEmailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            content: expect.any(Buffer),
            filename: "toll-transfer-notice-1.pdf",
          }),
        ],
        to: "tolls@example.invalid",
      }),
      {
        idempotencyKey: expect.stringMatching(/^toll-notice-/),
      },
    );
    expect(mockState.toll_transfer_notices[0]).toMatchObject({
      sent_to: "tolls@example.invalid",
      status: "sent",
    });
    expect(mockState.toll_transfer_notice_audit_events.at(-1)).toMatchObject({
      action: "send_email",
      toll_transfer_notice_id: 1,
    });
  });
});

describe("Stripe API", () => {
  it("POST /api/applications/:id/approve-payment requires admin auth", async () => {
    const res = await request(app)
      .post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`)
      .send({
        approved_vehicle: "Toyota Camry",
      approved_bond: 650,
      bond_notes: "Existing cash receipt recorded by admin",
      bond_payment_method: "existing_paid",
      bond_payment_status: "already_paid",
      approved_weekly_price: 285,
        car_id: 1,
      });

    expect(res.status).toBe(401);
  });

  it("POST /api/applications/:id/approve-payment stores the approved quote and returns a secure payment link", async () => {
    mockState.applications[0].pending_checkout_session_id = "cs_old_pending";
    mockState.applications[0].payment_link_version = 3;
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: "cs_old_pending",
      status: "open",
      metadata: {
        application_id: PENDING_APPLICATION_ID,
        checkout_kind: "vehicle",
        payment_link_version: "3",
      },
    });

    const res = await request(app)
      .post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`)
      .set("Authorization", "Bearer fake-token")
      .send({
        approved_vehicle: "Toyota Camry Hybrid",
        approved_bond: 650,
        bond_notes: "Existing cash receipt recorded by admin",
        bond_payment_method: "existing_paid",
        bond_payment_status: "already_paid",
        approved_weekly_price: 285,
        rental_subscription_start_date: getFutureDateOnly(5),
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.email_delivered).toBe(false);
    expect(res.body.checkout_url).toContain(`/checkout/${PENDING_APPLICATION_ID}`);
    expect(res.body.checkout_url).toContain("#checkout_token=");
    expect(mockStripe.checkoutSessionsExpire).toHaveBeenCalledWith(
      "cs_old_pending",
    );

    expect(mockState.applications[0]).toMatchObject({
      approved_bond: 650,
      bond_notes: "Existing cash receipt recorded by admin",
      bond_payment_method: "existing_paid",
      bond_payment_status: "already_paid",
      approved_vehicle: "Toyota Camry Hybrid",
      approved_weekly_price: 285,
      intended_start_date: getFutureDateOnly(5),
      payment_link_version: 4,
      pending_checkout_session_id: null,
      status: "Approved",
    });

    expect(mockState.lease_agreements).toHaveLength(0);
    expect(res.body.lease_agreement_saved).toBe(false);

    const verified = verifyCheckoutToken({
      applicationId: PENDING_APPLICATION_ID,
      purpose: "vehicle",
      token: res.body.checkout_token,
      version: 4,
    });
    expect(verified.version).toBe(4);
    expect(verified.carId).toBeNull();
    expect(mockState.applications[0].assigned_car_id).toBeNull();
  });

  it("POST /api/applications/:id/approve-payment refuses to replace a completed pending checkout session", async () => {
    mockState.applications[0].pending_checkout_session_id =
      "cs_completed_pending";
    mockState.applications[0].payment_link_version = 3;
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: "cs_completed_pending",
      status: "complete",
      subscription: "sub_scheduled",
      metadata: {
        application_id: PENDING_APPLICATION_ID,
        checkout_kind: "vehicle",
        payment_link_version: "3",
      },
    });

    const res = await request(app)
      .post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`)
      .set("Authorization", "Bearer fake-token")
      .send({
        approved_vehicle: "Toyota Camry Hybrid",
        approved_bond: 650,
        approved_weekly_price: 285,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("must be reconciled");
    expect(mockStripe.checkoutSessionsRetrieve).toHaveBeenCalledWith(
      "cs_completed_pending",
    );
    expect(mockStripe.checkoutSessionsExpire).not.toHaveBeenCalled();
    expect(mockState.applications[0]).toMatchObject({
      payment_link_version: 3,
      pending_checkout_session_id: "cs_completed_pending",
      status: "Pending",
    });
  });

  it("POST /api/applications/:id/approve-payment fails closed when the old session cannot be expired", async () => {
    mockState.applications[0].pending_checkout_session_id = "cs_open_pending";
    mockState.applications[0].payment_link_version = 3;
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: "cs_open_pending",
      status: "open",
      metadata: {
        application_id: PENDING_APPLICATION_ID,
        checkout_kind: "vehicle",
        payment_link_version: "3",
      },
    });
    mockStripe.checkoutSessionsExpire.mockRejectedValueOnce(
      new Error("Stripe unavailable"),
    );

    const res = await request(app)
      .post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`)
      .set("Authorization", "Bearer fake-token")
      .send({
        approved_vehicle: "Toyota Camry Hybrid",
        approved_bond: 650,
        approved_weekly_price: 285,
      });

    expect(res.status).toBe(500);
    expect(mockState.applications[0]).toMatchObject({
      payment_link_version: 3,
      pending_checkout_session_id: "cs_open_pending",
      status: "Pending",
    });
  });

  it("POST /api/applications/:id/approve-payment still sends a payment link without direct DB access", async () => {
    mockHasDirectDatabaseConnection.mockReturnValue(false);

    const res = await request(app)
      .post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`)
      .set("Authorization", "Bearer fake-token")
      .send({
        approved_vehicle: "Toyota Camry",
        approved_bond: 650,
        approved_weekly_price: 285,
        send_payment_link: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockState.applications[0].status).toBe("Approved");
    expect(mockState.lease_agreements).toHaveLength(0);
  });

  it("POST /api/applications/:id/approve-payment escapes applicant-controlled HTML in payment emails", async () => {
    process.env.RESEND_API_KEY = "test-resend";
    mockResendEmailsSend.mockClear();
    mockState.applications[0].name = "<img src=x onerror=alert(1)>";

    const res = await request(app)
      .post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`)
      .set("Authorization", "Bearer fake-token")
      .send({
        approved_vehicle: '<a href="https://evil.example">Camry</a>',
        approved_bond: 650,
        approved_weekly_price: 285,
        send_payment_link: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.email_delivered).toBe(true);
    expect(mockResendEmailsSend).toHaveBeenCalledTimes(1);
    expect(mockResendEmailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("&lt;img src=x onerror=alert(1)&gt;"),
      }),
    );
    expect(mockResendEmailsSend.mock.calls[0]?.[0]?.html).toContain(
      "&lt;a href=&quot;https://evil.example&quot;&gt;Camry&lt;/a&gt;",
    );
    expect(mockResendEmailsSend.mock.calls[0]?.[0]?.html).not.toContain(
      '<a href="https://evil.example">Camry</a>',
    );
  });

  it("POST /api/applications/:id/approve-payment reports delivery failure when Resend returns an error payload", async () => {
    process.env.RESEND_API_KEY = "test-resend";
    mockResendEmailsSend.mockResolvedValueOnce({
      data: null,
      error: { message: "Provider rejected request" },
      headers: null,
    });

    const res = await request(app)
      .post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`)
      .set("Authorization", "Bearer fake-token")
      .send({
        approved_vehicle: "Toyota Camry",
        approved_bond: 650,
        approved_weekly_price: 285,
        send_payment_link: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.email_delivered).toBe(false);
    expect(res.body.email_reason).toContain("Provider rejected request");
  });

  it("POST /api/applications/:id/approve-payment accepts an arbitrary approved vehicle without a car id", async () => {
    const res = await request(app)
      .post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`)
      .set("Authorization", "Bearer fake-token")
      .send({
        approved_vehicle: "Any admin approved vehicle",
        approved_bond: 650,
        approved_weekly_price: 285,
      });

    expect(res.status).toBe(200);
    expect(mockState.applications[0]).toMatchObject({
      assigned_car_id: null,
      approved_vehicle: "Any admin approved vehicle",
      status: "Approved",
    });

    const verified = verifyCheckoutToken({
      applicationId: PENDING_APPLICATION_ID,
      purpose: "vehicle",
      token: res.body.checkout_token,
      version: 1,
    });
    expect(verified.carId).toBeNull();
  });

  it("POST /api/applications/:id/approve-payment does not let Payment Review cases send a new payment link", async () => {
    mockState.applications[0].status = "Payment Review";

    const res = await request(app)
      .post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`)
      .set("Authorization", "Bearer fake-token")
      .send({
        approved_vehicle: "Toyota Camry",
        approved_bond: 650,
        approved_weekly_price: 285,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("awaiting onboarding follow-up");
  });

  it("POST /api/applications/:id/approve-payment rejects stale approvals when the payment version changed mid-request", async () => {
    mockState.applications[0].pending_checkout_session_id = "cs_old_pending";
    mockState.applications[0].payment_link_version = 3;
    mockState.applications[1].assigned_car_id = 2;
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: "cs_old_pending",
      status: "open",
      metadata: {
        application_id: PENDING_APPLICATION_ID,
        checkout_kind: "vehicle",
        payment_link_version: "3",
      },
    });
    mockStripe.checkoutSessionsExpire.mockImplementationOnce(async () => {
      mockState.applications[0].payment_link_version = 4;
      return { id: "cs_old_pending" };
    });

    const res = await request(app)
      .post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`)
      .set("Authorization", "Bearer fake-token")
      .send({
        approved_vehicle: "Toyota Camry",
        approved_bond: 650,
        approved_weekly_price: 285,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("payment details changed");
  });

  it("POST /api/applications/:id/approve-payment allows a new application after another application was historically paid", async () => {
    mockState.applications[1].status = "Paid";
    mockState.applications[1].paid_at = "2026-03-06T00:00:00.000Z";
    mockState.cars[0].status = "Available";

    const res = await request(app)
      .post(`/api/applications/${PENDING_APPLICATION_ID}/approve-payment`)
      .set("Authorization", "Bearer fake-token")
      .send({
        approved_vehicle: "Toyota Camry",
        approved_bond: 650,
        approved_weekly_price: 285,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockState.applications[0].status).toBe("Approved");
  });

  it("POST /api/applications/:id/retry-payment-activation records payment without activating a rental", async () => {
    mockState.applications[1].status = "Payment Review";
    mockState.applications[1].paid_at = "2026-03-06T00:00:00.000Z";
    mockState.applications[1].pending_checkout_session_id =
      "cs_recovered_review";
    mockState.cars[0].status = "Available";
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: "cs_recovered_review",
      status: "complete",
      payment_status: "paid",
      customer: "cus_review",
      subscription: "sub_review",
      client_reference_id: APPROVED_APPLICATION_ID,
      metadata: {
        application_id: APPROVED_APPLICATION_ID,
        approved_bond: "500.00",
        approved_weekly_price: "250.00",
        car_id: "1",
        checkout_kind: "vehicle",
        payment_link_version: "1",
      },
    });

    const res = await request(app)
      .post(
        `/api/applications/${APPROVED_APPLICATION_ID}/retry-payment-activation`,
      )
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockState.applications[1].status).toBe("Paid");
    expect(mockState.applications[1].paid_at).toBe("2026-03-06T00:00:00.000Z");
    expect(mockState.applications[1].pending_checkout_session_id).toBeNull();
    expect(mockState.cars[0].status).toBe("Available");
    expect(mockState.rentals).toHaveLength(0);
    expect(mockStripe.checkoutSessionsList).not.toHaveBeenCalled();
  });

  it("POST /api/applications/:id/retry-payment-activation requires the stored Stripe session id", async () => {
    mockState.applications[1].status = "Payment Review";
    mockState.applications[1].paid_at = "2026-03-06T00:00:00.000Z";
    mockState.applications[1].pending_checkout_session_id = null;

    const res = await request(app)
      .post(
        `/api/applications/${APPROVED_APPLICATION_ID}/retry-payment-activation`,
      )
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(409);
    expect(res.body.error).toContain(
      "could not recover the paid checkout session",
    );
    expect(mockState.applications[1].status).toBe("Payment Review");
      expect(mockState.rentals).toHaveLength(0);
      expect(mockStripe.checkoutSessionsList).not.toHaveBeenCalled();
    });

    it("POST /api/applications/:id/cancel soft-cancels the application and only expires linked Stripe resources", async () => {
      mockState.applications[0].status = "Approved";
      mockState.applications[0].payment_link_version = 3;
      mockState.applications[0].pending_checkout_session_id = "cs_pending_cancel";
      mockState.rentals = [
        {
          id: 201,
          application_id: PENDING_APPLICATION_ID,
          car_id: 1,
          status: "Active",
          stripe_subscription_id: "sub_cancel_linked",
        },
        {
          id: 202,
          application_id: APPROVED_APPLICATION_ID,
          car_id: 2,
          status: "Active",
          stripe_subscription_id: "sub_other_application",
        },
      ];
      mockStripe.checkoutSessionsRetrieve.mockResolvedValue({
        id: "cs_pending_cancel",
        status: "open",
        metadata: {
          application_id: PENDING_APPLICATION_ID,
          checkout_kind: "vehicle",
          payment_link_version: "3",
        },
      });
      mockStripe.subscriptionsRetrieve.mockResolvedValueOnce({
        id: "sub_cancel_linked",
        status: "active",
        metadata: {
          application_id: PENDING_APPLICATION_ID,
          checkout_kind: "vehicle",
          payment_link_version: "3",
        },
      });
      mockStripe.subscriptionsCancel.mockResolvedValueOnce({
        id: "sub_cancel_linked",
        status: "canceled",
      });

      const res = await request(app)
        .post(`/api/applications/${PENDING_APPLICATION_ID}/cancel`)
        .set("Authorization", "Bearer fake-token")
        .send({ cancel_reason: "Driver withdrew" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        application_status: "Cancelled",
      });
      expect(mockStripe.checkoutSessionsRetrieve).toHaveBeenCalledWith(
        "cs_pending_cancel",
      );
      expect(mockStripe.checkoutSessionsExpire).toHaveBeenCalledWith(
        "cs_pending_cancel",
      );
      expect(mockStripe.subscriptionsRetrieve).toHaveBeenCalledWith(
        "sub_cancel_linked",
      );
    expect(mockStripe.subscriptionsCancel).toHaveBeenCalledWith(
      "sub_cancel_linked",
      {},
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^maple-cancel-/),
      }),
    );
      expect(mockStripe.subscriptionsCancel).toHaveBeenCalledTimes(1);
      expect(mockState.applications[0]).toMatchObject({
        cancelled_at: expect.any(String),
        cancel_reason: "Driver withdrew",
        payment_link_version: 4,
        pending_checkout_session_id: null,
        status: "Cancelled",
      });
    });

    it("POST /api/applications/:id/cancel returns conflict when payment details change mid-cancel", async () => {
      mockState.applications[0].status = "Approved";
      mockState.applications[0].payment_link_version = 3;
      mockState.applications[0].pending_checkout_session_id = null;
      mockBeforeApplicationsUpdate.mockImplementationOnce(() => {
        mockState.applications[0].payment_link_version = 4;
      });

      const res = await request(app)
        .post(`/api/applications/${PENDING_APPLICATION_ID}/cancel`)
        .set("Authorization", "Bearer fake-token")
        .send({ cancel_reason: "Driver withdrew" });

      expect(res.status).toBe(202);
      expect(res.body).toMatchObject({
        reconciliationPending: true,
        success: false,
      });
      expect(mockStripe.checkoutSessionsRetrieve).not.toHaveBeenCalled();
      expect(mockStripe.checkoutSessionsExpire).not.toHaveBeenCalled();
      expect(mockStripe.subscriptionsCancel).not.toHaveBeenCalled();
      expect(mockState.applications[0]).toMatchObject({
        cancelled_at: null,
        cancel_reason: null,
        payment_link_version: 4,
        pending_checkout_session_id: null,
        status: "Approved",
      });
    });

    it("POST /api/applications/:id/cancel cancels a payment-only subscription from the webhook ledger", async () => {
      mockState.applications[0].status = "Paid";
      mockState.applications[0].payment_link_version = 3;
      mockState.applications[0].pending_checkout_session_id = null;
      mockState.rentals = [];
      mockState.stripe_webhook_events = [
        {
          application_id: PENDING_APPLICATION_ID,
          stripe_subscription_id: "sub_payment_only",
        },
      ];
      mockStripe.subscriptionsRetrieve.mockResolvedValueOnce({
        id: "sub_payment_only",
        status: "active",
        metadata: {
          application_id: PENDING_APPLICATION_ID,
          checkout_kind: "vehicle",
          payment_link_version: "2",
        },
      });
      mockStripe.subscriptionsCancel.mockResolvedValueOnce({
        id: "sub_payment_only",
        status: "canceled",
      });

      const res = await request(app)
        .post(`/api/applications/${PENDING_APPLICATION_ID}/cancel`)
        .set("Authorization", "Bearer fake-token")
        .send({ cancel_reason: "Driver withdrew" });

      expect(res.status).toBe(200);
      expect(mockStripe.subscriptionsCancel).toHaveBeenCalledWith(
        "sub_payment_only",
        {},
        expect.objectContaining({
          idempotencyKey: expect.stringMatching(/^maple-cancel-/),
        }),
      );
      expect(mockState.applications[0].status).toBe("Cancelled");
      expect(mockState.rentals).toHaveLength(0);
    });

    it("POST /api/applications/:id/cancel recovers a pre-migration payment-only subscription from its checkout session", async () => {
      mockState.applications[0].status = "Paid";
      mockState.applications[0].payment_link_version = 3;
      mockState.applications[0].pending_checkout_session_id = null;
      mockState.rentals = [];
      mockState.stripe_webhook_events = [
        {
          application_id: PENDING_APPLICATION_ID,
          checkout_session_id: "cs_legacy_payment_only",
          stripe_subscription_id: null,
        },
      ];
      mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
        id: "cs_legacy_payment_only",
        status: "complete",
        metadata: {
          application_id: PENDING_APPLICATION_ID,
          checkout_kind: "vehicle",
          payment_link_version: "2",
        },
        subscription: "sub_legacy_payment_only",
      });
      mockStripe.subscriptionsRetrieve.mockResolvedValueOnce({
        id: "sub_legacy_payment_only",
        status: "active",
        metadata: {
          application_id: PENDING_APPLICATION_ID,
          checkout_kind: "vehicle",
          payment_link_version: "2",
        },
      });
      mockStripe.subscriptionsCancel.mockResolvedValueOnce({
        id: "sub_legacy_payment_only",
        status: "canceled",
      });

      const res = await request(app)
        .post(`/api/applications/${PENDING_APPLICATION_ID}/cancel`)
        .set("Authorization", "Bearer fake-token")
        .send({ cancel_reason: "Driver withdrew" });

      expect(res.status).toBe(200);
      expect(mockStripe.checkoutSessionsRetrieve).toHaveBeenCalledWith(
        "cs_legacy_payment_only",
      );
      expect(mockStripe.subscriptionsCancel).toHaveBeenCalledWith(
        "sub_legacy_payment_only",
        {},
        expect.objectContaining({
          idempotencyKey: expect.stringMatching(/^maple-cancel-/),
        }),
      );
      expect(mockState.applications[0].status).toBe("Cancelled");
      expect(mockState.rentals).toHaveLength(0);
    });

    it("POST /api/applications/:id/cancel returns reconciliation pending when Stripe cleanup fails after confirmation", async () => {
      mockState.applications[0].status = "Paid";
      mockState.applications[0].payment_link_version = 3;
      mockState.applications[0].pending_checkout_session_id = null;
      mockState.stripe_webhook_events = [
        {
          application_id: PENDING_APPLICATION_ID,
          stripe_subscription_id: "sub_payment_only",
        },
      ];
      mockStripe.subscriptionsRetrieve.mockResolvedValueOnce({
        id: "sub_payment_only",
        status: "active",
        metadata: {
          application_id: PENDING_APPLICATION_ID,
          checkout_kind: "vehicle",
          payment_link_version: "3",
        },
      });
      mockStripe.subscriptionsCancel.mockRejectedValueOnce(
        new Error("Stripe unavailable"),
      );

      const res = await request(app)
        .post(`/api/applications/${PENDING_APPLICATION_ID}/cancel`)
        .set("Authorization", "Bearer fake-token")
        .send({ cancel_reason: "Driver withdrew" });

      expect(res.status).toBe(202);
      expect(res.body).toMatchObject({
        reconciliationPending: true,
        success: false,
      });
      expect(mockState.applications[0]).toMatchObject({
        cancel_reason: null,
        payment_link_version: 3,
        status: "Paid",
      });
    });

    it("POST /api/stripe/webhook does not reactivate a cancelled application", async () => {
      mockState.applications[0].status = "Cancelled";
      mockState.applications[0].cancelled_at = "2026-03-10T00:00:00.000Z";
      mockState.applications[0].cancel_reason = "Driver withdrew";
      mockState.applications[0].payment_link_version = 4;
      mockState.applications[0].pending_checkout_session_id = null;
      mockState.rentals = [];
      mockStripe.webhooksConstructEvent.mockReturnValue({
        id: "evt_cancelled_replay",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_cancelled_replay",
            payment_status: "paid",
            metadata: {
              application_id: PENDING_APPLICATION_ID,
              car_id: "1",
              checkout_kind: "vehicle",
              payment_link_version: "3",
            },
            customer: "cus_cancelled",
            subscription: "sub_cancelled",
          },
        },
      });

      const res = await request(app)
        .post("/api/stripe/webhook")
        .set("stripe-signature", "test-signature")
        .send("test-webhook-body");

      expect(res.status).toBe(200);
      expect(mockState.applications[0].status).toBe("Cancelled");
      expect(mockState.applications[0].pending_checkout_session_id).toBeNull();
      expect(mockState.rentals).toHaveLength(0);
    });

    it("GET /api/stripe/payment-context returns the approved quote for a valid payment link", async () => {
      const token = createCheckoutToken({
        applicationId: APPROVED_APPLICATION_ID,
        carId: 1,
        purpose: "vehicle",
      version: 1,
    });

    const res = await request(app).get("/api/stripe/payment-context").query({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      checkout_token: token.token,
    });

    expect(res.status).toBe(200);
    expect(res.body.billing.bond).toBe(500);
    expect(res.body.billing.bondStatus).toBe("To be collected by admin");
    expect(res.body.billing.bondMethod).toBe("Not yet collected");
    expect(res.body.billing.initialRental).toBe(250);
    expect(res.body.billing.upfrontDue).toBe(250);
    expect(res.body.billing.setupFees).toBe(0);
    expect(res.body.approved_vehicle).toBe("Toyota Camry");
    expect(res.body.vehicle_image).toBe("/camry-deep-blue.webp");
  });

  it("GET /api/stripe/payment-context returns the approved quote without a car id", async () => {
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      purpose: "vehicle",
      version: 1,
    });

    const res = await request(app).get("/api/stripe/payment-context").query({
      application_id: APPROVED_APPLICATION_ID,
      checkout_token: token.token,
    });

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("car_id");
    expect(res.body.approved_vehicle).toBe("Toyota Camry");
    expect(res.body.vehicle_image).toBe("/camry-deep-blue.webp");
  });

  it("GET /api/stripe/payment-context returns 409 when payment was already received", async () => {
    mockState.applications[1].status = "Paid";

    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });

    const res = await request(app).get("/api/stripe/payment-context").query({
      application_id: APPROVED_APPLICATION_ID,
      car_id: 1,
      checkout_token: token.token,
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Payment link has already been used.");
  });

  it("POST /api/stripe/vehicle-checkout-session rejects unapproved applications", async () => {
    const token = createCheckoutToken({
      applicationId: PENDING_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
    });

    const res = await request(app)
      .post("/api/stripe/vehicle-checkout-session")
      .send({
        application_id: PENDING_APPLICATION_ID,
        checkout_token: token.token,
        car_id: 1,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("not ready for payment");
  });

  it("POST /api/stripe/vehicle-checkout-session still creates a hosted session without direct DB access", async () => {
    mockHasDirectDatabaseConnection.mockReturnValue(false);
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });

    const res = await request(app)
      .post("/api/stripe/vehicle-checkout-session")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(200);
    expect(res.body.session_id).toBe("cs_test_123");
    expect(mockWithPostgresAdvisoryLock).not.toHaveBeenCalled();
    expect(mockStripe.checkoutSessionsCreate).toHaveBeenCalledTimes(1);
  });

  it("POST /api/stripe/vehicle-checkout-session rejects outdated payment-link versions", async () => {
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 0,
    });

    const res = await request(app)
      .post("/api/stripe/vehicle-checkout-session")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("version mismatch");
  });

  it("POST /api/stripe/vehicle-checkout-session rejects mismatched tokens", async () => {
    const token = createCheckoutToken({
      applicationId: PENDING_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });

    const res = await request(app)
      .post("/api/stripe/vehicle-checkout-session")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("application mismatch");
  });

  it("POST /api/stripe/vehicle-checkout-session reuses an open pending Stripe session", async () => {
    mockState.applications[1].pending_checkout_session_id = "cs_open_approved";
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: "cs_open_approved",
      status: "open",
      url: "https://checkout.stripe.com/c/pay/cs_open_approved",
      payment_status: "unpaid",
      metadata: {
        application_id: APPROVED_APPLICATION_ID,
        approved_bond: "500.00",
        approved_weekly_price: "250.00",
        car_id: "1",
        checkout_kind: "vehicle",
        payment_link_version: "1",
      },
    });
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });

    const res = await request(app)
      .post("/api/stripe/vehicle-checkout-session")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(200);
    expect(res.body.session_id).toBe("cs_open_approved");
    expect(res.body.checkout_url).toBe(
      "https://checkout.stripe.com/c/pay/cs_open_approved",
    );
    expect(mockStripe.checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("POST /api/stripe/vehicle-checkout-session returns 409 for a completed pending session", async () => {
    mockState.applications[1].pending_checkout_session_id =
      "cs_complete_approved";
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: "cs_complete_approved",
      status: "complete",
      url: null,
      payment_status: "paid",
      metadata: {
        application_id: APPROVED_APPLICATION_ID,
        approved_bond: "500.00",
        approved_weekly_price: "250.00",
        car_id: "1",
        checkout_kind: "vehicle",
        payment_link_version: "1",
      },
    });
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });

    const res = await request(app)
      .post("/api/stripe/vehicle-checkout-session")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already been received");
    expect(mockStripe.checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("POST /api/stripe/vehicle-checkout-session creates a hosted session from the approved quote", async () => {
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });

    const res = await request(app)
      .post("/api/stripe/vehicle-checkout-session")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(200);
    expect(res.body.session_id).toBe("cs_test_123");
    expect(mockState.applications[1].pending_checkout_session_id).toBe(
      "cs_test_123",
    );

    const payload = mockStripe.checkoutSessionsCreate.mock.calls[0][0];
    expect(payload.mode).toBe("subscription");
    expect(payload.line_items).toHaveLength(1);
    expect(payload.metadata.checkout_kind).toBe("vehicle");
    expect(payload.metadata.application_id).toBe(APPROVED_APPLICATION_ID);
    expect(payload.metadata.approved_vehicle).toBe("Toyota Camry");
    expect(payload.metadata.approved_bond).toBeUndefined();
    expect(payload.metadata.manual_bond_amount).toBeUndefined();
    expect(payload.metadata.manual_bond_status).toBeUndefined();
    expect(payload.metadata.manual_bond_method).toBeUndefined();
    expect(payload.metadata.stripe_bond_charge).toBeUndefined();
    expect(payload.metadata.approved_weekly_price).toBe("250.00");
    expect(payload.metadata.applicant_email).toBe("approved@example.com");
    expect(payload.metadata.car_id).toBeUndefined();
    expect(payload.metadata.payment_type).toBe("vehicle_rental");
    expect(payload.metadata.rental_subscription_start_date).toBe(
      mockState.applications[1].intended_start_date,
    );
    expect(payload.subscription_data.metadata.car_id).toBeUndefined();
    expect(payload.subscription_data.metadata.rental_subscription_start_date).toBe(
      mockState.applications[1].intended_start_date,
    );
    expect(payload.subscription_data.trial_end).toBeUndefined();
    expect(payload.subscription_data.billing_cycle_anchor).toEqual(expect.any(Number));
    expect(payload.subscription_data.proration_behavior).toBe('none');

    const recurringItem = payload.line_items.find(
      (item: any) => item.price_data.recurring,
    );
    expect(recurringItem).toBeTruthy();
    expect(recurringItem.price_data.unit_amount).toBe(25000);
    expect(recurringItem.price_data.product).toBe("prod_weekly_rental");
    expect(payload.line_items).toEqual([recurringItem]);
    expect(mockStripe.invoiceItemsCreate).not.toHaveBeenCalled();
    expect(
      payload.line_items.some((item: any) =>
        ["prod_security_bond", "prod_onboarding_setup"].includes(
          item.price_data.product,
        ),
      ),
    ).toBe(false);
    expect(payload.cancel_url).toContain(`/checkout/${APPROVED_APPLICATION_ID}`);
    expect(payload.cancel_url).toContain("resume_payment=1");
    expect(payload.cancel_url).toContain(
      `#checkout_token=${encodeURIComponent(token.token)}`,
    );
    expect(payload.success_url).toContain(
      `application_id=${APPROVED_APPLICATION_ID}`,
    );
    expect(payload.success_url).toContain(
      `#checkout_token=${encodeURIComponent(token.token)}`,
    );
  });

  it("POST /api/stripe/vehicle-checkout-session creates a hosted session without car metadata", async () => {
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      purpose: "vehicle",
      version: 1,
    });

    const res = await request(app)
      .post("/api/stripe/vehicle-checkout-session")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        checkout_token: token.token,
      });

    expect(res.status).toBe(200);
    const payload = mockStripe.checkoutSessionsCreate.mock.calls[0][0];
    expect(payload.metadata.car_id).toBeUndefined();
    expect(payload.subscription_data.metadata.car_id).toBeUndefined();
  });

  it("POST /api/stripe/vehicle-checkout-session keeps existing-driver bond out of Stripe", async () => {
    mockState.applications[1].bond_payment_status = "already_paid";
    mockState.applications[1].bond_payment_method = "existing_paid";
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      purpose: "vehicle",
      version: 1,
    });

    const res = await request(app)
      .post("/api/stripe/vehicle-checkout-session")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        checkout_token: token.token,
      });

    expect(res.status).toBe(200);
    const payload = mockStripe.checkoutSessionsCreate.mock.calls[0][0];
    expect(payload.line_items).toHaveLength(1);
    expect(payload.line_items[0].price_data.unit_amount).toBe(25000);
    expect(payload.metadata.approved_bond).toBeUndefined();
    expect(payload.metadata.manual_bond_amount).toBeUndefined();
    expect(payload.metadata.manual_bond_status).toBeUndefined();
    expect(payload.metadata.manual_bond_method).toBeUndefined();
    expect(payload.metadata.stripe_bond_charge).toBeUndefined();
    expect(mockStripe.invoiceItemsCreate).not.toHaveBeenCalled();
  });

  it("POST /api/stripe/vehicle-checkout-session starts subscriptions immediately for past rental start dates", async () => {
    mockState.applications[1].intended_start_date = getPastDateOnly(1);
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      purpose: "vehicle",
      version: 1,
    });

    const res = await request(app)
      .post("/api/stripe/vehicle-checkout-session")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        checkout_token: token.token,
      });

    expect(res.status).toBe(200);
    const payload = mockStripe.checkoutSessionsCreate.mock.calls[0][0];
    expect(payload.metadata.rental_subscription_start_date).toBe(
      getPastDateOnly(1),
    );
    expect(payload.subscription_data.trial_end).toBeUndefined();
    expect(payload.subscription_data.billing_cycle_anchor).toBeUndefined();
  });

  it("POST /api/stripe/vehicle-checkout-session returns a retryable Stripe outage message", async () => {
    mockStripe.checkoutSessionsCreate.mockRejectedValueOnce({
      message: "Stripe upstream unavailable",
      type: "StripeAPIError",
    });

    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });

    const res = await request(app)
      .post("/api/stripe/vehicle-checkout-session")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe(
      "Stripe is temporarily unavailable. Please try again shortly.",
    );
  });

  it("POST /api/stripe/vehicle-checkout-session derives a stable retry idempotency key from the stale session id", async () => {
    mockState.applications[1].pending_checkout_session_id = "cs_closed_attempt";
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: "cs_closed_attempt",
      status: "expired",
      url: null,
      payment_status: "unpaid",
      metadata: {
        application_id: APPROVED_APPLICATION_ID,
        approved_bond: "500.00",
        approved_weekly_price: "250.00",
        car_id: "1",
        checkout_kind: "vehicle",
        payment_link_version: "1",
      },
    });

    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });

    const res = await request(app)
      .post("/api/stripe/vehicle-checkout-session")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(200);
    expect(mockState.applications[1].pending_checkout_session_id).toBe(
      "cs_test_123",
    );
    expect(
      mockStripe.checkoutSessionsCreate.mock.calls[0][1].idempotencyKey,
    ).toBe(
      `vehicle-checkout:${APPROVED_APPLICATION_ID}:v1:retry:cs_closed_attempt`,
    );
  });

  it("POST /api/stripe/vehicle-checkout-session uses a Postgres advisory lock when direct DB access is configured", async () => {
    mockHasDirectDatabaseConnection.mockReturnValue(true);

    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });

    const res = await request(app)
      .post("/api/stripe/vehicle-checkout-session")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(200);
    expect(mockWithPostgresAdvisoryLock).toHaveBeenCalledWith(
      `vehicle-checkout:${APPROVED_APPLICATION_ID}`,
      expect.any(Function),
    );
  });

  it("POST /api/stripe/vehicle-checkout-session expires a newly created session when the link version changes mid-request", async () => {
    mockStripe.checkoutSessionsCreate.mockImplementationOnce(async () => {
      mockState.applications[1].payment_link_version = 2;
      return {
        id: "cs_superseded",
        url: "https://checkout.stripe.com/c/pay/cs_superseded",
      };
    });
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: "cs_superseded",
      status: "open",
    });

    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });

    const res = await request(app)
      .post("/api/stripe/vehicle-checkout-session")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("latest link");
    expect(mockStripe.checkoutSessionsExpire).toHaveBeenCalledWith(
      "cs_superseded",
    );
    expect(mockState.applications[1].pending_checkout_session_id).toBeNull();
  });

  it("POST /api/stripe/vehicle-checkout-link requires admin auth", async () => {
    const res = await request(app)
      .post("/api/stripe/vehicle-checkout-link")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
      });

    expect(res.status).toBe(401);
  });

  it("POST /api/stripe/vehicle-checkout-link still issues a signed link without direct DB access", async () => {
    mockHasDirectDatabaseConnection.mockReturnValue(false);

    const res = await request(app)
      .post("/api/stripe/vehicle-checkout-link")
      .set("Authorization", "Bearer fake-token")
      .send({
        application_id: APPROVED_APPLICATION_ID,
      });

    expect(res.status).toBe(200);
    expect(res.body.checkout_url).toContain(`/checkout/${APPROVED_APPLICATION_ID}`);
    expect(mockState.applications[1].payment_link_version).toBe(2);
  });

  it("POST /api/stripe/vehicle-checkout-link rejects car_id without changing vehicle state", async () => {
    const carStatusesBefore = mockState.cars.map((car) => car.status);
    const rentalCountBefore = mockState.rentals.length;

    const res = await request(app)
      .post("/api/stripe/vehicle-checkout-link")
      .set("Authorization", "Bearer fake-token")
      .send({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
    });

    expect(res.status).toBe(400);
    expect(mockState.applications[1].payment_link_version).toBe(1);
    expect(mockState.cars.map((car) => car.status)).toEqual(carStatusesBefore);
    expect(mockState.rentals).toHaveLength(rentalCountBefore);
  });

  it("POST /api/stripe/vehicle-checkout-link returns a signed payment link without a car id", async () => {
    const res = await request(app)
      .post("/api/stripe/vehicle-checkout-link")
      .set("Authorization", "Bearer fake-token")
      .send({
        application_id: APPROVED_APPLICATION_ID,
      });

    expect(res.status).toBe(200);
    expect(res.body.checkout_url).toContain(`/checkout/${APPROVED_APPLICATION_ID}`);

    const verified = verifyCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      purpose: "vehicle",
      token: res.body.checkout_token,
      version: 2,
    });
    expect(verified.carId).toBeNull();
  });

  it("POST /api/stripe/vehicle-checkout-link refuses to replace a completed subscription checkout", async () => {
    mockState.applications[1].pending_checkout_session_id = "cs_completed";
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: "cs_completed",
      status: "complete",
      subscription: "sub_scheduled",
      metadata: {
        application_id: APPROVED_APPLICATION_ID,
        checkout_kind: "vehicle",
        payment_link_version: "1",
      },
    });

    const res = await request(app)
      .post("/api/stripe/vehicle-checkout-link")
      .set("Authorization", "Bearer fake-token")
      .send({ application_id: APPROVED_APPLICATION_ID });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("must be reconciled");
    expect(mockState.applications[1]).toMatchObject({
      payment_link_version: 1,
      pending_checkout_session_id: "cs_completed",
    });
  });

  it("POST /api/stripe/vehicle-checkout-link rejects approved applications that are missing pricing", async () => {
    mockState.applications[1].approved_weekly_price = 0;

    const res = await request(app)
      .post("/api/stripe/vehicle-checkout-link")
      .set("Authorization", "Bearer fake-token")
      .send({
        application_id: APPROVED_APPLICATION_ID,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("missing approved pricing");
  });

  it("GET /api/stripe/checkout-sessions/:id requires an application id", async () => {
    const res = await request(app).get(
      "/api/stripe/checkout-sessions/cs_test_123",
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("GET /api/stripe/checkout-sessions/:id recovers paid success redirects without a checkout token", async () => {
    mockState.applications[1].pending_checkout_session_id = "cs_test_123";

    const res = await request(app)
      .get("/api/stripe/checkout-sessions/cs_test_123")
      .query({
        application_id: APPROVED_APPLICATION_ID,
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      application_status: "Approved",
      checkout_kind: "vehicle",
      id: "cs_test_123",
      internal_status: "pending_webhook",
      payment_status: "paid",
      state: "pending_webhook",
      status: "complete",
    });
  });

  it("GET /api/stripe/checkout-sessions/:id rejects open sessions without a checkout token", async () => {
    mockState.applications[1].pending_checkout_session_id = "cs_open_vehicle";
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: "cs_open_vehicle",
      url: "https://checkout.stripe.com/c/pay/cs_open_vehicle",
      status: "open",
      payment_status: "unpaid",
      metadata: {
        application_id: APPROVED_APPLICATION_ID,
        car_id: "1",
        checkout_kind: "vehicle",
        payment_link_version: "1",
      },
    });

    const res = await request(app)
      .get("/api/stripe/checkout-sessions/cs_open_vehicle")
      .query({
        application_id: APPROVED_APPLICATION_ID,
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe(
      "Checkout token is required for this checkout session.",
    );
  });

  it("GET /api/stripe/checkout-sessions/:id returns the Stripe session status", async () => {
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });
    const res = await request(app)
      .get("/api/stripe/checkout-sessions/cs_test_123")
      .query({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      application_status: "Approved",
      checkout_kind: "vehicle",
      id: "cs_test_123",
      internal_status: "pending_webhook",
      customer_id: "cus_123",
        metadata_match: {
          application_id: true,
          checkout_kind: true,
        matched: true,
        payment_link_version: true,
      },
      payment_method_type: "card",
      payment_method_types: ["card"],
      payment_status: "paid",
      rental_status: null,
      state: "pending_webhook",
      subscription_id: "sub_123",
      status: "complete",
    });
  });

  it("GET /api/stripe/checkout-sessions/:id returns complete_paid after card activation exists", async () => {
    mockState.applications[1].status = "Paid";
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        status: "Active",
        stripe_customer_id: "cus_123",
        stripe_subscription_id: "sub_123",
        weekly_price: 250,
        bond_paid: 500,
        start_date: "2026-03-01",
      },
    ];

    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });
    const res = await request(app)
      .get("/api/stripe/checkout-sessions/cs_test_123")
      .query({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      internal_status: "complete_paid",
      payment_method_type: "card",
      payment_status: "paid",
      rental_status: null,
      state: "complete_paid",
      status: "complete",
    });
  });

  it.each(["unpaid", "pending", "no_payment_required"])(
    "GET /api/stripe/checkout-sessions/:id returns processing for BECS checkout setup with %s payment status",
    async (paymentStatus) => {
      mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
        id: `cs_becs_${paymentStatus}`,
        url: `https://checkout.stripe.com/c/pay/cs_becs_${paymentStatus}`,
        status: "complete",
        payment_status: paymentStatus,
        payment_method_types: ["au_becs_debit"],
        metadata: {
          application_id: APPROVED_APPLICATION_ID,
          approved_bond: "500.00",
          approved_weekly_price: "250.00",
          car_id: "1",
          checkout_kind: "vehicle",
          payment_link_version: "1",
        },
        customer: "cus_becs",
        subscription: "sub_becs",
      });

      const token = createCheckoutToken({
        applicationId: APPROVED_APPLICATION_ID,
        carId: 1,
        purpose: "vehicle",
        version: 1,
      });
      const res = await request(app)
        .get(`/api/stripe/checkout-sessions/cs_becs_${paymentStatus}`)
        .query({
          application_id: APPROVED_APPLICATION_ID,
          car_id: 1,
          checkout_token: token.token,
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        customer_id: "cus_becs",
        internal_status: "processing",
        payment_method_type: "au_becs_debit",
        payment_method_types: ["au_becs_debit"],
        payment_status: paymentStatus,
        state: "processing",
        subscription_id: "sub_becs",
        status: "complete",
      });
    },
  );

  it("GET /api/stripe/checkout-sessions/:id returns scheduled before a future first payment", async () => {
    const futureStartDate = getFutureDateOnly(30);
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: "cs_future_scheduled",
      status: "complete",
      payment_status: "no_payment_required",
      payment_method_types: ["card"],
      metadata: {
        application_id: APPROVED_APPLICATION_ID,
        checkout_kind: "vehicle",
        payment_link_version: "1",
        rental_subscription_start_date: futureStartDate,
      },
      customer: "cus_future",
      subscription: "sub_future",
    });

    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      purpose: "vehicle",
      version: 1,
    });
    const res = await request(app)
      .get("/api/stripe/checkout-sessions/cs_future_scheduled")
      .query({
        application_id: APPROVED_APPLICATION_ID,
        checkout_token: token.token,
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      internal_status: "scheduled",
      payment_status: "no_payment_required",
      state: "scheduled",
      status: "complete",
    });
  });

  it("GET /api/stripe/checkout-sessions/:id returns failed for expired checkout sessions", async () => {
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: "cs_expired_vehicle",
      url: null,
      status: "expired",
      payment_status: "unpaid",
      payment_method_types: ["card"],
      metadata: {
        application_id: APPROVED_APPLICATION_ID,
        car_id: "1",
        checkout_kind: "vehicle",
        payment_link_version: "1",
      },
    });

    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });
    const res = await request(app)
      .get("/api/stripe/checkout-sessions/cs_expired_vehicle")
      .query({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      internal_status: "failed",
      payment_method_type: "card",
      payment_status: "unpaid",
      state: "failed",
      status: "expired",
    });
  });

  it("GET /api/stripe/checkout-sessions/:id derives completion from Stripe and application payment state only", async () => {
    mockState.applications[1].status = "Paid";

    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });
    const res = await request(app)
      .get("/api/stripe/checkout-sessions/cs_test_123")
      .query({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(200);
    expect(res.body.internal_status).toBe("complete_paid");
    expect(res.body.state).toBe("complete_paid");
    expect(res.body.application_status).toBe("Paid");
    expect(res.body.rental_status).toBeNull();
  });

  it("GET /api/stripe/checkout-sessions/:id returns complete once rental activation exists", async () => {
    mockState.applications[1].status = "Paid";
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        status: "Active",
        weekly_price: 250,
        bond_paid: 500,
        start_date: "2026-03-01",
      },
    ];
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });
    const res = await request(app)
      .get("/api/stripe/checkout-sessions/cs_test_123")
      .query({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(200);
    expect(res.body.internal_status).toBe("complete_paid");
    expect(res.body.state).toBe("complete_paid");
    expect(res.body.application_status).toBe("Paid");
    expect(res.body.rental_status).toBeNull();
  });

  it("GET /api/stripe/checkout-sessions/:id returns complete after activation even if the success token was scrubbed", async () => {
    mockState.applications[1].status = "Paid";
    mockState.applications[1].pending_checkout_session_id = null;
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        status: "Active",
        stripe_subscription_id: "sub_123",
        weekly_price: 250,
        bond_paid: 500,
        start_date: "2026-03-01",
      },
    ];

    const res = await request(app)
      .get("/api/stripe/checkout-sessions/cs_test_123")
      .query({
        application_id: APPROVED_APPLICATION_ID,
      });

    expect(res.status).toBe(200);
    expect(res.body.internal_status).toBe("complete_paid");
    expect(res.body.state).toBe("complete_paid");
    expect(res.body.application_status).toBe("Paid");
    expect(res.body.rental_status).toBeNull();
  });

  it("GET /api/stripe/checkout-sessions/:id returns manual_review when payment completed but activation was blocked", async () => {
    mockState.applications[1].status = "Payment Review";

    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });
    const res = await request(app)
      .get("/api/stripe/checkout-sessions/cs_test_123")
      .query({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(200);
    expect(res.body.internal_status).toBe("manual_review");
    expect(res.body.state).toBe("manual_review");
    expect(res.body.application_status).toBe("Payment Review");
  });

  it("GET /api/stripe/checkout-sessions/:id rejects sessions for the wrong checkout kind", async () => {
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: "cs_test_123",
      status: "complete",
      payment_status: "paid",
      payment_method_types: ["card"],
      metadata: {
        application_id: APPROVED_APPLICATION_ID,
        car_id: "",
        checkout_kind: "application",
        payment_link_version: "1",
      },
    });
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });
    const res = await request(app)
      .get("/api/stripe/checkout-sessions/cs_test_123")
      .query({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe(
      "Checkout session does not match this payment link.",
    );
    expect(res.body).toMatchObject({
      metadata_match: {
        matched: false,
        reason: "Checkout session does not match this payment link.",
      },
      state: "failed",
    });
  });

  it("GET /api/stripe/checkout-sessions/:id ignores quarantined legacy car metadata", async () => {
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: "cs_test_123",
      status: "complete",
      payment_status: "paid",
      metadata: {
        application_id: APPROVED_APPLICATION_ID,
        car_id: "2",
        checkout_kind: "vehicle",
        payment_link_version: "1",
      },
    });
    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });
    const res = await request(app)
      .get("/api/stripe/checkout-sessions/cs_test_123")
      .query({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(200);
    expect(res.body.metadata_match.matched).toBe(true);
    expect(res.body.rental_status).toBeNull();
  });

  it("GET /api/stripe/checkout-sessions/:id returns 404 when Stripe no longer has the session", async () => {
    const stripeMissingSessionError = Object.assign(
      new Error("No such checkout.session"),
      {
        code: "resource_missing",
        statusCode: 404,
        type: "StripeInvalidRequestError",
      },
    );
    mockStripe.checkoutSessionsRetrieve.mockRejectedValueOnce(
      stripeMissingSessionError,
    );

    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });
    const res = await request(app)
      .get("/api/stripe/checkout-sessions/cs_missing")
      .query({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Checkout session not found.");
  });

  it("GET /api/stripe/checkout-sessions/:id returns Stripe errors without falling through to 500", async () => {
    const stripeCardError = Object.assign(new Error("Card declined"), {
      statusCode: 402,
      type: "StripeCardError",
    });
    mockStripe.checkoutSessionsRetrieve.mockRejectedValueOnce(stripeCardError);

    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });
    const res = await request(app)
      .get("/api/stripe/checkout-sessions/cs_card_declined")
      .query({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(402);
    expect(res.body.error).toBe("Card declined");
  });

  it("GET /api/stripe/checkout-sessions/:id returns 503 for Stripe connection failures without a status code", async () => {
    const stripeConnectionError = Object.assign(
      new Error("An error occurred with our connection to Stripe."),
      {
        type: "StripeConnectionError",
      },
    );
    mockStripe.checkoutSessionsRetrieve.mockRejectedValueOnce(
      stripeConnectionError,
    );

    const token = createCheckoutToken({
      applicationId: APPROVED_APPLICATION_ID,
      carId: 1,
      purpose: "vehicle",
      version: 1,
    });
    const res = await request(app)
      .get("/api/stripe/checkout-sessions/cs_connection_issue")
      .query({
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        checkout_token: token.token,
      });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe(
      "An error occurred with our connection to Stripe.",
    );
  });

  it("POST /api/stripe/webhook returns 503 when the webhook secret is missing", async () => {
    const previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    try {
      const res = await request(app)
        .post("/api/stripe/webhook")
        .set("stripe-signature", "test-signature")
        .set("Content-Type", "application/json")
        .send("{}");

      expect(res.status).toBe(503);
      expect(res.text).toBe("Webhook configuration missing");
      expect(mockStripe.webhooksConstructEvent).not.toHaveBeenCalled();
    } finally {
      if (previousWebhookSecret === undefined) {
        delete process.env.STRIPE_WEBHOOK_SECRET;
      } else {
        process.env.STRIPE_WEBHOOK_SECRET = previousWebhookSecret;
      }
    }
  });

  it("POST /api/stripe/webhook ignores legacy car metadata and records payment only", async () => {
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: "evt_test_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_live_vehicle",
          payment_status: "paid",
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: "500.00",
            approved_weekly_price: "250.00",
            car_id: "1",
            checkout_kind: "vehicle",
            payment_link_version: "1",
          },
          customer: "cus_123",
          subscription: "sub_123",
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(200);
    expect(mockState.cars[0].status).toBe("Available");
    expect(mockState.applications[1].status).toBe("Paid");
    expect(mockState.applications[1].pending_checkout_session_id).toBeNull();
    expect(mockState.rentals).toHaveLength(0);
  });

  it("POST /api/stripe/webhook records paid checkouts without car_id", async () => {
    const carStatusesBefore = mockState.cars.map((car) => car.status);
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: "evt_missing_car_id",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_missing_car_id",
          payment_status: "paid",
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: "500.00",
            approved_weekly_price: "250.00",
            checkout_kind: "vehicle",
            payment_link_version: "1",
          },
          customer: "cus_missing_car",
          subscription: "sub_missing_car",
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(200);
    expect(mockState.cars.map((car) => car.status)).toEqual(carStatusesBefore);
    expect(mockState.applications[1].status).toBe("Paid");
    expect(mockState.applications[1].pending_checkout_session_id).toBeNull();
    expect(mockState.applications[1].paid_at).toBeTruthy();
    expect(mockState.rentals).toHaveLength(0);
  });

  it("POST /api/stripe/webhook returns a generic signature failure message", async () => {
    mockStripe.webhooksConstructEvent.mockImplementation(() => {
      throw new Error(
        "No signatures found matching the expected signature for payload",
      );
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(400);
    expect(res.text).toBe("400 Bad Request: Invalid Signature");
  });

  it("POST /api/stripe/webhook accepts the previous secret during rotation", async () => {
    const priorPreviousSecret = process.env.STRIPE_WEBHOOK_SECRET_PREVIOUS;
    process.env.STRIPE_WEBHOOK_SECRET_PREVIOUS = "previous-webhook-secret";
    mockStripe.webhooksConstructEvent
      .mockImplementationOnce(() => {
        throw new Error("Primary webhook secret did not match");
      })
      .mockReturnValueOnce({
        id: "evt_previous_secret",
        type: "unhandled.test_event",
        data: { object: { id: "obj_previous_secret" } },
      });

    try {
      const res = await request(app)
        .post("/api/stripe/webhook")
        .set("stripe-signature", "test-signature")
        .set("Content-Type", "application/json")
        .send("{}");

      expect(res.status).toBe(200);
      expect(mockStripe.webhooksConstructEvent).toHaveBeenNthCalledWith(
        1,
        expect.any(Buffer),
        "test-signature",
        "test-webhook-secret",
      );
      expect(mockStripe.webhooksConstructEvent).toHaveBeenNthCalledWith(
        2,
        expect.any(Buffer),
        "test-signature",
        "previous-webhook-secret",
      );
    } finally {
      if (priorPreviousSecret === undefined) {
        delete process.env.STRIPE_WEBHOOK_SECRET_PREVIOUS;
      } else {
        process.env.STRIPE_WEBHOOK_SECRET_PREVIOUS = priorPreviousSecret;
      }
    }
  });

  it("POST /api/stripe/webhook records payment-only completion without direct DB access", async () => {
    mockHasDirectDatabaseConnection.mockReturnValue(false);
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: "evt_test_2",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_live_vehicle",
          payment_status: "paid",
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: "500.00",
            approved_weekly_price: "250.00",
            car_id: "1",
            checkout_kind: "vehicle",
            payment_link_version: "1",
          },
          customer: "cus_123",
          subscription: "sub_123",
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(200);
    expect(mockState.cars[0].status).toBe("Available");
    expect(mockState.applications[1].status).toBe("Paid");
    expect(mockState.applications[1].pending_checkout_session_id).toBeNull();
    expect(mockState.rentals).toHaveLength(0);
  });

  it("POST /api/stripe/webhook does not crash when restricted-mode replay hits an application that is already Paid", async () => {
    mockHasDirectDatabaseConnection.mockReturnValue(false);
    mockState.applications[1].status = "Paid";
    mockState.applications[1].paid_at = "2026-03-06T00:00:00.000Z";
    mockState.applications[1].pending_checkout_session_id = null;
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: "evt_test_2_paid_replay",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_paid_replay",
          payment_status: "paid",
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: "500.00",
            approved_weekly_price: "250.00",
            car_id: "1",
            checkout_kind: "vehicle",
            payment_link_version: "1",
          },
          customer: "cus_paid_replay",
          subscription: "sub_paid_replay",
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(200);
    expect(mockState.applications[1].status).toBe("Paid");
    expect(mockState.applications[1].paid_at).toBe("2026-03-06T00:00:00.000Z");
    expect(mockState.applications[1].pending_checkout_session_id).toBeNull();
    expect(mockState.rentals).toHaveLength(0);
  });

  it("POST /api/stripe/webhook skips subscription lifecycle updates when strict Stripe rental identity is missing", async () => {
    mockState.cars[0].status = "Rented";
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        bond_paid: 500,
        car_id: 1,
        status: "Active",
        weekly_price: 250,
        start_date: "2026-03-01",
      },
    ];
    mockStripe.subscriptionsRetrieve.mockResolvedValueOnce({
      id: "sub_missing_link",
      metadata: { application_id: APPROVED_APPLICATION_ID, car_id: "1" },
    });
    mockStripe.webhooksConstructEvent.mockReturnValue({
      created: 1_780_000_001,
      id: "evt_test_3",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_failed",
          subscription: "sub_missing_link",
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(200);
    expect(mockState.rentals[0].status).toBe("Active");
  });

  it("POST /api/stripe/webhook handles customer.subscription.created for existing rentals", async () => {
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        bond_paid: 500,
        car_id: 1,
        status: "Pending",
        stripe_subscription_id: "sub_created",
        weekly_price: 250,
        start_date: "2026-03-01",
      },
    ];
    mockStripe.webhooksConstructEvent.mockReturnValue({
      created: 1_780_000_002,
      id: "evt_subscription_created",
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_created",
          status: "active",
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            car_id: "1",
          },
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(200);
    expect(mockState.rentals[0].status).toBe("Active");
  });

  it("POST /api/stripe/webhook ignores an older subscription status event", async () => {
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        bond_paid: 500,
        car_id: 1,
        status: "Active",
        stripe_subscription_id: "sub_ordered",
        weekly_price: 250,
        start_date: "2026-03-01",
      },
    ];
    mockStripe.webhooksConstructEvent
      .mockReturnValueOnce({
        created: 1_780_000_200,
        id: "evt_newer_overdue",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_ordered",
            status: "past_due",
            metadata: { application_id: APPROVED_APPLICATION_ID },
          },
        },
      })
      .mockReturnValueOnce({
        created: 1_780_000_100,
        id: "evt_older_active",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_ordered",
            status: "active",
            metadata: { application_id: APPROVED_APPLICATION_ID },
          },
        },
      });

    for (let requestIndex = 0; requestIndex < 2; requestIndex += 1) {
      const response = await request(app)
        .post("/api/stripe/webhook")
        .set("stripe-signature", "test-signature")
        .set("Content-Type", "application/json")
        .send("{}");
      expect(response.status).toBe(200);
    }

    expect(mockState.rentals[0]).toMatchObject({
      status: "Overdue",
      stripe_status_event_id: "evt_newer_overdue",
      stripe_status_event_terminal: false,
    });
  });

  it("POST /api/stripe/webhook handles invoice.payment_succeeded by restoring active rental state", async () => {
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        bond_paid: 500,
        car_id: 1,
        status: "Overdue",
        stripe_subscription_id: "sub_paid_invoice",
        weekly_price: 250,
        start_date: "2026-03-01",
      },
    ];
    mockStripe.subscriptionsRetrieve.mockResolvedValueOnce({
      id: "sub_paid_invoice",
      status: "active",
      metadata: { application_id: APPROVED_APPLICATION_ID, car_id: "1" },
    });
    mockStripe.webhooksConstructEvent.mockReturnValue({
      created: 1_780_000_003,
      id: "evt_invoice_paid",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_paid",
          subscription: "sub_paid_invoice",
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(200);
    expect(mockState.rentals[0].status).toBe("Active");
  });

  it("POST /api/stripe/webhook marks a future-start application Paid on its first successful invoice", async () => {
    mockState.applications[1].status = "Approved";
    mockState.applications[1].pending_checkout_session_id = "cs_future_start";
    mockState.cars[0].status = "Available";
    mockState.rentals = [];
    mockState.stripe_webhook_events.push({
      checkout_kind: "vehicle",
      checkout_session_id: "cs_future_start",
      received_at: "2026-07-14T00:00:00.000Z",
      stripe_subscription_id: "sub_future_start",
      stripe_event_id: "evt_future_checkout_completed",
    });
    mockStripe.subscriptionsRetrieve.mockResolvedValueOnce({
      id: "sub_future_start",
      status: "active",
      metadata: {
        application_id: APPROVED_APPLICATION_ID,
        checkout_kind: "vehicle",
        payment_link_version: "1",
      },
    });
    mockStripe.checkoutSessionsRetrieve.mockResolvedValueOnce({
      id: "cs_future_start",
      status: "complete",
      payment_status: "no_payment_required",
      customer: "cus_future_start",
      subscription: "sub_future_start",
      metadata: {
        application_id: APPROVED_APPLICATION_ID,
        checkout_kind: "vehicle",
        payment_link_version: "1",
      },
    });
    mockStripe.checkoutSessionsList.mockResolvedValueOnce({
      data: [
        {
          id: "cs_future_start",
          status: "complete",
          payment_status: "no_payment_required",
          customer: "cus_future_start",
          subscription: "sub_future_start",
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            checkout_kind: "vehicle",
            payment_link_version: "1",
          },
        },
      ],
      has_more: false,
    });
    mockStripe.webhooksConstructEvent.mockReturnValue({
      created: 1_780_000_004,
      id: "evt_future_start_invoice_paid",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          amount_paid: 25000,
          id: "in_future_start_paid",
          subscription: "sub_future_start",
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(200);
    expect(mockStripe.checkoutSessionsRetrieve).not.toHaveBeenCalled();
    expect(mockStripe.checkoutSessionsList).toHaveBeenCalledWith({
      limit: 1,
      subscription: "sub_future_start",
    });
    expect(mockState.applications[1].status).toBe("Paid");
    expect(mockState.applications[1].paid_at).toEqual(expect.any(String));
    expect(mockState.applications[1].pending_checkout_session_id).toBeNull();
    expect(mockState.cars[0].status).toBe("Available");
    expect(mockState.rentals).toHaveLength(0);
  });

  it("POST /api/stripe/webhook does not fulfill a future-start application from a zero-dollar invoice", async () => {
    mockState.applications[1].status = "Approved";
    mockState.applications[1].pending_checkout_session_id = "cs_future_zero";
    mockState.rentals = [];
    mockStripe.subscriptionsRetrieve.mockResolvedValueOnce({
      id: "sub_future_zero",
      status: "active",
      metadata: {
        application_id: APPROVED_APPLICATION_ID,
        checkout_kind: "vehicle",
        payment_link_version: "1",
      },
    });
    mockStripe.webhooksConstructEvent.mockReturnValue({
      created: 1_780_000_005,
      id: "evt_future_zero_invoice",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          amount_paid: 0,
          id: "in_future_zero",
          subscription: "sub_future_zero",
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(200);
    expect(mockStripe.checkoutSessionsList).not.toHaveBeenCalled();
    expect(mockState.applications[1].status).toBe("Approved");
    expect(mockState.applications[1].paid_at).toBeNull();
    expect(mockState.applications[1].pending_checkout_session_id).toBe("cs_future_zero");
    expect(mockState.rentals).toHaveLength(0);
  });

  it("POST /api/stripe/webhook clears a pending session only when the terminating session is current", async () => {
    mockState.applications[1].status = "Approved";
    mockState.applications[1].payment_link_version = 1;
    mockState.applications[1].pending_checkout_session_id = "cs_replacement";
    mockStripe.webhooksConstructEvent
      .mockReturnValueOnce({
        id: "evt_delayed_old_expiration",
        type: "checkout.session.expired",
        data: {
          object: {
            id: "cs_superseded",
            metadata: {
              application_id: APPROVED_APPLICATION_ID,
              checkout_kind: "vehicle",
              payment_link_version: "1",
            },
          },
        },
      })
      .mockReturnValueOnce({
        id: "evt_current_expiration",
        type: "checkout.session.expired",
        data: {
          object: {
            id: "cs_replacement",
            metadata: {
              application_id: APPROVED_APPLICATION_ID,
              checkout_kind: "vehicle",
              payment_link_version: "1",
            },
          },
        },
      });

    const delayedResponse = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(delayedResponse.status).toBe(200);
    expect(mockState.applications[1].pending_checkout_session_id).toBe("cs_replacement");

    const currentResponse = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(currentResponse.status).toBe(200);
    expect(mockState.applications[1].pending_checkout_session_id).toBeNull();
  });

  it("POST /api/stripe/webhook sends stale checkout sessions to manual review instead of activating the wrong car", async () => {
    mockState.cars[1].status = "Available";
    mockState.applications[1].assigned_car_id = 2;
    mockState.applications[1].approved_bond = 600;
    mockState.applications[1].approved_weekly_price = 275;
    mockState.applications[1].payment_link_version = 2;
    mockState.applications[1].status = "Approved";
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: "evt_test_4",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_stale_vehicle",
          payment_status: "paid",
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: "500.00",
            approved_weekly_price: "250.00",
            car_id: "1",
            checkout_kind: "vehicle",
            payment_link_version: "1",
          },
          customer: "cus_stale",
          subscription: "sub_stale",
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(200);
    expect(mockState.rentals).toHaveLength(0);
    expect(mockState.cars[0].status).toBe("Available");
    expect(mockState.cars[1].status).toBe("Available");
    expect(mockState.applications[1].status).toBe("Payment Review");
    expect(mockState.applications[1].pending_checkout_session_id).toBe(
      "cs_stale_vehicle",
    );
  });

  it("POST /api/stripe/webhook leaves an existing rental unchanged while recording payment", async () => {
    mockState.cars[0].status = "Available";
    mockState.applications[1].status = "Approved";
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        car_id: 1,
        status: "Pending",
        weekly_price: 0,
        bond_paid: 0,
        start_date: "2026-03-01",
      },
    ];
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: "evt_test_5",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_retry_vehicle",
          payment_status: "paid",
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: "500.00",
            approved_weekly_price: "250.00",
            car_id: "1",
            checkout_kind: "vehicle",
            payment_link_version: "1",
          },
          customer: "cus_123",
          subscription: "sub_retry",
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(200);
    expect(mockState.rentals[0]).toMatchObject({
      bond_paid: 0,
      weekly_price: 0,
      status: "Pending",
    });
    expect(mockState.rentals[0].stripe_subscription_id).toBeUndefined();
    expect(mockState.cars[0].status).toBe("Available");
    expect(mockState.applications[1].status).toBe("Paid");
  });

  it("POST /api/stripe/webhook ignores replayed completions for an already active rental", async () => {
    mockState.cars[0].status = "Rented";
    mockState.applications[1].status = "Paid";
    mockState.applications[1].paid_at = "2026-03-08T00:00:00.000Z";
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        bond_paid: 500,
        car_id: 1,
        status: "Active",
        weekly_price: 250,
        start_date: "2026-03-01",
        stripe_subscription_id: "sub_replay",
      },
    ];
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: "evt_test_6",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_replayed",
          payment_status: "paid",
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: "500.00",
            approved_weekly_price: "250.00",
            car_id: "1",
            checkout_kind: "vehicle",
            payment_link_version: "1",
          },
          customer: "cus_replay",
          subscription: "sub_replay",
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(200);
    expect(mockState.rentals).toHaveLength(1);
    expect(mockState.rentals[0]).toMatchObject({
      id: 20,
      start_date: "2026-03-01",
      stripe_subscription_id: "sub_replay",
    });
    expect(mockState.applications[1].paid_at).toBe("2026-03-08T00:00:00.000Z");
  });

  it("POST /api/stripe/webhook ignores duplicate delivery for the same Stripe event id", async () => {
    const duplicateEvent = {
      id: "evt_duplicate_delivery",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_live_vehicle",
          payment_status: "paid",
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: "500.00",
            approved_weekly_price: "250.00",
            car_id: "1",
            checkout_kind: "vehicle",
            payment_link_version: "1",
          },
          customer: "cus_dup",
          subscription: "sub_dup",
        },
      },
    };

    mockStripe.webhooksConstructEvent.mockReturnValue(duplicateEvent);

    const first = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(first.status).toBe(200);
    expect(mockState.stripe_webhook_events).toHaveLength(2);
    expect(
      mockState.stripe_webhook_events.some(
        (event) =>
          event.stripe_event_id === "fulfill:vehicle-checkout:cs_live_vehicle",
      ),
    ).toBe(true);
    expect(mockState.rentals).toHaveLength(0);

    const second = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(second.status).toBe(200);
    expect(mockState.stripe_webhook_events).toHaveLength(2);
    expect(mockState.rentals).toHaveLength(0);
  });

  it("POST /api/stripe/webhook skips replayed fulfillment when the side effects were already committed before ledger finalization failed", async () => {
    mockState.cars[0].status = "Rented";
    mockState.applications[1].status = "Paid";
    mockState.applications[1].paid_at = "2026-03-08T00:00:00.000Z";
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        bond_paid: 500,
        car_id: 1,
        status: "Active",
        weekly_price: 250,
        start_date: "2026-03-01",
        stripe_subscription_id: "sub_finalization_gap",
      },
    ];
    mockState.stripe_webhook_events = [
      {
        id: 900,
        stripe_event_id: "evt_finalization_gap",
        event_type: "checkout.session.completed",
        status: "failed",
        error_message: "transient:Failed to finalize Stripe webhook ledger row",
      },
      {
        id: 901,
        stripe_event_id: "fulfill:vehicle-checkout:cs_finalization_gap",
        event_type: "vehicle_checkout.fulfillment.processed",
        processed_at: "2026-03-08T00:00:00.000Z",
      },
    ];
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: "evt_finalization_gap",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_finalization_gap",
          payment_status: "paid",
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: "500.00",
            approved_weekly_price: "250.00",
            car_id: "1",
            checkout_kind: "vehicle",
            payment_link_version: "1",
          },
          customer: "cus_finalization_gap",
          subscription: "sub_finalization_gap",
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(200);
    expect(mockState.rentals).toHaveLength(1);
    expect(mockState.rentals[0].stripe_subscription_id).toBe(
      "sub_finalization_gap",
    );
    expect(
      mockState.stripe_webhook_events.find(
        (event) => event.stripe_event_id === "evt_finalization_gap",
      )?.status,
    ).toBe("processed");
  });

  it("POST /api/stripe/webhook retries stale in-flight ledger events after reclaiming the claim", async () => {
    const staleUpdatedAt = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    mockState.stripe_webhook_events = [
      {
        id: 999,
        stripe_event_id: "evt_stale_processing",
        event_type: "checkout.session.completed",
        status: "processing",
        received_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
        updated_at: staleUpdatedAt,
      },
    ];

    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: "evt_stale_processing",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_stale_reclaim",
          payment_status: "paid",
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: "500.00",
            approved_weekly_price: "250.00",
            car_id: "1",
            checkout_kind: "vehicle",
            payment_link_version: "1",
          },
          customer: "cus_stale_reclaim",
          subscription: "sub_stale_reclaim",
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(200);
    expect(mockState.rentals).toHaveLength(0);
    expect(mockState.stripe_webhook_events).toHaveLength(2);
    expect(
      mockState.stripe_webhook_events.find(
        (event) => event.stripe_event_id === "evt_stale_processing",
      )?.status,
    ).toBe("processed");
    expect(
      mockState.stripe_webhook_events.find(
        (event) => event.stripe_event_id === "evt_stale_processing",
      )?.updated_at,
    ).not.toBe(staleUpdatedAt);
  });

  it("POST /api/stripe/webhook does not reclaim an in-flight ledger event before the TTL", async () => {
    mockState.stripe_webhook_events = [
      {
        id: 1000,
        stripe_event_id: "evt_fresh_processing",
        event_type: "checkout.session.completed",
        status: "processing",
        received_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      },
    ];

    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: "evt_fresh_processing",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_fresh_processing",
          payment_status: "paid",
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: "500.00",
            approved_weekly_price: "250.00",
            car_id: "1",
            checkout_kind: "vehicle",
            payment_link_version: "1",
          },
          customer: "cus_fresh_processing",
          subscription: "sub_fresh_processing",
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(409);
    expect(res.text).toBe("Webhook event is currently processing");
    expect(mockState.rentals).toHaveLength(0);
    expect(
      mockState.stripe_webhook_events.find(
        (event) => event.stripe_event_id === "evt_fresh_processing",
      )?.status,
    ).toBe("processing");
  });

  it("POST /api/stripe/webhook records permanent failures without asking Stripe to retry forever", async () => {
    mockStripe.subscriptionsRetrieve.mockRejectedValueOnce(
      Object.assign(new Error("No such subscription: sub_missing_forever"), {
        statusCode: 404,
        type: "StripeInvalidRequestError",
      }),
    );
    mockStripe.webhooksConstructEvent.mockReturnValue({
      created: 1_780_000_005,
      id: "evt_permanent_failure",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_missing_forever",
          subscription: "sub_missing_forever",
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(200);
    expect(
      mockState.stripe_webhook_events.find(
        (event) => event.stripe_event_id === "evt_permanent_failure",
      ),
    ).toMatchObject({
      status: "processed",
    });
    expect(
      mockState.stripe_webhook_events.find(
        (event) => event.stripe_event_id === "evt_permanent_failure",
      )?.error_message,
    ).toContain("permanent:No such subscription: sub_missing_forever");
  });

  it("POST /api/stripe/webhook keeps transient failures retryable", async () => {
    mockStripe.subscriptionsRetrieve.mockRejectedValueOnce(
      Object.assign(new Error("Connection to Stripe dropped mid-request"), {
        type: "StripeConnectionError",
      }),
    );
    mockStripe.webhooksConstructEvent.mockReturnValue({
      created: 1_780_000_006,
      id: "evt_transient_failure",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_transient_failure",
          subscription: "sub_transient_failure",
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(500);
    expect(
      mockState.stripe_webhook_events.find(
        (event) => event.stripe_event_id === "evt_transient_failure",
      ),
    ).toMatchObject({
      status: "failed",
    });
    expect(
      mockState.stripe_webhook_events.find(
        (event) => event.stripe_event_id === "evt_transient_failure",
      )?.error_message,
    ).toContain("transient:Connection to Stripe dropped mid-request");
  });

  it("POST /api/stripe/webhook records payment without touching another active rental", async () => {
    mockState.rentals = [
      {
        id: 20,
        application_id: BLOCKING_APPLICATION_ID,
        bond_paid: 500,
        car_id: 1,
        status: "Active",
        weekly_price: 250,
        start_date: "2026-03-01",
      },
    ];
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: "evt_test_7",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_live_vehicle",
          payment_status: "paid",
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: "500.00",
            approved_weekly_price: "250.00",
            car_id: "1",
            checkout_kind: "vehicle",
            payment_link_version: "1",
          },
          customer: "cus_123",
          subscription: "sub_123",
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(200);
    expect(mockState.rentals).toHaveLength(1);
    expect(mockState.rentals[0].application_id).toBe(BLOCKING_APPLICATION_ID);
    expect(mockState.applications[1].status).toBe("Paid");
    expect(mockState.applications[1].paid_at).toBeTruthy();
    expect(mockState.applications[1].pending_checkout_session_id).toBeNull();
  });

  it("POST /api/stripe/webhook preserves maintenance state while recording payment", async () => {
    mockState.cars[0].status = "Maintenance";
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: "evt_test_8",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_vehicle_maintenance",
          payment_status: "paid",
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: "500.00",
            approved_weekly_price: "250.00",
            car_id: "1",
            checkout_kind: "vehicle",
            payment_link_version: "1",
          },
          customer: "cus_123",
          subscription: "sub_maintenance",
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(200);
    expect(mockState.rentals).toHaveLength(0);
    expect(mockState.cars[0].status).toBe("Maintenance");
    expect(mockState.applications[1].status).toBe("Paid");
    expect(mockState.applications[1].pending_checkout_session_id).toBeNull();
  });

  it("POST /api/stripe/webhook completes a Payment Review replay without activating a rental", async () => {
    mockState.applications[1].status = "Payment Review";
    mockState.applications[1].paid_at = "2026-03-06T00:00:00.000Z";
    mockState.applications[1].pending_checkout_session_id = "cs_vehicle_resume";
    mockState.cars[0].status = "Available";
    mockStripe.webhooksConstructEvent.mockReturnValue({
      id: "evt_test_9",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_vehicle_resume",
          payment_status: "paid",
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            approved_bond: "500.00",
            approved_weekly_price: "250.00",
            car_id: "1",
            checkout_kind: "vehicle",
            payment_link_version: "1",
          },
          customer: "cus_resume",
          subscription: "sub_resume",
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(200);
    expect(mockState.applications[1].status).toBe("Paid");
    expect(mockState.applications[1].paid_at).toBe("2026-03-06T00:00:00.000Z");
    expect(mockState.applications[1].pending_checkout_session_id).toBeNull();
    expect(mockState.cars[0].status).toBe("Available");
    expect(mockState.rentals).toHaveLength(0);
  });

  it("POST /api/stripe/webhook keeps the car rented when another live rental still exists", async () => {
    mockState.cars[0].status = "Rented";
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        bond_paid: 500,
        car_id: 1,
        status: "Active",
        weekly_price: 250,
        start_date: "2026-03-01",
        stripe_subscription_id: "sub_completed",
      },
      {
        id: 21,
        application_id: BLOCKING_APPLICATION_ID,
        bond_paid: 500,
        car_id: 1,
        status: "Active",
        weekly_price: 260,
        start_date: "2026-03-05",
        stripe_subscription_id: "sub_live",
      },
    ];
    mockStripe.webhooksConstructEvent.mockReturnValue({
      created: 1_780_000_007,
      id: "evt_test_10",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_completed",
          cancellation_details: {
            comment: null,
            feedback: null,
            reason: "cancellation_requested",
          },
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            car_id: "1",
          },
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(200);
    expect(mockState.cars[0].status).toBe("Rented");
    expect(mockState.rentals.find((rental) => rental.id === 20)?.status).toBe(
      "Completed",
    );
    expect(mockState.rentals.find((rental) => rental.id === 21)?.status).toBe(
      "Active",
    );
  });

  it("POST /api/stripe/webhook keeps the car unavailable after involuntary subscription cancellation", async () => {
    mockState.cars[0].status = "Rented";
    mockState.rentals = [
      {
        id: 20,
        application_id: APPROVED_APPLICATION_ID,
        bond_paid: 500,
        car_id: 1,
        status: "Active",
        weekly_price: 250,
        start_date: "2026-03-01",
        stripe_subscription_id: "sub_failed",
      },
    ];
    mockStripe.webhooksConstructEvent.mockReturnValue({
      created: 1_780_000_008,
      id: "evt_test_11",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_failed",
          cancellation_details: {
            comment: null,
            feedback: null,
            reason: "payment_failed",
          },
          metadata: {
            application_id: APPROVED_APPLICATION_ID,
            car_id: "1",
          },
        },
      },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test-signature")
      .set("Content-Type", "application/json")
      .send("{}");

    expect(res.status).toBe(200);
    expect(mockState.cars[0].status).toBe("Rented");
    expect(mockState.rentals.find((rental) => rental.id === 20)?.status).toBe(
      "Cancelled",
    );
  });
});
