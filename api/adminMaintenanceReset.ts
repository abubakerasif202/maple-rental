import type { PoolClient } from 'pg';

import { db } from './db/index.js';
import { withPostgresTransaction, hasDirectDatabaseConnection } from './db/postgres.js';
import {
  getRecordIdSet,
  isImportedApplicationRecord,
  isImportedManualInvoiceRecord,
  isImportedOperationalCustomerRecord,
  isImportedOperationalInvoiceRecord,
  isImportedRentalRecord,
} from './importedDataFilters.js';

export const IMPORTED_DATA_RESET_CONFIRMATION_PHRASE = 'RESET IMPORTED DATA AND FINANCIALS';
export const IMPORTED_DATA_RESET_FEATURE_FLAG = 'MAPLE_ENABLE_IMPORTED_DATA_RESET';

type MaintenanceResetStepErrorInput = {
  step: string;
  table?: string;
  message: string;
  code?: string | null;
};

export class MaintenanceResetStepError extends Error {
  step: string;
  table?: string;
  code?: string | null;

  constructor(input: MaintenanceResetStepErrorInput) {
    super(input.message);
    this.name = 'MaintenanceResetStepError';
    this.step = input.step;
    this.table = input.table;
    this.code = input.code || null;
  }
}

export class MaintenanceResetDisabledError extends Error {
  code: string;

  constructor(message = 'Imported data reset is disabled.') {
    super(message);
    this.name = 'MaintenanceResetDisabledError';
    this.code = 'MAINTENANCE_RESET_DISABLED';
  }
}

type TableQueryResult = {
  rows: Array<Record<string, any>>;
  skipped: boolean;
  reason?: 'table_not_found' | 'column_not_found';
};

export type ResetCounts = {
  applications: number;
  bookings: number;
  customers: number;
  rentals: number;
  leaseAgreements: number;
  tollTransferNotices: number;
  tollTransferNoticeAuditEvents: number;
  invoices: number;
  invoiceItems: number;
  invoiceLineItems: number;
  payments: number;
  financialTransactions: number;
  manualInvoices: number;
  manualInvoiceItems: number;
  financialRows: number;
  stripeWebhookEvents: number;
};

export type ResetCriteria = {
  applications: string;
  bookings: string;
  customers: string;
  rentals: string;
  agreements: string;
  tollNotices: string;
  invoices: string;
  manualInvoices: string;
  stripeWebhookEvents: string;
};

export type ResetSummary = {
  counts: ResetCounts;
  criteria: ResetCriteria;
  preserved: {
    adminUsers: true;
    stripeExternalRecords: true;
    stripeWebhookEvents: true;
  };
};

type ResetRows = {
  applications: Array<Record<string, any>>;
  bookings: Array<Record<string, any>>;
  customers: Array<Record<string, any>>;
  rentals: Array<Record<string, any>>;
  leaseAgreements: Array<Record<string, any>>;
  tollTransferNotices: Array<Record<string, any>>;
  tollTransferNoticeAuditEvents: Array<Record<string, any>>;
  invoices: Array<Record<string, any>>;
  invoiceItems: Array<Record<string, any>>;
  invoiceLineItems: Array<Record<string, any>>;
  payments: Array<Record<string, any>>;
  financialTransactions: Array<Record<string, any>>;
  manualInvoices: Array<Record<string, any>>;
  manualInvoiceItems: Array<Record<string, any>>;
};

type ResetPlan = ResetSummary & {
  rows: ResetRows;
  skipped: Record<keyof ResetRows, boolean>;
};

const OPTIONAL_RESET_TABLES = new Set([
  'invoice_items',
  'invoice_line_items',
  'payments',
  'financial_transactions',
  'maintenance_reset_audit_events',
]);

const emptyCounts = (): ResetCounts => ({
  applications: 0,
  bookings: 0,
  customers: 0,
  rentals: 0,
  leaseAgreements: 0,
  tollTransferNotices: 0,
  tollTransferNoticeAuditEvents: 0,
  invoices: 0,
  invoiceItems: 0,
  invoiceLineItems: 0,
  payments: 0,
  financialTransactions: 0,
  manualInvoices: 0,
  manualInvoiceItems: 0,
  financialRows: 0,
  stripeWebhookEvents: 0,
});

