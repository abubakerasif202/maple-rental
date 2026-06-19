import Stripe from 'stripe';

import { db } from '../db/index.js';
import {
  hasDirectDatabaseConnection,
  withPostgresAdvisoryLock,
} from '../db/postgres.js';
import { ensureStripeCatalog } from '../stripeCatalog.js';
import { getStripeClient } from '../stripeClient.js';
import {
  getApplicationSelectColumns,
  getCarSelectColumns,
  getRentalApplicationIdColumn,
  getRentalCarIdColumn,
  getRentalSelectColumns,
  getSchemaCompat,
} from '../schemaCompat.js';
import {
  createCheckoutToken,
  verifyCheckoutToken,
} from '../checkoutTokens.js';
import {
  buildDriverPaymentLink,
  appendCheckoutTokenHash,
  getAppBaseUrl,
} from '../paymentLinks.js';
import {
  persistPendingCheckoutSessionIdIfCurrentVersion,
  updateApplicationPaymentStateIfCurrentVersion,
} from '../applicationPaymentState.js';
import { LEASE_SETTINGS, RENTAL_PLAN_SETUP_FEES_AUD } from '../constants.js';
import {
  getTodayInAustralia,
  isValidDateOnly,
} from '../../shared/applicationSubmission.js';
import { normalizeUuid } from '../../shared/uuid.js';

const getStripe = () => getStripeClient();
const DEFAULT_VEHICLE_IMAGE = '/hero-camry.webp';
const DEFAULT_APPROVED_VEHICLE_LABEL = 'Approved vehicle to be confirmed by Gala Rentals';

type BillingBreakdown = {
  bond: number;
  currency: string;
  initialRental: number;
  recurringAmount: number;
  recurringInterval: 'week' | 'month';
  recurringIntervalCount: number;
  recurringLabel: string;
  setupFees: number;
  upfrontDue: number;
};

export type HostedCheckoutSessionResponse = {
  checkout_url: string | null;
  session_id: string;
};

export type VehiclePaymentContextResponse = {
  applicant_name: string;
  application_id: string;
  approved_vehicle: string;
  billing: BillingBreakdown;
  car_id: number | null;
  vehicle_image: string;
};

export type VehicleCheckoutLifecycleState =
  | 'complete_paid'
  | 'processing'
  | 'pending_webhook'
  | 'manual_review'
  | 'failed';

export type CheckoutSessionMetadataMatch = {
  application_id: boolean;
  car_id: boolean | null;
  checkout_kind: boolean;
  matched: boolean;
  payment_link_version: boolean;
};

export type DbPaymentActivationStatus = {
  application_status: string;
  activated: boolean;
  pending_checkout_session_id: string | null;
  rental_status: string | null;
};

export type VehicleCheckoutSessionStatusResponse = {
  application_status: string;
  checkout_kind: string | null;
  customer_id: string | null;
  db_payment_activation_status: DbPaymentActivationStatus;
  id: string;
  internal_status: VehicleCheckoutLifecycleState;
  metadata_match: CheckoutSessionMetadataMatch;
  payment_method_type: string | null;
  payment_method_types: string[];
  payment_status: string | null;
  rental_status: string | null;
  state: VehicleCheckoutLifecycleState;
  status: string | null;
  subscription_id: string | null;
};

type PendingCheckoutSessionResolution = {
  retryKeySeed: string | null;
  session: Stripe.Checkout.Session | null;
};

type VerifiedCheckoutSessionContext = {
  carId: number | null;
  metadataMatch: CheckoutSessionMetadataMatch;
  session: Stripe.Checkout.Session;
  subscriptionId: string | null;
};

type StripeApplication = {
  approved_at?: string | null;
  approved_bond?: number | string | null;
  approved_vehicle?: string | null;
  approved_weekly_price?: number | string | null;
  email: string;
  id: string;
  intended_start_date?: string | null;
  intendedStartDate?: string | null;
  name: string;
  payment_link_version?: number | null;
  pending_checkout_session_id?: string | null;
  status: string;
};

type CheckoutVehicle = {
  archived_at?: string | null;
  id: number | string;
  name?: string | null;
  status?: string | null;
};

