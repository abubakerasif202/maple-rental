import path from 'node:path';

import { config as loadDotenv } from 'dotenv';

import { STRIPE_API_VERSION } from '../api/constants.js';
import {
  getDirectDatabaseConnectionString,
  getPostgresConnectionMode,
  withPostgresTransaction,
} from '../api/db/postgres.js';
import { getPaymentProcessingMode } from '../api/paymentProcessing.js';
import { verifyProductionSchemaContract } from '../api/schemaContract.js';
import {
  clearStripeCatalogCache,
  ensureStripeCatalog,
  inspectStripeCatalog,
} from '../api/stripeCatalog.js';
import { createStripeClient, readStripeSecretKey } from '../api/stripeClient.js';

const args = new Set(process.argv.slice(2));
const requireLiveKey = args.has('--require-live');
const cwd = process.cwd();

loadDotenv({ path: path.resolve(cwd, '.env'), quiet: true });

if (!requireLiveKey && process.env.NODE_ENV !== 'production') {
  loadDotenv({
    path: path.resolve(cwd, '.env.local'),
    override: true,
    quiet: true,
  });
}

const EXPECTED_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
] as const;

type CheckStatus = 'pass' | 'warn' | 'fail';

type CheckResult = {
  details?: Record<string, unknown>;
  message: string;
  name: string;
  status: CheckStatus;
};

type StripeKeyMode = 'test' | 'live' | 'unknown' | 'missing';

const checks: CheckResult[] = [];

const addCheck = (
  name: string,
  status: CheckStatus,
  message: string,
  details?: Record<string, unknown>
) => {
  checks.push({
    ...(details ? { details } : {}),
    message,
    name,
    status,
  });
};

const statusForReadinessCheck = (passed: boolean): CheckStatus =>
  passed ? 'pass' : requireLiveKey ? 'fail' : 'warn';

const normalizeUrl = (value: string) => value.replace(/\/+$/, '');
const isLocalhostUrl = (url: URL) =>
  ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname);

const toStripeKeyMode = (secretKey: string | null): StripeKeyMode => {
  if (!secretKey) {
    return 'missing';
  }

  if (secretKey.startsWith('sk_test_')) {
    return 'test';
  }

  if (secretKey.startsWith('sk_live_')) {
    return 'live';
  }

  return 'unknown';
};

const isStripeAuthenticationError = (
  error: unknown
): error is { code?: string; message?: string; type?: string } =>
  Boolean(
    error &&
      typeof error === 'object' &&
      (('type' in error &&
        (error as { type?: string }).type === 'StripeAuthenticationError') ||
        ('code' in error &&
          ['api_key_expired', 'api_key_invalid'].includes(
            String((error as { code?: string }).code || '')
          )))
  );

const collectAll = async <T>(listPromise: AsyncIterable<T>) => {
  const items: T[] = [];

  for await (const item of listPromise) {
    items.push(item);
  }

  return items;
};

const resolveExpectedWebhookUrl = () => {
  const appUrl = (process.env.APP_URL || '').trim();

  if (!appUrl) {
    addCheck(
      'app_url',
      statusForReadinessCheck(false),
      'APP_URL is required for Stripe redirect and webhook verification.'
    );
    return null;
  }

  try {
    const parsedAppUrl = new URL(appUrl);
    const expectedUrl = new URL('/api/stripe/webhook', parsedAppUrl).toString();

    if (requireLiveKey && isLocalhostUrl(parsedAppUrl)) {
      addCheck(
        'app_url',
        'fail',
        'APP_URL must point to the public production domain for client handoff.',
        {
          expectedWebhookUrl: expectedUrl,
          value: appUrl,
        }
      );
      return expectedUrl;
    }

    addCheck('app_url', 'pass', 'APP_URL is configured.', {
      expectedWebhookUrl: expectedUrl,
      value: appUrl,
    });
    return expectedUrl;
  } catch {
    addCheck(
      'app_url',
      statusForReadinessCheck(false),
      'APP_URL must be a valid absolute HTTP or HTTPS URL.',
      {
        value: appUrl,
      }
    );
    return null;
  }
};

