import { getSchemaCompat } from './schemaCompat.js';

type RequiredColumnContract = {
  acceptable: readonly string[];
  label: string;
};

export const PRODUCTION_SCHEMA_CONTRACT_REQUIRED_COLUMNS = {
  admin_audit_events: [
    { label: 'action', acceptable: ['action'] },
    { label: 'target_type', acceptable: ['target_type'] },
    { label: 'metadata', acceptable: ['metadata'] },
  ],
  applications: [
    { label: 'approved_at', acceptable: ['approved_at', 'approvedAt'] },
    { label: 'approved_bond', acceptable: ['approved_bond', 'approvedBond'] },
    { label: 'approved_vehicle', acceptable: ['approved_vehicle', 'approvedVehicle'] },
    {
      label: 'agreement_accepted_at',
      acceptable: ['agreement_accepted_at', 'agreementAcceptedAt'],
    },
    {
      label: 'agreement_signature',
      acceptable: ['agreement_signature', 'agreementSignature'],
    },
    {
      label: 'agreement_template_version',
      acceptable: ['agreement_template_version', 'agreementTemplateVersion'],
    },
    {
      label: 'approved_weekly_price',
      acceptable: ['approved_weekly_price', 'approvedWeeklyPrice'],
    },
    { label: 'cancelled_at', acceptable: ['cancelled_at', 'cancelledAt'] },
    { label: 'cancel_reason', acceptable: ['cancel_reason', 'cancelReason'] },
    { label: 'paid_at', acceptable: ['paid_at', 'paidAt'] },
    {
      label: 'payment_link_sent_at',
      acceptable: ['payment_link_sent_at', 'paymentLinkSentAt'],
    },
    {
      label: 'payment_link_version',
      acceptable: ['payment_link_version', 'paymentLinkVersion'],
    },
    {
      label: 'pending_checkout_session_id',
      acceptable: ['pending_checkout_session_id', 'pendingCheckoutSessionId'],
    },
    {
      label: 'passport_or_uber_profile_screenshot',
      acceptable: [
        'passport_or_uber_profile_screenshot',
        'passportOrUberProfileScreenshot',
      ],
    },
  ],
  rentals: [
    {
      label: 'vehicle_registration',
      acceptable: ['vehicle_registration', 'vehicleRegistration'],
    },
    {
      label: 'stripe_customer_id',
      acceptable: ['stripe_customer_id', 'stripeCustomerId'],
    },
    {
      label: 'stripe_subscription_id',
      acceptable: ['stripe_subscription_id', 'stripeSubscriptionId'],
    },
    {
      label: 'stripe_status_event_created_at',
      acceptable: ['stripe_status_event_created_at'],
    },
    {
      label: 'stripe_status_event_id',
      acceptable: ['stripe_status_event_id'],
    },
    {
      label: 'stripe_status_event_terminal',
      acceptable: ['stripe_status_event_terminal'],
    },
  ],
  customers: [
    { label: 'is_imported', acceptable: ['is_imported'] },
  ],
  document_retention_holds: [
    { label: 'storage_path', acceptable: ['storage_path'] },
    { label: 'released_at', acceptable: ['released_at'] },
  ],
  invoices: [
    { label: 'is_imported', acceptable: ['is_imported'] },
  ],
  stripe_webhook_events: [
    { label: 'application_id', acceptable: ['application_id'] },
    { label: 'stripe_subscription_id', acceptable: ['stripe_subscription_id'] },
  ],
} as const;

export const STRIPE_WEBHOOK_LEDGER_CONTRACTS = [
  {
    label: 'modern',
    required: [
      { label: 'stripe_event_id', acceptable: ['stripe_event_id'] },
      { label: 'status', acceptable: ['status'] },
      { label: 'received_at', acceptable: ['received_at'] },
      { label: 'updated_at', acceptable: ['updated_at'] },
    ],
  },
  {
    label: 'legacy',
    required: [
      { label: 'stripe_event_id', acceptable: ['stripe_event_id'] },
      { label: 'event_type', acceptable: ['event_type'] },
      { label: 'processed_at', acceptable: ['processed_at'] },
    ],
  },
] as const;

let schemaContractValidationPromise: Promise<void> | null = null;

const readEnv = (key: string) => {
  const value = process.env[key];
  return typeof value === 'string' ? value.trim() : '';
};