const toCents = (value: number) => Math.round(value * 100);
const fromCents = (value: number) => Number((value / 100).toFixed(2));
const toFloat = (value: number | string | null | undefined) =>
  Number(Number(value || 0).toFixed(2));
const isLiveRentalStatus = (status: unknown) => {
  const normalized = String(status || '').toLowerCase();
  return normalized !== 'completed' && normalized !== 'cancelled';
};

const RENTAL_START_TRIAL_MINIMUM_SECONDS = 48 * 60 * 60;

const getRentalSubscriptionStartDate = (application: StripeApplication) => {
  const value = String(
    application.intended_start_date ?? application.intendedStartDate ?? ''
  ).trim();

  return isValidDateOnly(value) ? value : null;
};

const getAustraliaSydneyStartOfDayUnix = (dateOnly: string) => {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone: 'Australia/Sydney',
    year: 'numeric',
  }).formatToParts(new Date(utcGuess));
  const part = (type: string) =>
    Number(parts.find((entry) => entry.type === type)?.value || 0);
  const localAtGuess = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second')
  );
  const offsetMs = localAtGuess - utcGuess;

  return Math.floor((Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs) / 1000);
};

const buildSubscriptionData = ({
  application,
  metadata,
}: {
  application: StripeApplication;
  metadata: Record<string, string>;
}): Stripe.Checkout.SessionCreateParams.SubscriptionData => {
  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
    metadata,
  };
  const rentalStartDate = getRentalSubscriptionStartDate(application);

  if (rentalStartDate) {
    metadata.rental_subscription_start_date = rentalStartDate;
  }

  if (!rentalStartDate || rentalStartDate <= getTodayInAustralia()) {
    return subscriptionData;
  }

  const startTimestamp = getAustraliaSydneyStartOfDayUnix(rentalStartDate);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(startTimestamp) || startTimestamp <= nowSeconds) {
    return subscriptionData;
  }

  if (startTimestamp >= nowSeconds + RENTAL_START_TRIAL_MINIMUM_SECONDS) {
    subscriptionData.trial_end = startTimestamp;
    return subscriptionData;
  }

  subscriptionData.billing_cycle_anchor = startTimestamp;
  subscriptionData.proration_behavior = 'none';
  return subscriptionData;
};

const isVehicleCheckoutMetadataMatch = (
  metadata: Record<string, string | undefined> | undefined,
  applicationId: string,
  paymentLinkVersion?: number | null
) => {
  if (!metadata) {
    return false;
  }

  const matchesApplicationId = normalizeUuid(metadata.application_id || '') === normalizeUuid(applicationId);
  const matchesCheckoutKind = metadata.checkout_kind === 'vehicle';
  const matchesVersion =
    typeof paymentLinkVersion === 'number'
      ? Number(metadata.payment_link_version || 0) === paymentLinkVersion
      : true;

  return matchesApplicationId && matchesCheckoutKind && matchesVersion;
};

const getCheckoutTokenCarId = (carId: unknown) => {
  if (carId == null || carId === '') {
    return null;
  }

  const numericCarId = Number(carId || 0);

  if (!Number.isInteger(numericCarId) || numericCarId <= 0) {
    throw new Error(
      'Payment link has an invalid vehicle assignment. Request a fresh payment link.'
    );
  }

  return numericCarId;
};

const buildApprovedBillingBreakdown = (application: StripeApplication): BillingBreakdown => {
  const approvedBondCents = Math.round(Number(application.approved_bond || 0) * 100);
  const approvedWeeklyPriceCents = Math.round(
    Number(application.approved_weekly_price || 0) * 100
  );
  const setupFeesCents = Math.round(RENTAL_PLAN_SETUP_FEES_AUD * 100);
  const upfrontDueCents = approvedBondCents + approvedWeeklyPriceCents + setupFeesCents;

  return {
    bond: fromCents(approvedBondCents),
    currency: LEASE_SETTINGS.currency.toUpperCase(),
    initialRental: fromCents(approvedWeeklyPriceCents),
    recurringAmount: fromCents(approvedWeeklyPriceCents),
    recurringInterval: LEASE_SETTINGS.recurring_interval,
    recurringIntervalCount: 1,
    recurringLabel: 'per week',
    setupFees: fromCents(setupFeesCents),
    upfrontDue: fromCents(upfrontDueCents),
  };
};