const verifyLocalRuntimeDependencies = async () => {
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const checkoutLinkSecret = process.env.CHECKOUT_LINK_SECRET?.trim();
  const paymentActivationMode = getPaymentProcessingMode();
  const directDatabaseConnection = getDirectDatabaseConnectionString();
  const postgresConnectionMode = getPostgresConnectionMode();

  addCheck(
    'stripe_webhook_secret',
    stripeWebhookSecret ? 'pass' : statusForReadinessCheck(false),
    stripeWebhookSecret
      ? 'STRIPE_WEBHOOK_SECRET is configured.'
      : 'STRIPE_WEBHOOK_SECRET is required to verify incoming Stripe webhook signatures.'
  );

  addCheck(
    'checkout_link_secret',
    checkoutLinkSecret ? 'pass' : statusForReadinessCheck(false),
    checkoutLinkSecret
      ? 'CHECKOUT_LINK_SECRET is configured.'
      : 'CHECKOUT_LINK_SECRET is required to sign secure payment links.'
  );

  const paymentActivationDetails = {
    checkoutStillAvailable: true,
    directDatabaseConnectionConfigured: Boolean(directDatabaseConnection),
    paymentActivationMode,
    postgresConnectionMode,
  };

  if (!directDatabaseConnection) {
    addCheck(
      'payment_activation_mode',
      'warn',
      'Payment-only completion is available, but transactional locking is disabled because no session-capable Postgres connection is configured.',
      paymentActivationDetails
    );
  } else {
    try {
      await withPostgresTransaction(async (client) => {
        await client.query('SELECT 1');
      });
      addCheck(
        'payment_activation_mode',
        paymentActivationMode === 'transactional' ? 'pass' : 'warn',
        paymentActivationMode === 'transactional'
          ? 'Transactional payment-only completion is enabled.'
          : 'Payment-only completion is available but is not fully transactional.',
        {
          ...paymentActivationDetails,
          connectionVerified: true,
        }
      );
    } catch (error) {
      addCheck(
        'payment_activation_mode',
        'fail',
        error instanceof Error
          ? `Configured direct Postgres connection failed: ${error.message}`
          : 'Configured direct Postgres connection failed verification.',
        {
          ...paymentActivationDetails,
          connectionVerified: false,
        }
      );
    }
  }

  const previousNodeEnv = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = 'production';
    await verifyProductionSchemaContract();
    addCheck(
      'schema_contract',
      'pass',
      'The production schema contract required by Stripe payment processing is satisfied.'
    );
  } catch (error) {
    addCheck(
      'schema_contract',
      statusForReadinessCheck(false),
      error instanceof Error ? error.message : 'Failed to verify the production schema contract.'
    );
  } finally {
    if (typeof previousNodeEnv === 'string') {
      process.env.NODE_ENV = previousNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  }
};