const getSchemaInspectionContext = () => {
  const supabaseUrl = readEnv('SUPABASE_URL');
  const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for schema contract validation.'
    );
  }

  return {
    serviceRoleKey,
    supabaseUrl,
  };
};

const fetchOpenApiDefinitions = async () => {
  const { serviceRoleKey, supabaseUrl } = getSchemaInspectionContext();
  const response = await fetch(new URL('/rest/v1/', supabaseUrl), {
    headers: {
      Accept: 'application/openapi+json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to verify production schema contract: ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as {
    definitions?: Record<string, { properties?: Record<string, unknown> }>;
  };
};

const findMissingColumns = (
  availableColumns: Set<string>,
  requiredColumns: readonly RequiredColumnContract[]
) =>
  requiredColumns
    .filter((column) => !column.acceptable.some((candidate) => availableColumns.has(candidate)))
    .map((column) => column.label);

const describeStripeWebhookLedgerContract = (availableColumns: Set<string>) => {
  const satisfiedContract = STRIPE_WEBHOOK_LEDGER_CONTRACTS.find(
    ({ required }) => findMissingColumns(availableColumns, required).length === 0
  );

  if (satisfiedContract) {
    return null;
  }

  const supportedShapes = STRIPE_WEBHOOK_LEDGER_CONTRACTS.map(
    ({ label, required }) =>
      `${label} (${required.map((column) => column.label).join(', ')})`
  ).join(' or ');

  return `stripe_webhook_events: expected ${supportedShapes}`;
};

export const verifyProductionSchemaContract = async () => {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  if (!schemaContractValidationPromise) {
    schemaContractValidationPromise = (async () => {
      const compat = await getSchemaCompat();
      const spec = await fetchOpenApiDefinitions();

      const columnsByTable = new Map<string, Set<string>>();
      Object.entries(spec.definitions || {}).forEach(([tableName, definition]) => {
        const properties = definition?.properties || {};
        columnsByTable.set(tableName, new Set(Object.keys(properties)));
      });

      const missingContracts = Object.entries(PRODUCTION_SCHEMA_CONTRACT_REQUIRED_COLUMNS)
        .map(([tableName, requiredColumns]) => {
          const availableColumns = columnsByTable.get(tableName) || new Set<string>();
          const missing = findMissingColumns(availableColumns, requiredColumns);
          return missing.length > 0 ? `${tableName}: ${missing.join(', ')}` : null;
        })
        .filter((entry): entry is string => Boolean(entry));

      const stripeWebhookLedgerContract = describeStripeWebhookLedgerContract(
        columnsByTable.get('stripe_webhook_events') || new Set<string>()
      );
      if (stripeWebhookLedgerContract) {
        missingContracts.push(stripeWebhookLedgerContract);
      }

      const compatMappedColumns = [
        { table: 'applications', column: compat.applicationApprovedAtColumn },
        { table: 'applications', column: compat.applicationApprovedBondColumn },
        { table: 'applications', column: compat.applicationApprovedWeeklyPriceColumn },
        { table: 'applications', column: compat.applicationPaidAtColumn },
        { table: 'applications', column: compat.applicationPaymentLinkSentAtColumn },
        { table: 'applications', column: compat.applicationPaymentLinkVersionColumn },
        { table: 'applications', column: compat.applicationAgreementTemplateVersionColumn },
        { table: 'applications', column: compat.applicationPendingCheckoutSessionColumn },
        { table: 'rentals', column: compat.rentalStripeCustomerColumn },
        { table: 'rentals', column: compat.rentalStripeSubscriptionColumn },
      ].filter(
        (value): value is { table: string; column: string } => Boolean(value.column)
      );

      const missingCompatColumns = compatMappedColumns
        .filter(
          ({ column, table }) => !(columnsByTable.get(table) || new Set<string>()).has(column)
        )
        .map(({ column }) => column);

      if (missingContracts.length > 0 || missingCompatColumns.length > 0) {
        const details = [
          ...missingContracts,
          ...(missingCompatColumns.length > 0
            ? [`schema compat mapped columns missing: ${missingCompatColumns.join(', ')}`]
            : []),
        ].join('; ');

        throw new Error(
          `Production schema contract check failed. Missing required columns: ${details}. ` +
            'Apply pending migrations before deploying this version.'
        );
      }
    })().catch((error) => {
      schemaContractValidationPromise = null;
      throw error;
    });
  }

  return schemaContractValidationPromise;
};

export const resetSchemaContractValidationForTests = () => {
  schemaContractValidationPromise = null;
};