const buildSubscriptionLineItems = async ({
  billingBreakdown,
}: {
  billingBreakdown: BillingBreakdown;
}) => {
  const stripeCatalog = await ensureStripeCatalog(getStripe());
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      price_data: {
        currency: LEASE_SETTINGS.currency,
        product: stripeCatalog.weeklyRental.productId,
        recurring: {
          interval: billingBreakdown.recurringInterval,
          interval_count: billingBreakdown.recurringIntervalCount,
        },
        unit_amount: toCents(billingBreakdown.recurringAmount),
      },
      quantity: 1,
    },
  ];

  return lineItems.filter((item) => (item.price_data?.unit_amount ?? 0) > 0);
};

const buildCancelUrl = ({
  applicationId,
  token,
}: {
  applicationId: string;
  token: string;
}) => {
  const checkoutUrl = new URL(`/checkout/${applicationId}`, getAppBaseUrl());
  checkoutUrl.searchParams.set('resume_payment', '1');
  return appendCheckoutTokenHash(checkoutUrl, token).toString();
};

const buildSuccessUrl = ({
  applicationId,
  token,
}: {
  applicationId: string;
  token: string;
}) => {
  const url = new URL('/success', getAppBaseUrl());
  url.searchParams.set('session_id', '__STRIPE_CHECKOUT_SESSION_ID__');
  url.searchParams.set('application_id', String(applicationId));
  return appendCheckoutTokenHash(url, token)
    .toString()
    .replace('__STRIPE_CHECKOUT_SESSION_ID__', '{CHECKOUT_SESSION_ID}');
};

const createHostedCheckoutSession = async ({
  application,
  billingBreakdown,
  carId,
  checkoutToken,
  idempotencyKey,
}: {
  application: StripeApplication;
  billingBreakdown: BillingBreakdown;
  carId: number | null;
  checkoutToken: string;
  idempotencyKey: string;
}) => {
  const metadata: Record<string, string> = {
    application_id: String(application.id),
    applicant_email: String(application.email),
    approved_vehicle: String(application.approved_vehicle || DEFAULT_APPROVED_VEHICLE_LABEL),
    checkout_kind: 'vehicle',
    payment_type: 'vehicle_rental',
    approved_bond: billingBreakdown.bond.toFixed(2),
    approved_weekly_price: billingBreakdown.recurringAmount.toFixed(2),
    payment_link_version: String(Number(application.payment_link_version || 0)),
  };

  if (carId) {
    metadata.car_id = String(carId);
  }
  const subscriptionData = buildSubscriptionData({ application, metadata });

  console.info('Creating Stripe vehicle checkout session', {
    applicationId: application.id,
    carId,
    idempotencyKey,
    paymentLinkVersion: application.payment_link_version,
    rentalSubscriptionStartDate: metadata.rental_subscription_start_date || null,
  });

  return getStripe().checkout.sessions.create(
    {
      billing_address_collection: 'auto',
      cancel_url: buildCancelUrl({
        applicationId: application.id,
        token: checkoutToken,
      }),
      client_reference_id: String(application.id),
      customer_email: application.email,
      line_items: await buildSubscriptionLineItems({ billingBreakdown }),
      metadata,
      mode: 'subscription',
      subscription_data: subscriptionData,
      success_url: buildSuccessUrl({
        applicationId: application.id,
        token: checkoutToken,
      }),
    },
    {
      idempotencyKey,
    }
  );
};

const fetchApplication = async (applicationId: string) => {
  const selectColumns = await getApplicationSelectColumns();
  const { data: application, error } = await db
    .from('applications')
    .select(selectColumns)
    .eq('id', applicationId)
    .single();

  if (error || !application) {
    return null;
  }

  return application as unknown as StripeApplication;
};

const fetchCheckoutVehicle = async (carId: number) => {
  const selectColumns = await getCarSelectColumns();
  const { data: car, error } = await db
    .from('cars')
    .select(selectColumns)
    .eq('id', carId)
    .single();

  if (error || !car) {
    return null;
  }

  return car as unknown as CheckoutVehicle;
};