const isMissingTableOrColumnError = (error: any) => {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return (
    code === '42p01' ||
    code === 'pgrst205' ||
    code === '42703' ||
    message.includes('does not exist') ||
    (message.includes('column') && message.includes('does not exist')) ||
    (message.includes('relation') && message.includes('does not exist'))
  );
};

export const isImportedDataResetEnabled = () =>
  String(process.env[IMPORTED_DATA_RESET_FEATURE_FLAG] || '').trim().toLowerCase() === 'true';

const toSafeErrorCode = (error: any) => String(error?.code || error?.name || null);

const wrapMaintenanceStepError = (
  error: unknown,
  {
    message,
    step,
    table,
  }: {
    step: string;
    table?: string;
    message: string;
  },
) => {
  if (error instanceof MaintenanceResetStepError) {
    return error;
  }

  return new MaintenanceResetStepError({
    step,
    table,
    message,
    code: toSafeErrorCode(error),
  });
};

const quoteIdentifier = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;

const getExistingPublicTables = async (
  tableNames: string[],
  client?: PoolClient,
) => {
  if (!client || tableNames.length === 0) {
    return new Set<string>(tableNames);
  }

  const result = await client.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [tableNames],
  );

  return new Set<string>(
    result.rows
      .map((row: Record<string, any>) => String(row.table_name || '').trim())
      .filter(Boolean),
  );
};

const fetchRows = async (table: string, client?: PoolClient) => {
  if (client) {
    const result = await client.query(`SELECT * FROM public.${quoteIdentifier(table)}`);
    return result.rows as Array<Record<string, any>>;
  }

  const { data, error } = await db.from(table).select('*');
  if (error) throw error;
  return (data || []) as Array<Record<string, any>>;
};

const fetchRowsSafe = async (
  table: string,
  client?: PoolClient,
  existingTables?: Set<string>,
): Promise<TableQueryResult> => {
  if (client && OPTIONAL_RESET_TABLES.has(table) && existingTables && !existingTables.has(table)) {
    return {
      rows: [],
      skipped: true,
      reason: 'table_not_found',
    };
  }

  try {
    const rows = await fetchRows(table, client);
    return { rows, skipped: false };
  } catch (error: any) {
    if (isMissingTableOrColumnError(error)) {
      return {
        rows: [],
        skipped: true,
        reason: String(error?.code || '').toLowerCase() === '42703' ? 'column_not_found' : 'table_not_found',
      };
    }

    throw error;
  }
};

const countRowsSafe = async (table: string, client?: PoolClient) => {
  try {
    if (client) {
      const result = await client.query(
        `SELECT count(*)::int AS count FROM public.${quoteIdentifier(table)}`,
      );
      return Number(result.rows[0]?.count || 0);
    }

    const { count, error } = await db.from(table).select('id', { count: 'exact', head: true });
    if (error) throw error;
    return count || 0;
  } catch (error: any) {
    if (isMissingTableOrColumnError(error)) {
      return 0;
    }

    throw error;
  }
};

const getValue = (row: Record<string, any>, ...keys: string[]) => {
  for (const key of keys) {
    if (row[key] != null) {
      return row[key];
    }
  }

  return null;
};

const idString = (value: unknown) => (value == null ? '' : String(value));

const hasSetValue = (set: Set<string>, value: unknown) => {
  const normalized = idString(value);
  return normalized ? set.has(normalized) : false;
};

const hasLegacyApplicationId = (row: Record<string, any>) =>
  getValue(row, 'legacy_application_id', 'legacyApplicationId') != null;

const filterLinkedToImportedApplications = (
  rows: Array<Record<string, any>>,
  importedApplicationIds: Set<string>,
) =>
  rows.filter(
    (row) =>
      hasLegacyApplicationId(row) ||
      hasSetValue(importedApplicationIds, getValue(row, 'application_id', 'applicationId')),
  );

const filterInvoiceChildren = (
  rows: Array<Record<string, any>>,
  importedInvoiceIds: Set<string>,
) => rows.filter((row) => hasSetValue(importedInvoiceIds, getValue(row, 'invoice_id', 'invoiceId')));