const verifyStripeAccountConfiguration = async (
  expectedWebhookUrl: string | null,
  secretKey: string | null
) => {
  const keyMode = toStripeKeyMode(secretKey);

  addCheck(
    'stripe_secret_key',
    secretKey ? 'pass' : 'fail',
    secretKey ? 'STRIPE_SECRET_KEY is configured.' : 'STRIPE_SECRET_KEY is required.'
  );

  if (!secretKey) {
    return {
      accountId: null,
      catalog: null,
      displayName: null,
      expectedWebhookUrl,
      keyMode,
      matchingWebhookEndpoints: [],
    };
  }

  const stripe = createStripeClient(secretKey);

  try {
    const account = await stripe.accounts.retrieveCurrent();
    const catalog = await (async () => {
      clearStripeCatalogCache();
      return requireLiveKey
        ? inspectStripeCatalog(stripe)
        : ensureStripeCatalog(stripe);
    })();
    const webhookEndpoints = await collectAll(
      stripe.webhookEndpoints.list({ limit: 100 })
    );
    const matchingWebhookEndpoints = webhookEndpoints.filter(
      (endpoint) => normalizeUrl(endpoint.url) === normalizeUrl(expectedWebhookUrl || '')
    );

    addCheck(
      'stripe_account',
      'pass',
      'Stripe account access succeeded.',
      {
        accountId: account.id,
        displayName: account.settings?.dashboard?.display_name || account.business_profile?.name || null,
        keyMode,
      }
    );

    const accountRequirements = account.requirements;
    const accountReady =
      account.charges_enabled &&
      account.payouts_enabled &&
      account.details_submitted &&
      (accountRequirements?.currently_due?.length || 0) === 0 &&
      (accountRequirements?.past_due?.length || 0) === 0;
    addCheck(
      'stripe_account_readiness',
      accountReady ? 'pass' : statusForReadinessCheck(false),
      accountReady
        ? 'Stripe account can accept charges and payouts with no overdue requirements.'
        : 'Stripe account is not fully ready for charges, payouts, or verification handoff.',
      {
        chargesEnabled: account.charges_enabled,
        detailsSubmitted: account.details_submitted,
        payoutsEnabled: account.payouts_enabled,
        requirementsCurrentlyDue: accountRequirements?.currently_due?.length || 0,
        requirementsPastDue: accountRequirements?.past_due?.length || 0,
      }
    );

    const missingSupportFields = [
      !account.business_profile?.support_email ? 'support_email' : null,
      !account.business_profile?.support_address ? 'support_address' : null,
      !account.business_profile?.support_url ? 'support_url' : null,
    ].filter((field): field is string => Boolean(field));
    addCheck(
      'stripe_support_profile',
      missingSupportFields.length === 0 ? 'pass' : 'warn',
      missingSupportFields.length === 0
        ? 'Stripe customer support profile is complete.'
        : 'Stripe customer support profile is incomplete.',
      { missingFields: missingSupportFields }
    );

    if (requireLiveKey) {
      addCheck(
        'stripe_key_mode',
        keyMode === 'live' ? 'pass' : 'fail',
        keyMode === 'live'
          ? 'A live Stripe secret key is configured.'
          : `Expected a live Stripe secret key for handoff, but resolved ${keyMode}.`
      );
    } else {
      addCheck(
        'stripe_key_mode',
        keyMode === 'test' ? 'warn' : 'pass',
        keyMode === 'test'
          ? 'A test Stripe secret key is configured. Use a live key before client handoff.'
          : `Stripe key mode resolved as ${keyMode}.`
      );
    }

    if (!expectedWebhookUrl) {
      addCheck(
        'stripe_webhook_endpoint',
        statusForReadinessCheck(false),
        'Expected webhook URL could not be derived because APP_URL is invalid or missing.'
      );
    } else if (matchingWebhookEndpoints.length === 0) {
      addCheck(
        'stripe_webhook_endpoint',
        statusForReadinessCheck(false),
        'No Stripe webhook endpoint matches the configured APP_URL.',
        { expectedWebhookUrl }
      );
    } else {
      const enabledEndpoint = matchingWebhookEndpoints.find(
        (endpoint) => !('status' in endpoint) || endpoint.status === 'enabled'
      );
      if (!enabledEndpoint) {
        addCheck(
          'stripe_webhook_endpoint',
          statusForReadinessCheck(false),
          'The matching Stripe webhook endpoint is disabled.',
          {
            expectedWebhookUrl,
            matchingEndpointCount: matchingWebhookEndpoints.length,
            webhookStatus: 'disabled',
          }
        );
      } else {
        const enabledEvents = enabledEndpoint.enabled_events || [];
        const missingEvents = enabledEvents.includes('*')
          ? []
          : EXPECTED_WEBHOOK_EVENTS.filter((eventName) =>
              enabledEvents.includes(eventName)
            );

        addCheck(
          'stripe_webhook_endpoint',
          missingEvents.length === 0 ? 'pass' : statusForReadinessCheck(false),
          missingEvents.length === 0
            ? 'Stripe webhook endpoint is configured with the required events.'
            : 'Stripe webhook endpoint is missing required events.',
          {
            expectedWebhookUrl,
            matchingEndpointCount: matchingWebhookEndpoints.length,
            missingEvents,
            webhookStatus:
              'status' in enabledEndpoint ? enabledEndpoint.status || null : null,
          }
        );

        const webhookApiVersion = enabledEndpoint.api_version || null;
        addCheck(
          'stripe_webhook_api_version',
          webhookApiVersion === STRIPE_API_VERSION
            ? 'pass'
            : statusForReadinessCheck(false),
          webhookApiVersion === STRIPE_API_VERSION
            ? 'Stripe webhook endpoint API version matches the application.'
            : 'Stripe webhook endpoint API version does not match the application.',
          {
            applicationApiVersion: STRIPE_API_VERSION,
            webhookApiVersion,
          }
        );
      }
    }

    const overlappingWebhookEndpoints = webhookEndpoints
      .filter(
        (endpoint) =>
          normalizeUrl(endpoint.url) !== normalizeUrl(expectedWebhookUrl || '') &&
          (!('status' in endpoint) || endpoint.status === 'enabled')
      )
      .filter((endpoint) => {
        const enabledEvents = endpoint.enabled_events || [];
        return (
          enabledEvents.includes('*') ||
          EXPECTED_WEBHOOK_EVENTS.some((eventName) =>
            enabledEvents.includes(eventName)
          )
        );
      })
      .map((endpoint) => ({ id: endpoint.id, url: endpoint.url }));
    addCheck(
      'stripe_overlapping_webhooks',
      overlappingWebhookEndpoints.length === 0 ? 'pass' : 'warn',
      overlappingWebhookEndpoints.length === 0
        ? 'No secondary webhook endpoint overlaps Maple payment events.'
        : 'Secondary webhook endpoints also receive Maple payment events; confirm they are intentional and side-effect safe.',
      { endpoints: overlappingWebhookEndpoints }
    );

    addCheck('stripe_catalog', 'pass', 'Reusable Stripe catalog is available.', {
      catalog,
    });

    return {
      accountId: account.id,
      catalog,
      displayName:
        account.settings?.dashboard?.display_name || account.business_profile?.name || null,
      expectedWebhookUrl,
      keyMode,
      matchingWebhookEndpoints: matchingWebhookEndpoints.map((endpoint) => ({
        enabled_events: endpoint.enabled_events,
        id: endpoint.id,
        status: 'status' in endpoint ? endpoint.status || null : null,
        url: endpoint.url,
      })),
    };
  } catch (error) {
    if (isStripeAuthenticationError(error)) {
      addCheck(
        'stripe_account',
        'fail',
        error.message || 'Stripe rejected the configured secret key.',
        {
          code: error.code || null,
          keyMode,
          type: error.type || null,
        }
      );
    } else {
      addCheck(
        'stripe_account',
        'fail',
        error instanceof Error ? error.message : 'Failed to query the Stripe account.'
      );
    }

    return {
      accountId: null,
      catalog: null,
      displayName: null,
      expectedWebhookUrl,
      keyMode,
      matchingWebhookEndpoints: [],
    };
  }
};

const expectedWebhookUrl = resolveExpectedWebhookUrl();
const secretKey = readStripeSecretKey();

await verifyLocalRuntimeDependencies();
const stripeSummary = await verifyStripeAccountConfiguration(expectedWebhookUrl, secretKey);

const failures = checks.filter((check) => check.status === 'fail').length;
const warnings = checks.filter((check) => check.status === 'warn').length;
const overallStatus = failures > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass';

const summary = {
  accountId: stripeSummary.accountId,
  apiVersion: STRIPE_API_VERSION,
  catalog: stripeSummary.catalog,
  checks,
  displayName: stripeSummary.displayName,
  expectedWebhookUrl: stripeSummary.expectedWebhookUrl,
  keyMode: stripeSummary.keyMode,
  matchingWebhookEndpoints: stripeSummary.matchingWebhookEndpoints,
  overallStatus,
  requireLiveKey,
};

console.log(JSON.stringify(summary, null, 2));

if (failures > 0) {
  process.exitCode = 1;
}