const requireCheckoutVehicleAvailable = async (carId: number) => {
  const car = await fetchCheckoutVehicle(carId);

  if (!car) {
    throw new Error('Car not found');
  }

  if (car.archived_at) {
    throw new Error(
      'Vehicle is no longer available for checkout. Request a fresh payment link.'
    );
  }

  if (String(car.status || '') !== 'Available') {
    throw new Error(
      'Vehicle is no longer available for checkout. Request a fresh payment link.'
    );
  }

  return car;
};

const requireApprovedPaymentContext = ({
  application,
}: {
  application: StripeApplication;
}) => {
  if (application.status === 'Cancelled') {
    throw new Error('This application has been cancelled.');
  }

  if (application.status === 'Paid') {
    throw new Error('Payment link has already been used.');
  }

  if (application.status === 'Payment Review') {
    throw new Error('This payment has already been received and onboarding follow-up is pending.');
  }

  if (application.status !== 'Approved') {
    throw new Error('Payment link is not ready for payment yet.');
  }

  if (toFloat(application.approved_bond) < 0 || toFloat(application.approved_weekly_price) <= 0) {
    throw new Error('Payment link is missing approved pricing.');
  }
};

export const expirePendingCheckoutSession = async (sessionId: string | null | undefined) => {
  if (!sessionId) {
    return;
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);

    if (session.status !== 'open') {
      console.info('Skipped expiring non-open Stripe checkout session', {
        checkoutSessionId: sessionId,
        checkoutSessionStatus: session.status || null,
      });
      return;
    }

    await getStripe().checkout.sessions.expire(sessionId);
  } catch (error) {
    console.warn(`Unable to expire checkout session ${sessionId}:`, error);
  }
};

const cancelLinkedStripeSubscription = async ({
  applicationId,
  paymentLinkVersion,
  subscriptionId,
}: {
  applicationId: string;
  paymentLinkVersion?: number | null;
  subscriptionId: string;
}) => {
  try {
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    if (
      !isVehicleCheckoutMetadataMatch(
        subscription.metadata as Record<string, string | undefined> | undefined,
        applicationId,
        paymentLinkVersion
      )
    ) {
      console.warn('Skipped cancelling Stripe subscription that does not match the target application', {
        applicationId,
        paymentLinkVersion,
        subscriptionId,
      });
      return false;
    }

    if (subscription.status === 'canceled') {
      return true;
    }

    await getStripe().subscriptions.cancel(subscriptionId);
    return true;
  } catch (error) {
    console.warn(`Unable to cancel subscription ${subscriptionId}:`, error);
    return false;
  }
};

const fetchApplicationLinkedSubscriptionIds = async (applicationId: string) => {
  const selectColumns = await getRentalSelectColumns({ includeStripeFields: true });
  const rentalApplicationIdColumn = await getRentalApplicationIdColumn();
  const { data, error } = await db
    .from('rentals')
    .select(selectColumns)
    .eq(rentalApplicationIdColumn, applicationId);

  if (error) {
    throw new Error(
      `Failed to inspect linked rental subscriptions for cancellation: ${error.message || 'Unknown error'}`
    );
  }

  const rows = ((data || []) as unknown) as Array<Record<string, unknown>>;
  const compat = await getSchemaCompat();
  const subscriptionColumn = compat.rentalStripeSubscriptionColumn;
  if (!subscriptionColumn) {
    return [];
  }

  return rows
    .filter((row) => isLiveRentalStatus(row.status))
    .map((row) => String(row[subscriptionColumn] || '').trim())
    .filter((subscriptionId) => Boolean(subscriptionId));
};