const buildCounts = (rows: ResetRows, stripeWebhookEvents: number): ResetCounts => {
  const counts = {
    ...emptyCounts(),
    applications: rows.applications.length,
    bookings: rows.bookings.length,
    customers: rows.customers.length,
    rentals: rows.rentals.length,
    leaseAgreements: rows.leaseAgreements.length,
    tollTransferNotices: rows.tollTransferNotices.length,
    tollTransferNoticeAuditEvents: rows.tollTransferNoticeAuditEvents.length,
    invoices: rows.invoices.length,
    invoiceItems: rows.invoiceItems.length,
    invoiceLineItems: rows.invoiceLineItems.length,
    payments: rows.payments.length,
    financialTransactions: rows.financialTransactions.length,
    manualInvoices: rows.manualInvoices.length,
    manualInvoiceItems: rows.manualInvoiceItems.length,
    stripeWebhookEvents,
  };

  counts.financialRows =
    counts.invoices +
    counts.invoiceItems +
    counts.invoiceLineItems +
    counts.payments +
    counts.financialTransactions +
    counts.manualInvoices +
    counts.manualInvoiceItems;

  return counts;
};

export const buildResetSummary = (counts: ResetCounts): ResetSummary => ({
  counts,
  criteria: {
    applications:
      'legacy_id/legacyId present, @example.invalid email, 0000000000 phone, LEGACY-* license, or live-fleet import experience marker',
    bookings: 'legacy_application_id present or linked to imported applications',
    customers: 'legacy/demo/test/import source, @example.invalid email, 0000000000 phone, or linked to imported applications/rentals',
    rentals: 'legacy_application_id present or linked to imported applications',
    agreements: 'lease agreement linked to imported applications',
    tollNotices: 'toll transfer notice linked to imported applications/rentals/customers',
    invoices: 'legacy/demo/test/import source or linked to imported customers',
    manualInvoices: 'manual invoice text explicitly contains legacy/demo/test/import markers',
    stripeWebhookEvents: 'preserved for Stripe audit history; counted only',
  },
  preserved: {
    adminUsers: true,
    stripeExternalRecords: true,
    stripeWebhookEvents: true,
  },
});