export const cancelApplicationStripeResources = async ({
  applicationId,
  paymentLinkVersion,
  pendingCheckoutSessionId,
}: {
  applicationId: string;
  paymentLinkVersion?: number | null;
  pendingCheckoutSessionId?: string | null;
}) => {
  if (pendingCheckoutSessionId) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(pendingCheckoutSessionId);
      if (
        isVehicleCheckoutMetadataMatch(
          session.metadata as Record<string, string | undefined> | undefined,
          applicationId,
          paymentLinkVersion
        )
      ) {
        await expirePendingCheckoutSession(pendingCheckoutSessionId);
      } else {
        console.warn('Skipped expiring Stripe checkout session that does not match the target application', {
          applicationId,
          paymentLinkVersion,
          pendingCheckoutSessionId,
        });
      }
    } catch (error) {
      console.warn(`Unable to inspect pending checkout session ${pendingCheckoutSessionId}:`, error);
    }
  }

  const subscriptionIds = await fetchApplicationLinkedSubscriptionIds(applicationId);
  for (const subscriptionId of subscriptionIds) {
    await cancelLinkedStripeSubscription({
      applicationId,
      paymentLinkVersion,
      subscriptionId,
    });
  }
};

const persistPendingCheckoutSessionId = async (
  applicationId: string,
  paymentLinkVersion: number,
  sessionId: string | null
) => {
  return persistPendingCheckoutSessionIdIfCurrentVersion({
    applicationId,
    expectedPaymentLinkVersion: paymentLinkVersion,
    sessionId,
  });
};

const getSessionSubscriptionId = (session: Stripe.Checkout.Session) =>
  typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id || null;

const getSessionCustomerId = (session: Stripe.Checkout.Session) =>
  typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id || null;

const getSessionPaymentMethodTypes = (session: Stripe.Checkout.Session) =>
  Array.isArray(session.payment_method_types)
    ? session.payment_method_types.map((paymentMethodType) => String(paymentMethodType))
    : [];

const isCheckoutFailureStatus = (status: string | null | undefined) =>
  ['canceled', 'cancelled', 'expired', 'failed'].includes(
    String(status || '').toLowerCase()
  );

const isPendingBankDebitPaymentStatus = (paymentStatus: string | null | undefined) =>
  ['no_payment_required', 'pending', 'unpaid'].includes(
    String(paymentStatus || '').toLowerCase()
  );

const isDirectDebitProcessingSession = (session: Stripe.Checkout.Session) => {
  const paymentMethodTypes = getSessionPaymentMethodTypes(session);

  return (
    session.status === 'complete' &&
    paymentMethodTypes.includes('au_becs_debit') &&
    isPendingBankDebitPaymentStatus(session.payment_status)
  );
};

const getVehicleCheckoutLifecycleState = ({
  applicationStatus,
  carId,
  rentalStatus,
  session,
}: {
  applicationStatus: string;
  carId: number | null;
  rentalStatus: string | null;
  session: Stripe.Checkout.Session;
}): VehicleCheckoutLifecycleState => {
  if (
    isCheckoutFailureStatus(session.status) ||
    isCheckoutFailureStatus(session.payment_status)
  ) {
    return 'failed';
  }

  if (isDirectDebitProcessingSession(session)) {
    return 'processing';
  }

  const isStripePaidComplete =
    session.status === 'complete' && session.payment_status === 'paid';

  if (isStripePaidComplete && applicationStatus === 'Paid' && (!carId || rentalStatus)) {
    return 'complete_paid';
  }

  if (
    isStripePaidComplete &&
    (applicationStatus === 'Payment Review' || applicationStatus === 'Paid')
  ) {
    return 'manual_review';
  }

  if (isStripePaidComplete) {
    return 'pending_webhook';
  }

  return 'processing';
};

const verifyCheckoutSessionContext = async ({
  application,
  applicationId,
  checkoutToken,
  sessionId,
}: {
  application: StripeApplication;
  applicationId: string;
  checkoutToken?: string | null;
  sessionId: string;
}): Promise<VerifiedCheckoutSessionContext> => {
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  const metadataApplicationId = normalizeUuid(session.metadata?.application_id || '');
  const metadataCarId = Number(session.metadata?.car_id || 0) || null;
  const metadataCheckoutKind = session.metadata?.checkout_kind || null;
  const metadataVersion = Number(session.metadata?.payment_link_version || 0);
  const currentPaymentLinkVersion = Number(application.payment_link_version || 0);
  const metadataMatch: CheckoutSessionMetadataMatch = {
    application_id: metadataApplicationId === normalizeUuid(applicationId),
    car_id: null,
    checkout_kind: metadataCheckoutKind === 'vehicle',
    matched: false,
    payment_link_version: metadataVersion === currentPaymentLinkVersion,
  };

  if (!metadataMatch.application_id) {
    throw new Error('Checkout session does not match this application.');
  }

  if (!metadataMatch.checkout_kind) {
    throw new Error('Checkout session does not match this payment link.');
  }

  if (!metadataMatch.payment_link_version) {
    throw new Error('Checkout session belongs to an outdated payment link.');
  }

  if (checkoutToken) {
    const checkoutTokenPayload = verifyCheckoutToken({
      applicationId,
      purpose: 'vehicle',
      token: checkoutToken,
      version: currentPaymentLinkVersion,
    });
    const tokenCarId = getCheckoutTokenCarId(checkoutTokenPayload.carId);
    metadataMatch.car_id = metadataCarId === tokenCarId;

    if (!metadataMatch.car_id) {
      throw new Error('Checkout session vehicle does not match this payment link.');
    }
  } else {
    const pendingCheckoutSessionId = application.pending_checkout_session_id || null;
    const isRecoverablePaidSession =
      session.status === 'complete' &&
      session.payment_status === 'paid' &&
      (pendingCheckoutSessionId === session.id ||
        application.status === 'Paid' ||
        application.status === 'Payment Review');
    const isRecoverableProcessingSession =
      pendingCheckoutSessionId === session.id && isDirectDebitProcessingSession(session);

    if (!isRecoverablePaidSession && !isRecoverableProcessingSession) {
      throw new Error('Checkout token is required for this checkout session.');
    }
  }
  metadataMatch.matched =
    metadataMatch.application_id &&
    metadataMatch.checkout_kind &&
    metadataMatch.payment_link_version &&
    metadataMatch.car_id !== false;

  return {
    carId: metadataCarId,
    metadataMatch,
    session,
    subscriptionId: getSessionSubscriptionId(session),
  };
};

const withOptionalCheckoutSessionLock = async <T>(
  applicationId: string,
  callback: () => Promise<T>
) => {
  if (!hasDirectDatabaseConnection()) {
    return callback();
  }

  return withPostgresAdvisoryLock(`vehicle-checkout:${applicationId}`, callback);
};

export const buildHostedCheckoutSessionIdempotencyKey = ({
  applicationId,
  paymentLinkVersion,
  retryKeySeed,
}: {
  applicationId: string;
  paymentLinkVersion: number;
  retryKeySeed?: string | null;
}) => {
  const baseKey = `vehicle-checkout:${applicationId}:v${paymentLinkVersion}`;
  return retryKeySeed ? `${baseKey}:retry:${retryKeySeed}` : baseKey;
};

export const resolvePendingCheckoutSession = async ({
  application,
  carId,
}: {
  application: StripeApplication;
  carId: number | null;
}): Promise<PendingCheckoutSessionResolution> => {
  const pendingSessionId = application.pending_checkout_session_id;
  if (!pendingSessionId) {
    return {
      retryKeySeed: null,
      session: null,
    };
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(pendingSessionId);
    const sessionVersion = Number(session.metadata?.payment_link_version || 0);
    const sessionApplicationId = normalizeUuid(session.metadata?.application_id || '');
    const sessionCarId = Number(session.metadata?.car_id || 0) || null;
    const isSameContext =
      sessionApplicationId === normalizeUuid(application.id) &&
      sessionVersion === Number(application.payment_link_version || 0) &&
      session.metadata?.checkout_kind === 'vehicle' &&
      sessionCarId === carId;

    if (isSameContext && (session.status === 'open' || session.status === 'complete')) {
      return {
        retryKeySeed: null,
        session,
      };
    }
  } catch (error) {
    console.warn(`Unable to reuse checkout session ${pendingSessionId}:`, error);
  }

  return {
    retryKeySeed: pendingSessionId,
    session: null,
  };
};