export const getImportedDataResetPlan = async (client?: PoolClient): Promise<ResetPlan> => {
  let existingOptionalTables: Set<string> | undefined;

  try {
    existingOptionalTables = await getExistingPublicTables(
      [...OPTIONAL_RESET_TABLES],
      client,
    );
  } catch (error) {
    throw wrapMaintenanceStepError(error, {
      step: 'preflight_optional_tables',
      message: 'Reset failed while checking optional maintenance tables.',
    });
  }

  const loadTable = async (table: string) => {
    try {
      return await fetchRowsSafe(table, client, existingOptionalTables);
    } catch (error) {
      throw wrapMaintenanceStepError(error, {
        step: `load_${table}`,
        table,
        message: `Reset failed while loading ${table.replace(/_/g, ' ')} rows.`,
      });
    }
  };

  const applicationsResult = await loadTable('applications');
  const rentalsResult = await loadTable('rentals');
  const customersResult = await loadTable('customers');
  const invoicesResult = await loadTable('invoices');
  const manualInvoicesResult = await loadTable('manual_invoices');
  const manualInvoiceItemsResult = await loadTable('manual_invoice_items');
  const invoiceItemsResult = await loadTable('invoice_items');
  const invoiceLineItemsResult = await loadTable('invoice_line_items');
  const paymentsResult = await loadTable('payments');
  const financialTransactionsResult = await loadTable('financial_transactions');
  const bookingsResult = await loadTable('bookings');
  const leaseAgreementsResult = await loadTable('lease_agreements');
  const tollNoticesResult = await loadTable('toll_transfer_notices');
  const tollNoticeAuditEventsResult = await loadTable('toll_transfer_notice_audit_events');

  const applicationRows = applicationsResult.rows.filter(isImportedApplicationRecord);
  const applicationIds = getRecordIdSet(applicationRows);

  const rentalRows = rentalsResult.rows.filter((rental) =>
    isImportedRentalRecord(rental, applicationIds),
  );
  const rentalIds = getRecordIdSet(rentalRows);

  const customerRows = customersResult.rows.filter((customer) =>
    isImportedOperationalCustomerRecord(customer, applicationIds, rentalIds),
  );
  const customerIds = getRecordIdSet(customerRows);

  const invoiceRows = invoicesResult.rows.filter((invoice) =>
    isImportedOperationalInvoiceRecord(invoice, customerIds),
  );
  const invoiceIds = getRecordIdSet(invoiceRows);

  const manualInvoiceRows = manualInvoicesResult.rows.filter(isImportedManualInvoiceRecord);
  const manualInvoiceIds = getRecordIdSet(manualInvoiceRows);
  const manualInvoiceItemRows = manualInvoiceItemsResult.rows.filter((item) =>
    hasSetValue(manualInvoiceIds, getValue(item, 'invoice_id', 'invoiceId')),
  );

  const invoiceItemRows = filterInvoiceChildren(invoiceItemsResult.rows, invoiceIds);
  const invoiceLineItemRows = filterInvoiceChildren(invoiceLineItemsResult.rows, invoiceIds);
  const invoiceLineOrItemIds = new Set([
    ...invoiceItemRows.map((row) => idString(row.id)).filter(Boolean),
    ...invoiceLineItemRows.map((row) => idString(row.id)).filter(Boolean),
  ]);

  const paymentRows = filterInvoiceChildren(paymentsResult.rows, invoiceIds);
  const financialTransactionRows = financialTransactionsResult.rows.filter(
    (row) =>
      hasSetValue(invoiceIds, getValue(row, 'invoice_id', 'invoiceId')) ||
      hasSetValue(invoiceLineOrItemIds, getValue(row, 'invoice_line_item_id', 'invoiceLineItemId')) ||
      hasSetValue(invoiceLineOrItemIds, getValue(row, 'line_item_id', 'lineItemId')),
  );

  const bookingRows = filterLinkedToImportedApplications(bookingsResult.rows, applicationIds);
  const leaseAgreementRows = filterLinkedToImportedApplications(
    leaseAgreementsResult.rows,
    applicationIds,
  );

  const tollNoticeRows = tollNoticesResult.rows.filter(
    (notice) =>
      hasSetValue(applicationIds, getValue(notice, 'application_id', 'applicationId')) ||
      hasSetValue(rentalIds, getValue(notice, 'rental_id', 'rentalId')) ||
      hasSetValue(customerIds, getValue(notice, 'customer_id', 'customerId')),
  );
  const tollNoticeIds = getRecordIdSet(tollNoticeRows);
  const tollNoticeAuditRows = tollNoticeAuditEventsResult.rows.filter((event) =>
    hasSetValue(
      tollNoticeIds,
      getValue(event, 'toll_transfer_notice_id', 'tollTransferNoticeId'),
    ),
  );

  const rows: ResetRows = {
    applications: applicationRows,
    bookings: bookingRows,
    customers: customerRows,
    rentals: rentalRows,
    leaseAgreements: leaseAgreementRows,
    tollTransferNotices: tollNoticeRows,
    tollTransferNoticeAuditEvents: tollNoticeAuditRows,
    invoices: invoiceRows,
    invoiceItems: invoiceItemRows,
    invoiceLineItems: invoiceLineItemRows,
    payments: paymentRows,
    financialTransactions: financialTransactionRows,
    manualInvoices: manualInvoiceRows,
    manualInvoiceItems: manualInvoiceItemRows,
  };

  let stripeWebhookEvents = 0;
  try {
    stripeWebhookEvents = await countRowsSafe('stripe_webhook_events', client);
  } catch (error) {
    throw wrapMaintenanceStepError(error, {
      step: 'count_stripe_webhook_events',
      table: 'stripe_webhook_events',
      message: 'Reset failed while counting stripe webhook event rows.',
    });
  }

  return {
    ...buildResetSummary(buildCounts(rows, stripeWebhookEvents)),
    rows,
    skipped: {
      applications: applicationsResult.skipped,
      bookings: bookingsResult.skipped,
      customers: customersResult.skipped,
      rentals: rentalsResult.skipped,
      leaseAgreements: leaseAgreementsResult.skipped,
      tollTransferNotices: tollNoticesResult.skipped,
      tollTransferNoticeAuditEvents: tollNoticeAuditEventsResult.skipped,
      invoices: invoicesResult.skipped,
      invoiceItems: invoiceItemsResult.skipped,
      invoiceLineItems: invoiceLineItemsResult.skipped,
      payments: paymentsResult.skipped,
      financialTransactions: financialTransactionsResult.skipped,
      manualInvoices: manualInvoicesResult.skipped,
      manualInvoiceItems: manualInvoiceItemsResult.skipped,
    },
  };
};