export const getVehiclePaymentContext = async ({
  applicationId,
  checkoutToken,
}: {
  applicationId: string;
  checkoutToken: string;
}): Promise<VehiclePaymentContextResponse> => {
  const application = await fetchApplication(applicationId);

  if (!application) {
    throw new Error('Application not found');
  }

  if (application.status === 'Cancelled') {
    throw new Error('This application has been cancelled.');
  }

  const checkoutTokenPayload = verifyCheckoutToken({
    applicationId,
    purpose: 'vehicle',
    token: checkoutToken,
    version: Number(application.payment_link_version || 0),
  });
  const carId = getCheckoutTokenCarId(checkoutTokenPayload.carId);
  if (carId) {
    await requireCheckoutVehicleAvailable(carId);
  }
  requireApprovedPaymentContext({ application });

  return {
    applicant_name: application.name,
    application_id: applicationId,
    approved_vehicle: String(application.approved_vehicle || DEFAULT_APPROVED_VEHICLE_LABEL),
    billing: buildApprovedBillingBreakdown(application),
    car_id: carId,
    vehicle_image: DEFAULT_VEHICLE_IMAGE,
  };
};

export const createVehicleCheckoutSession = async ({
  applicationId,
  checkoutToken,
}: {
  applicationId: string;
  checkoutToken: string;
}): Promise<HostedCheckoutSessionResponse> => {
  return withOptionalCheckoutSessionLock<HostedCheckoutSessionResponse>(applicationId, async () => {
    const application = await fetchApplication(applicationId);

    if (!application) {
      throw new Error('Application not found');
    }

    if (application.status === 'Cancelled') {
      throw new Error('This application has been cancelled.');
    }

    const checkoutTokenPayload = verifyCheckoutToken({
      applicationId,
      purpose: 'vehicle',
      token: checkoutToken,
      version: Number(application.payment_link_version || 0),
    });
    const carId = getCheckoutTokenCarId(checkoutTokenPayload.carId);
    if (carId) {
      await requireCheckoutVehicleAvailable(carId);
    }
    requireApprovedPaymentContext({ application });

    const pendingSessionResolution = await resolvePendingCheckoutSession({
      application,
      carId,
    });

    if (pendingSessionResolution.session) {
      if (pendingSessionResolution.session.status === 'complete') {
        throw new Error('Payment has already been received and is being processed.');
      }

      if (pendingSessionResolution.session.url) {
        return {
          checkout_url: pendingSessionResolution.session.url,
          session_id: pendingSessionResolution.session.id,
        };
      }
    }

    const session = await createHostedCheckoutSession({
      application,
      billingBreakdown: buildApprovedBillingBreakdown(application),
      carId,
      checkoutToken,
      idempotencyKey: buildHostedCheckoutSessionIdempotencyKey({
        applicationId: application.id,
        paymentLinkVersion: Number(application.payment_link_version || 0),
        retryKeySeed: pendingSessionResolution.retryKeySeed,
      }),
    });
    const didPersistSession = await persistPendingCheckoutSessionId(
      applicationId,
      Number(application.payment_link_version || 0),
      session.id
    );

    if (!didPersistSession) {
      console.error('Failed to persist pending Stripe checkout session', {
        applicationId,
        checkoutSessionId: session.id,
        paymentLinkVersion: application.payment_link_version,
      });
      await expirePendingCheckoutSession(session.id);
      throw new Error('Payment link is no longer active. Please reload the latest link.');
    }

    console.info('Persisted pending Stripe checkout session', {
      applicationId,
      checkoutSessionId: session.id,
      stripeCustomerId:
        typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
      stripeSubscriptionId: getSessionSubscriptionId(session),
    });

    return {
      checkout_url: session.url,
      session_id: session.id,
    };
  });
};