const deleteRowsByIds = async (
  table: string,
  ids: Array<string | number>,
  client?: PoolClient,
) => {
  if (ids.length === 0) {
    return 0;
  }

  if (client) {
    const result = await client.query(
      `DELETE FROM public.${quoteIdentifier(table)} WHERE id::text = ANY($1::text[])`,
      [ids.map(String)],
    );
    return result.rowCount || 0;
  }

  let query = db.from(table).delete();
  query = query.in('id', ids as never[]);
  const selected = query.select('id') as unknown as {
    then?: PromiseLike<{ error: unknown }>['then'];
    maybeSingle?: () => Promise<{ error: unknown }>;
    single?: () => Promise<{ error: unknown }>;
  };

  if (typeof selected.then === 'function') {
    const { error } = await (selected as PromiseLike<{ error: unknown }>);
    if (error) throw error;
    return ids.length;
  }

  if (typeof selected.maybeSingle === 'function') {
    const { error } = await selected.maybeSingle();
    if (error) throw error;
    return ids.length;
  }

  if (typeof selected.single === 'function') {
    const { error } = await selected.single();
    if (error) throw error;
    return ids.length;
  }

  throw new Error(`Unsupported delete query shape for ${table}`);
};

const deleteStep = async (
  step: string,
  table: string,
  rows: Array<Record<string, any>>,
  client?: PoolClient,
) => {
  try {
    return await deleteRowsByIds(
      table,
      rows.map((row) => String(row.id)),
      client,
    );
  } catch (error: any) {
    throw new MaintenanceResetStepError({
      step,
      table,
      message: `Reset failed while deleting ${step.replace(/^delete_/, '').replace(/_/g, ' ')} rows.`,
      code: String(error?.code || error?.name || null),
    });
  }
};

const insertMaintenanceAuditEvent = async ({
  adminEmail,
  client,
  counts,
  reason,
}: {
  adminEmail?: string | null;
  client?: PoolClient;
  counts: ResetCounts;
  reason?: string | null;
}) => {
  const metadata = {
    counts,
    preserved: {
      adminUsers: true,
      stripeExternalRecords: true,
      stripeWebhookEvents: true,
    },
    reason: reason || null,
  };

  try {
    if (client) {
      const existingTables = await getExistingPublicTables(
        ['maintenance_reset_audit_events'],
        client,
      );
      if (!existingTables.has('maintenance_reset_audit_events')) {
        return;
      }

      await client.query(
        `
          INSERT INTO public.maintenance_reset_audit_events (action, actor, metadata)
          VALUES ($1, $2, $3::jsonb)
        `,
        ['imported_data_reset', adminEmail || null, JSON.stringify(metadata)],
      );
      return;
    }

    const auditTable = db.from('maintenance_reset_audit_events') as unknown as {
      insert?: (rows: Array<Record<string, unknown>>) => PromiseLike<{ error?: unknown }> | unknown;
    };

    if (typeof auditTable.insert !== 'function') {
      return;
    }

    await auditTable.insert([
      {
        action: 'imported_data_reset',
        actor: adminEmail || null,
        metadata,
      },
    ]);
  } catch (error: any) {
    if (!isMissingTableOrColumnError(error)) {
      console.warn('Failed to record maintenance reset audit event:', error);
    }
  }
};