export const createVehicleCheckoutLink = async ({
  applicationId,
}: {
  applicationId: string;
}) => {
  const application = await fetchApplication(applicationId);

  if (!application) {
    throw new Error('Application not found');
  }

  if (application.status === 'Cancelled') {
    throw new Error('This application has been cancelled.');
  }

  if (application.status === 'Paid') {
    throw new Error('This application has already been paid.');
  }

  if (application.status !== 'Approved') {
    throw new Error('Approve the application and save pricing before sending a payment link.');
  }

  requireApprovedPaymentContext({
    application,
  });

  const nextVersion = Number(application.payment_link_version || 0) + 1;
  await expirePendingCheckoutSession(application.pending_checkout_session_id);
  const updatedApplication =
    await updateApplicationPaymentStateIfCurrentVersion({
      applicationId,
      expectedPaymentLinkVersion: Number(application.payment_link_version || 0),
      payload: {
        payment_link_sent_at: new Date().toISOString(),
        payment_link_version: nextVersion,
        pending_checkout_session_id: null,
      },
    });

  if (!updatedApplication) {
    throw new Error('Payment link details changed while generating a new link. Refresh and try again.');
  }

  const checkoutToken = createCheckoutToken({
    applicationId,
    carId: null,
    purpose: 'vehicle',
    version: Number(updatedApplication.payment_link_version || nextVersion),
  });

  return {
    checkout_token: checkoutToken.token,
    checkout_token_expires_at: checkoutToken.expiresAt,
    checkout_url: buildDriverPaymentLink({
      applicationId,
      token: checkoutToken.token,
    }),
  };
};

const getConfirmedRentalStatus = async ({
  applicationId,
  carId,
  subscriptionId,
}: {
  applicationId: string;
  carId: number;
  subscriptionId: string | null;
}) => {
  const compat = await getSchemaCompat();
  const rentalApplicationIdColumn = await getRentalApplicationIdColumn();
  const rentalCarIdColumn = await getRentalCarIdColumn();
  const selectColumns = [
    'id',
    'status',
    rentalApplicationIdColumn,
    rentalCarIdColumn,
    compat.rentalStripeSubscriptionColumn,
  ]
    .filter((column): column is string => Boolean(column))
    .join(', ');
  const { data, error } = await db
    .from('rentals')
    .select(selectColumns)
    .eq(rentalApplicationIdColumn, applicationId)
    .eq(rentalCarIdColumn, carId);

  if (error) {
    throw new Error(
      `Failed to inspect local rental activation state: ${error.message || 'Unknown error'}`
    );
  }

  const rentals = ((data || []) as unknown) as Array<Record<string, unknown>>;
  const liveRentals = rentals.filter((rental) => isLiveRentalStatus(rental.status));
  const subscriptionColumn = compat.rentalStripeSubscriptionColumn;
  const matchingSubscriptionRental =
    subscriptionId && subscriptionColumn
      ? liveRentals.find(
          (rental) => String(rental[subscriptionColumn] || '') === subscriptionId
        )
      : null;
  const matchingRental = matchingSubscriptionRental || liveRentals[0];

  return matchingRental ? String(matchingRental.status || '') || null : null;
};

export const getVehicleCheckoutSessionStatus = async ({
  applicationId,
  checkoutToken,
  sessionId,
}: {
  applicationId: string;
  checkoutToken?: string | null;
  sessionId: string;
}): Promise<VehicleCheckoutSessionStatusResponse> => {
  const application = await fetchApplication(applicationId);

  if (!application) {
    throw new Error('Application not found');
  }

  const {
    carId,
    metadataMatch,
    session,
    subscriptionId,
  } = await verifyCheckoutSessionContext({
    application,
    applicationId,
    checkoutToken,
    sessionId,
  });
  const metadataCheckoutKind = session.metadata?.checkout_kind || null;

  const rentalStatus = carId
    ? await getConfirmedRentalStatus({
        applicationId,
        carId,
        subscriptionId,
      })
    : null;
  const internalStatus = getVehicleCheckoutLifecycleState({
    applicationStatus: application.status,
    carId,
    rentalStatus,
    session,
  });
  const paymentMethodTypes = getSessionPaymentMethodTypes(session);

  return {
    application_status: application.status,
    checkout_kind: metadataCheckoutKind,
    customer_id: getSessionCustomerId(session),
    db_payment_activation_status: {
      application_status: application.status,
      activated: internalStatus === 'complete_paid',
      pending_checkout_session_id: application.pending_checkout_session_id || null,
      rental_status: rentalStatus,
    },
    id: session.id,
    internal_status: internalStatus,
    metadata_match: metadataMatch,
    payment_method_type: paymentMethodTypes[0] || null,
    payment_method_types: paymentMethodTypes,
    payment_status: session.payment_status,
    rental_status: rentalStatus,
    state: internalStatus,
    status: session.status,
    subscription_id: subscriptionId,
  };
};