const performDeletes = async (
  plan: ResetPlan,
  client: PoolClient | undefined,
  options: { adminEmail?: string | null; reason?: string | null },
) => {
  const deletedTollTransferNoticeAuditEvents = await deleteStep(
    'delete_toll_transfer_notice_audit_events',
    'toll_transfer_notice_audit_events',
    plan.rows.tollTransferNoticeAuditEvents,
    client,
  );
  const deletedTollTransferNotices = await deleteStep(
    'delete_toll_transfer_notices',
    'toll_transfer_notices',
    plan.rows.tollTransferNotices,
    client,
  );
  const deletedFinancialTransactions = await deleteStep(
    'delete_financial_transactions',
    'financial_transactions',
    plan.rows.financialTransactions,
    client,
  );
  const deletedPayments = await deleteStep('delete_payments', 'payments', plan.rows.payments, client);
  const deletedInvoiceItems = await deleteStep(
    'delete_invoice_items',
    'invoice_items',
    plan.rows.invoiceItems,
    client,
  );
  const deletedInvoiceLineItems = await deleteStep(
    'delete_invoice_line_items',
    'invoice_line_items',
    plan.rows.invoiceLineItems,
    client,
  );
  const deletedManualInvoiceItems = await deleteStep(
    'delete_manual_invoice_items',
    'manual_invoice_items',
    plan.rows.manualInvoiceItems,
    client,
  );
  const deletedManualInvoices = await deleteStep(
    'delete_manual_invoices',
    'manual_invoices',
    plan.rows.manualInvoices,
    client,
  );
  const deletedInvoices = await deleteStep('delete_invoices', 'invoices', plan.rows.invoices, client);
  const deletedLeaseAgreements = await deleteStep(
    'delete_lease_agreements',
    'lease_agreements',
    plan.rows.leaseAgreements,
    client,
  );
  const deletedBookings = await deleteStep('delete_bookings', 'bookings', plan.rows.bookings, client);
  const deletedRentals = await deleteStep('delete_rentals', 'rentals', plan.rows.rentals, client);
  const deletedApplications = await deleteStep(
    'delete_applications',
    'applications',
    plan.rows.applications,
    client,
  );
  const deletedCustomers = await deleteStep('delete_customers', 'customers', plan.rows.customers, client);

  const counts: ResetCounts = {
    applications: deletedApplications,
    bookings: deletedBookings,
    customers: deletedCustomers,
    rentals: deletedRentals,
    leaseAgreements: deletedLeaseAgreements,
    tollTransferNotices: deletedTollTransferNotices,
    tollTransferNoticeAuditEvents: deletedTollTransferNoticeAuditEvents,
    invoices: deletedInvoices,
    invoiceItems: deletedInvoiceItems,
    invoiceLineItems: deletedInvoiceLineItems,
    payments: deletedPayments,
    financialTransactions: deletedFinancialTransactions,
    manualInvoices: deletedManualInvoices,
    manualInvoiceItems: deletedManualInvoiceItems,
    financialRows:
      deletedInvoices +
      deletedInvoiceItems +
      deletedInvoiceLineItems +
      deletedPayments +
      deletedFinancialTransactions +
      deletedManualInvoices +
      deletedManualInvoiceItems,
    stripeWebhookEvents: 0,
  };

  await insertMaintenanceAuditEvent({
    adminEmail: options.adminEmail,
    client,
    counts,
    reason: options.reason,
  });

  return {
    counts,
    skipped: plan.skipped,
    skippedInvoiceDependencies: [
      { table: 'financial_transactions', skipped: plan.skipped.financialTransactions },
      { table: 'payments', skipped: plan.skipped.payments },
      { table: 'invoice_items', skipped: plan.skipped.invoiceItems },
      { table: 'invoice_line_items', skipped: plan.skipped.invoiceLineItems },
    ].filter((dependency) => dependency.skipped),
  };
};

export const resetImportedDataAndFinancials = async (options: {
  adminEmail?: string | null;
  reason?: string | null;
} = {}) => {
  if (!isImportedDataResetEnabled()) {
    throw new MaintenanceResetDisabledError(
      `Destructive imported data reset is disabled unless ${IMPORTED_DATA_RESET_FEATURE_FLAG}=true.`,
    );
  }

  const isTestRuntime = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

  if (hasDirectDatabaseConnection() && !isTestRuntime) {
    return withPostgresTransaction(async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
        ['maple:maintenance:imported-data-reset'],
      );
      const plan = await getImportedDataResetPlan(client);
      return performDeletes(plan, client, options);
    });
  }

  if (process.env.NODE_ENV === 'production' && !isTestRuntime) {
    throw new MaintenanceResetStepError({
      step: 'transaction_required',
      message:
        'Direct session PostgreSQL access is required before running the production imported data reset.',
      code: 'TRANSACTION_REQUIRED',
    });
  }

  const plan = await getImportedDataResetPlan();
  return performDeletes(plan, undefined, options);
};

export const getResetExportPayload = async (adminEmail: string | null) => {
  const plan = await getImportedDataResetPlan();
  return {
    createdAt: new Date().toISOString(),
    createdBy: adminEmail || null,
    confirm: IMPORTED_DATA_RESET_CONFIRMATION_PHRASE,
    criteria: plan.criteria,
    rows: plan.rows,
  };
};
