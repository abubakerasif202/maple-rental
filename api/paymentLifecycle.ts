import type Stripe from 'stripe';

import { recordAdminAuditEvent } from './adminAudit.js';
import { db } from './db/index.js';
import { hasDirectDatabaseConnection, withPostgresAdvisoryLock } from './db/postgres.js';
import { getRentalApplicationIdColumn, getSchemaCompat } from './schemaCompat.js';
import { getStripeClient } from './stripeClient.js';
import { isValidDateOnly } from '../shared/applicationSubmission.js';
import { normalizeUuid } from '../shared/uuid.js';

const getStripe = () => getStripeClient();

/**
 * Stripe subscription states Maple treats as safe to activate operationally.
 *
 * Deliberately a narrow allow-list rather than a deny-list. Maple bills a
 * weekly subscription; a future approved start date is expressed with
 * `billing_cycle_anchor` plus `proration_behavior: 'none'`, which Stripe
 * reports as `active` or `trialing`. Every other state (`past_due`, `unpaid`,
 * `incomplete`, `incomplete_expired`, `canceled`, `paused`) means billing is
 * not healthy and must not become a live operational rental.
 */
export const ACTIVATION_ELIGIBLE_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
  'active',
  'trialing',
]);

/** Application states that constitute verified payment for lifecycle purposes. */
const PAID_APPLICATION_STATUSES: ReadonlySet<string> = new Set(['Paid']);

/** A rental is "live" unless it has reached a terminal state. */
const TERMINAL_RENTAL_STATUSES: ReadonlySet<string> = new Set(['completed', 'cancelled']);

export const isLiveRentalStatus = (status: unknown) =>
  !TERMINAL_RENTAL_STATUSES.has(String(status || '').trim().toLowerCase());

export class PaymentLifecycleError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, { status = 409, code }: { status?: number; code: string }) {
    super(message);
    this.name = 'PaymentLifecycleError';
    this.status = status;
    this.code = code;
  }
}

const databaseErrorField = (error: unknown, field: string) => {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string' ? value.trim() : '';
};

const sanitizeDatabaseErrorCode = (error: unknown) => {
  const code = databaseErrorField(error, 'code');
  return /^[a-z0-9_]{1,32}$/i.test(code) ? code : 'unknown';
};

const sanitizeDatabaseErrorMessage = (error: unknown) => {
  const message = databaseErrorField(error, 'message');
  if (!message) {
    return 'Database insert failed.';
  }

  const sanitized = message
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\b(?:cus|sub|cs|pi|pm|in|evt|price|prod|sk|pk)_[a-z0-9_]+\b/gi, '[redacted-id]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[redacted-uuid]')
    .replace(/\b(?:\+?61|0)4(?:[ -]?\d){8}\b/g, '[redacted-phone]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);

  const safeConstraintMessagePatterns = [
    /^null value in column "[a-z_][a-z0-9_]*" of relation "[a-z_][a-z0-9_]*" violates not-null constraint$/i,
    /^duplicate key value violates unique constraint "[a-z_][a-z0-9_]*"$/i,
    /^insert or update on table "[a-z_][a-z0-9_]*" violates foreign key constraint "[a-z_][a-z0-9_]*"$/i,
    /^new row for relation "[a-z_][a-z0-9_]*" violates check constraint "[a-z_][a-z0-9_]*"$/i,
    /^column "[a-z_][a-z0-9_]*" of relation "[a-z_][a-z0-9_]*" does not exist$/i,
    /^relation "[a-z_][a-z0-9_.]*" does not exist$/i,
    /^permission denied for (?:table|sequence) [a-z_][a-z0-9_]*$/i,
    /^Could not find the '[a-z_][a-z0-9_]*' column of '[a-z_][a-z0-9_]*' in the schema cache$/i,
  ];

  return safeConstraintMessagePatterns.some((pattern) => pattern.test(sanitized))
    ? sanitized
    : 'Database insert failed.';
};

export class RentalActivationPersistenceError extends Error {
  readonly databaseCode: string;
  readonly databaseMessage: string;

  constructor(databaseError: unknown) {
    super('Rental persistence failed.');
    this.name = 'RentalActivationPersistenceError';
    this.databaseCode = sanitizeDatabaseErrorCode(databaseError);
    this.databaseMessage = sanitizeDatabaseErrorMessage(databaseError);
  }
}

export const getRentalActivationErrorLog = (error: unknown) => ({
  errorName: error instanceof Error ? error.name : 'UnknownError',
  ...(error instanceof RentalActivationPersistenceError
    ? {
        databaseCode: error.databaseCode,
        databaseMessage: error.databaseMessage,
      }
    : {}),
});

const conflict = (code: string, message: string) =>
  new PaymentLifecycleError(message, { code, status: 409 });

export type VerifiedStripeRelationship = {
  applicationId: string;
  checkoutSessionId: string | null;
  customerId: string;
  paymentLinkVersion: number;
  subscriptionId: string;
};

export type PendingRentalActivation = {
  application_id: string;
  applicant_name: string;
  approved_vehicle: string | null;
  approved_weekly_price: number | null;
  paid_at: string | null;
  start_date: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

const stripeObjectId = (value: string | { id?: string } | null | undefined) =>
  typeof value === 'string' ? value : value?.id || null;

/**
 * What a customer resolution actually changed about operational identity.
 *
 * `unchanged` covers replay: the operational customer already carries both the
 * application link and the Stripe customer id, so no identity mutation
 * occurred and no audit event may be written for it.
 */
type OperationalCustomerOperation = 'create' | 'link' | 'unchanged';

/** Audit source for anything driven by verified Stripe lifecycle identity. */
const VERIFIED_STRIPE_AUDIT_SOURCE = 'verified-stripe-lifecycle';

/**
 * Canonical, alias-mapped application projection. Column names differ between
 * the snake_case and camelCase deployments, so every read goes through
 * schemaCompat and is aliased back to canonical snake_case keys.
 */
const buildApplicationLifecycleSelect = async () => {
  const compat = await getSchemaCompat();
  const alias = (canonical: string, actual: string) =>
    canonical === actual ? canonical : `${canonical}:${actual}`;

  return [
    'id',
    'name',
    'email',
    'phone',
    'address',
    'status',
    'stripe_checkout_session_id',
    'stripe_customer_id',
    'stripe_subscription_id',
    alias('approved_vehicle', compat.applicationApprovedVehicleColumn),
    alias('approved_weekly_price', compat.applicationApprovedWeeklyPriceColumn),
    alias('intended_start_date', compat.applicationIntendedStartDateColumn),
    alias('paid_at', compat.applicationPaidAtColumn),
    alias('payment_link_version', compat.applicationPaymentLinkVersionColumn),
  ].join(', ');
};

type ApplicationLifecycleRow = {
  address?: string | null;
  approved_vehicle?: string | null;
  approved_weekly_price?: number | string | null;
  email?: string | null;
  id: string;
  intended_start_date?: string | null;
  name?: string | null;
  paid_at?: string | null;
  payment_link_version?: number | null;
  phone?: string | null;
  status?: string | null;
  stripe_checkout_session_id?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
};

const fetchApplicationForLifecycle = async (applicationId: string) => {
  const { data, error } = await db
    .from('applications')
    .select(await buildApplicationLifecycleSelect())
    .eq('id', applicationId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to read application for payment lifecycle: ${error.message || 'Unknown error'}`
    );
  }

  return (data as unknown as ApplicationLifecycleRow | null) || null;
};

/**
 * Resolve the operational customer for a verified paid application.
 *
 * Identity precedence is durable-first and never falls back to name matching:
 *   1. an existing customer already linked to this application
 *   2. an existing customer already carrying this Stripe customer id
 *   3. insert a new operational customer
 *
 * Any cross-linkage between a different application and this Stripe customer
 * is ambiguous and is escalated for manual review instead of being merged.
 */
const resolveOperationalCustomer = async (
  application: ApplicationLifecycleRow,
  stripeCustomerId: string
) => {
  const applicationId = String(application.id);

  const byApplication = await db
    .from('customers')
    .select('id, application_id, stripe_customer_id')
    .eq('application_id', applicationId)
    .maybeSingle();
  if (byApplication.error) {
    throw new Error(
      `Failed to resolve operational customer by application: ${byApplication.error.message || 'Unknown error'}`
    );
  }

  const byStripeCustomer = await db
    .from('customers')
    .select('id, application_id, stripe_customer_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();
  if (byStripeCustomer.error) {
    throw new Error(
      `Failed to resolve operational customer by Stripe identity: ${byStripeCustomer.error.message || 'Unknown error'}`
    );
  }

  const existingByApplication = byApplication.data;
  const existingByStripe = byStripeCustomer.data;

  if (
    existingByApplication &&
    existingByStripe &&
    Number(existingByApplication.id) !== Number(existingByStripe.id)
  ) {
    throw conflict(
      'customer_identity_ambiguous',
      'This application and Stripe customer resolve to two different operational customers. Manual review is required.'
    );
  }

  if (
    existingByApplication?.stripe_customer_id &&
    existingByApplication.stripe_customer_id !== stripeCustomerId
  ) {
    throw conflict(
      'customer_identity_ambiguous',
      'The operational customer for this application is already linked to a different Stripe customer. Manual review is required.'
    );
  }

  if (
    existingByStripe?.application_id &&
    String(existingByStripe.application_id) !== applicationId
  ) {
    throw conflict(
      'customer_identity_ambiguous',
      'This Stripe customer is already linked to another application. Manual review is required.'
    );
  }

  const target = existingByApplication || existingByStripe || null;

  // Contact details are refreshed from the application, which is the record the
  // applicant actually signed. Bond and billing fields are deliberately absent:
  // bond is agreement data and is never derived from Stripe.
  const contactPayload = {
    application_id: applicationId,
    email: application.email || null,
    full_name: String(application.name || '').trim() || 'Maple Rentals customer',
    phone: application.phone || null,
    street: application.address || null,
    stripe_customer_id: stripeCustomerId,
    updated_at: new Date().toISOString(),
  };

  if (target?.id) {
    // Replay detection: the durable identity link is exactly these two columns.
    // If both already point at this application and this Stripe customer, the
    // update below only refreshes contact details and is not a new link.
    const alreadyLinked =
      String(target.application_id || '') === applicationId &&
      String(target.stripe_customer_id || '') === stripeCustomerId;

    const update = await db.from('customers').update(contactPayload).eq('id', target.id);
    if (update.error) {
      throw new Error(
        `Failed to update operational customer: ${update.error.message || 'Unknown error'}`
      );
    }
    return {
      customerId: Number(target.id),
      operation: (alreadyLinked ? 'unchanged' : 'link') as OperationalCustomerOperation,
    };
  }

  const inserted = await db
    .from('customers')
    .insert({
      ...contactPayload,
      external_id: `stripe:${stripeCustomerId}`,
      source: 'stripe-verified',
    })
    .select('id')
    .single();

  if (!inserted.error) {
    return {
      customerId: Number(inserted.data.id),
      operation: 'create' as OperationalCustomerOperation,
    };
  }

  // A concurrent webhook may have won the partial unique index. Re-read rather
  // than inserting a duplicate operational customer. The winning writer records
  // the create audit event, so this loser reports no mutation of its own.
  const raced = await db
    .from('customers')
    .select('id')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();
  if (raced.data?.id) {
    return {
      customerId: Number(raced.data.id),
      operation: 'unchanged' as OperationalCustomerOperation,
    };
  }

  throw new Error(
    `Failed to create operational customer: ${inserted.error.message || 'Unknown error'}`
  );
};

/**
 * Persist a Stripe relationship that has already been verified against trusted
 * Stripe metadata, and create or link the operational customer.
 *
 * This is payment-only bookkeeping. It records identity and makes the paid
 * subscription visible to admins. It never creates a rental, never assigns a
 * vehicle, and never mutates fleet state.
 */
export const persistVerifiedStripeRelationship = async (
  input: VerifiedStripeRelationship
) => {
  const applicationId = normalizeUuid(input.applicationId);
  const application = await fetchApplicationForLifecycle(applicationId);

  if (!application) {
    throw conflict(
      'application_missing',
      'Application not found for the verified Stripe relationship.'
    );
  }

  if (String(application.status) === 'Cancelled') {
    throw conflict(
      'application_cancelled',
      'Cancelled applications do not become operational customers.'
    );
  }

  // Identity must match the payment link the customer actually paid against.
  const currentVersion = Number(application.payment_link_version || 0);
  if (Number(input.paymentLinkVersion) !== currentVersion) {
    throw conflict(
      'payment_link_version_mismatch',
      `Stripe relationship belongs to payment link version ${input.paymentLinkVersion}, but the application is on version ${currentVersion}.`
    );
  }

  if (
    application.stripe_subscription_id &&
    application.stripe_subscription_id !== input.subscriptionId
  ) {
    throw conflict(
      'subscription_identity_conflict',
      'This application is already linked to a different Stripe subscription. Manual review is required.'
    );
  }

  const applicationUpdate = await db
    .from('applications')
    .update({
      ...(input.checkoutSessionId
        ? { stripe_checkout_session_id: input.checkoutSessionId }
        : {}),
      stripe_customer_id: input.customerId,
      stripe_subscription_id: input.subscriptionId,
    })
    .eq('id', applicationId);

  if (applicationUpdate.error) {
    throw new Error(
      `Failed to persist verified Stripe identity: ${applicationUpdate.error.message || 'Unknown error'}`
    );
  }

  // An operational customer represents a real paying Maple customer. Verified
  // Stripe identity alone is NOT sufficient to create one: a subscription can
  // exist against an application that never reached verified payment (for
  // example an Approved application whose subscription was later canceled).
  // Recording identity above is safe bookkeeping; asserting an operational
  // customer is not. The payment-only fulfilment path sets 'Paid' before it
  // calls this function, so this gate never blocks a genuine paid checkout.
  if (!PAID_APPLICATION_STATUSES.has(String(application.status))) {
    return { customerId: null };
  }

  const { customerId, operation } = await resolveOperationalCustomer(
    application,
    input.customerId
  );

  // Creating or linking an operational customer is a real business mutation and
  // must leave an append-only trail. A replay resolves to `unchanged`, so it
  // never produces a misleading duplicate mutation record.
  //
  // The metadata is deliberately redacted: identifiers and the operation only.
  // No Stripe or Supabase credentials, no payment method data, and no applicant
  // contact details are recorded here.
  if (operation !== 'unchanged') {
    await recordAdminAuditEvent({
      action:
        operation === 'create'
          ? 'operational_customer_created'
          : 'operational_customer_linked',
      actor: null,
      metadata: {
        applicationId,
        customerId,
        operation,
        paymentLinkVersion: currentVersion,
        source: VERIFIED_STRIPE_AUDIT_SOURCE,
        stripeCustomerId: input.customerId,
        stripeSubscriptionId: input.subscriptionId,
      },
      targetId: applicationId,
      targetType: 'application',
    });
  }

  return { customerId };
};

/**
 * Persist the relationship implied by a Checkout Session.
 *
 * Called only from the payment-only fulfilment path, which has already
 * verified the signed token, the application status, and the payment link
 * version. The session is re-checked here so the function is safe to call
 * from reconciliation as well.
 */
export const persistCheckoutRelationshipFromSession = async (
  session: Stripe.Checkout.Session
) => {
  const applicationId = normalizeUuid(session.metadata?.application_id || '');
  const customerId = stripeObjectId(session.customer);
  const subscriptionId = stripeObjectId(session.subscription);
  const paymentLinkVersion = Number(session.metadata?.payment_link_version || 0);

  if (session.metadata?.checkout_kind !== 'vehicle') {
    return null;
  }

  if (!applicationId || !customerId || !subscriptionId || paymentLinkVersion <= 0) {
    return null;
  }

  return persistVerifiedStripeRelationship({
    applicationId,
    checkoutSessionId: session.id,
    customerId,
    paymentLinkVersion,
    subscriptionId,
  });
};

/**
 * Paid applications with a verified Stripe subscription that have no live
 * rental yet.
 *
 * These are NOT rentals. They are returned as their own domain type so the
 * admin UI cannot offer rental-only actions (cancellation, toll notices,
 * maintenance) against an identifier that does not exist.
 */
export const listPendingRentalActivations = async ({
  search = '',
}: { search?: string } = {}): Promise<PendingRentalActivation[]> => {
  const compat = await getSchemaCompat();
  const rentalApplicationIdColumn = await getRentalApplicationIdColumn();

  const { data, error } = await db
    .from('applications')
    .select(await buildApplicationLifecycleSelect())
    .eq('status', 'Paid')
    .not('stripe_subscription_id', 'is', null)
    .not('stripe_customer_id', 'is', null)
    .order(compat.applicationPaidAtColumn, { ascending: false });

  if (error) {
    throw new Error(
      `Failed to load paid applications awaiting activation: ${error.message || 'Unknown error'}`
    );
  }

  const paidApplications = (data as unknown as ApplicationLifecycleRow[]) || [];
  if (paidApplications.length === 0) {
    return [];
  }

  const rentalsResult = await db
    .from('rentals')
    .select(`${rentalApplicationIdColumn}, status`)
    .in(
      rentalApplicationIdColumn,
      paidApplications.map((application) => String(application.id))
    );

  if (rentalsResult.error) {
    throw new Error(
      `Failed to inspect existing rentals for activation state: ${rentalsResult.error.message || 'Unknown error'}`
    );
  }

  // Only a LIVE rental removes an application from the pending list. A
  // historical completed or cancelled rental must not hide a newly paid
  // subscription that still needs operational activation.
  const applicationsWithLiveRental = new Set(
    ((rentalsResult.data || []) as Array<Record<string, unknown>>)
      .filter((row) => isLiveRentalStatus(row.status))
      .map((row) => String(row[rentalApplicationIdColumn]))
  );

  const normalizedSearch = search.trim().toLowerCase();

  return paidApplications
    .filter((application) => !applicationsWithLiveRental.has(String(application.id)))
    .filter((application) => {
      if (!normalizedSearch) {
        return true;
      }

      return [
        application.name,
        application.approved_vehicle,
        application.email,
        application.stripe_customer_id,
        application.stripe_subscription_id,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    })
    .map((application) => ({
      application_id: String(application.id),
      applicant_name: String(application.name || ''),
      approved_vehicle: application.approved_vehicle ?? null,
      approved_weekly_price:
        application.approved_weekly_price == null
          ? null
          : Number(application.approved_weekly_price),
      paid_at: application.paid_at ?? null,
      start_date: application.intended_start_date ?? null,
      stripe_customer_id: application.stripe_customer_id ?? null,
      stripe_subscription_id: application.stripe_subscription_id ?? null,
    }));
};

const withActivationLock = async <T>(applicationId: string, callback: () => Promise<T>) => {
  if (!hasDirectDatabaseConnection()) {
    return callback();
  }

  return withPostgresAdvisoryLock(`activate-rental:${applicationId}`, callback);
};

const findLiveRentalForApplication = async (applicationId: string) => {
  const rentalApplicationIdColumn = await getRentalApplicationIdColumn();
  const { data, error } = await db
    .from('rentals')
    .select('*')
    .eq(rentalApplicationIdColumn, applicationId);

  if (error) {
    throw new Error(
      `Failed to inspect existing rentals: ${error.message || 'Unknown error'}`
    );
  }

  const rows = ((data || []) as unknown) as Array<Record<string, unknown>>;
  return rows.find((row) => isLiveRentalStatus(row.status)) || null;
};

/**
 * Explicit, admin-authorized operational activation.
 *
 * This is the only path that creates a rental. It is deliberately separate
 * from payment: Checkout never calls it. It does not assign a vehicle from a
 * fleet catalogue and does not mutate fleet availability — the rental carries
 * the approved registration text the admin already entered.
 */
export const activateRentalForApplication = async (
  rawApplicationId: string,
  actor: string | null
) => {
  const applicationId = normalizeUuid(rawApplicationId);

  return withActivationLock(applicationId, async () => {
    const compat = await getSchemaCompat();
    const rentalApplicationIdColumn = await getRentalApplicationIdColumn();
    const application = await fetchApplicationForLifecycle(applicationId);

    if (!application) {
      throw new PaymentLifecycleError('Application not found.', {
        code: 'application_missing',
        status: 404,
      });
    }

    if (!PAID_APPLICATION_STATUSES.has(String(application.status))) {
      throw conflict(
        'application_not_paid',
        `Only Paid applications can be activated. This application is ${application.status || 'Unknown'}.`
      );
    }

    const storedSubscriptionId = String(application.stripe_subscription_id || '').trim();
    const storedCustomerId = String(application.stripe_customer_id || '').trim();
    if (!storedSubscriptionId || !storedCustomerId) {
      throw conflict(
        'stripe_identity_missing',
        'A verified Stripe customer and subscription must be linked before activation. Run reconciliation first.'
      );
    }

    // Idempotency: an existing LIVE rental for this application is the same
    // operational rental, so return it. A completed or cancelled rental is
    // history and must not be resurrected as the new active rental.
    const existingLiveRental = await findLiveRentalForApplication(applicationId);
    if (existingLiveRental) {
      const existingSubscriptionId = compat.rentalStripeSubscriptionColumn
        ? String(existingLiveRental[compat.rentalStripeSubscriptionColumn] || '')
        : '';

      if (existingSubscriptionId && existingSubscriptionId !== storedSubscriptionId) {
        throw conflict(
          'rental_subscription_conflict',
          'A live rental already exists for this application under a different Stripe subscription. Manual review is required.'
        );
      }

      return { created: false as const, rental: existingLiveRental };
    }

    // The stored identity is not sufficient on its own. Confirm against Stripe
    // that the subscription still exists, still belongs to the same customer,
    // and is in a state Maple considers safe to operate.
    const subscription = await getStripe().subscriptions.retrieve(storedSubscriptionId);
    const subscriptionCustomerId = stripeObjectId(subscription.customer);

    if (subscriptionCustomerId !== storedCustomerId) {
      throw conflict(
        'stripe_identity_mismatch',
        'The Stripe subscription is not owned by the linked Stripe customer. Manual review is required.'
      );
    }

    const subscriptionApplicationId = normalizeUuid(
      subscription.metadata?.application_id || ''
    );
    if (subscriptionApplicationId && subscriptionApplicationId !== applicationId) {
      throw conflict(
        'stripe_identity_mismatch',
        'The Stripe subscription metadata refers to a different application. Manual review is required.'
      );
    }

    if (!ACTIVATION_ELIGIBLE_SUBSCRIPTION_STATUSES.has(String(subscription.status))) {
      throw conflict(
        'subscription_not_activatable',
        `Stripe subscription status "${subscription.status}" is not eligible for rental activation.`
      );
    }

    const approvedVehicle = String(application.approved_vehicle || '').trim();
    if (!approvedVehicle) {
      throw conflict(
        'approved_vehicle_missing',
        'The approved vehicle or number plate is missing from the application.'
      );
    }

    const approvedWeeklyPrice = Number(application.approved_weekly_price || 0);
    if (!Number.isFinite(approvedWeeklyPrice) || approvedWeeklyPrice <= 0) {
      throw conflict(
        'approved_price_invalid',
        'The approved weekly price on the application is not a valid amount.'
      );
    }

    // The approved rental start date is authoritative. Never silently fall back
    // to today: an incorrect start date changes what the customer is billed for
    // operationally and would be invisible to the admin.
    const startDate = String(application.intended_start_date || '').trim();
    if (!isValidDateOnly(startDate)) {
      throw conflict(
        'start_date_invalid',
        'The approved rental start date is missing or invalid. Correct the application before activating.'
      );
    }

    const { customerId } = await resolveOperationalCustomer(application, storedCustomerId);

    const rentalPayload: Record<string, unknown> = {
      [rentalApplicationIdColumn]: applicationId,
      customer_id: customerId,
      status: 'Active',
      vehicle_registration: approvedVehicle,
      weekly_price: approvedWeeklyPrice,
      [compat.coreMode === 'camel' ? 'startDate' : 'start_date']: startDate,
    };

    // bond_paid is intentionally omitted. Maple's bond is never charged through
    // Stripe; it is agreement data tracked on the application via
    // bond_payment_status/bond_payment_method. Writing 0 here would assert that
    // no bond was collected, which is false for cash_paid and already_paid.
    if (compat.rentalStripeSubscriptionColumn) {
      rentalPayload[compat.rentalStripeSubscriptionColumn] = storedSubscriptionId;
    }
    if (compat.rentalStripeCustomerColumn) {
      rentalPayload[compat.rentalStripeCustomerColumn] = storedCustomerId;
    }

    const inserted = await db.from('rentals').insert(rentalPayload).select('*').single();

    if (inserted.error) {
      // The partial unique indexes are the authoritative duplicate guard. If a
      // concurrent activation won, return that rental instead of failing.
      const raced = await findLiveRentalForApplication(applicationId);
      if (raced) {
        return { created: false as const, rental: raced };
      }

      throw new RentalActivationPersistenceError(inserted.error);
    }

    await recordAdminAuditEvent({
      action: 'rental_activated',
      actor,
      metadata: {
        rentalId: inserted.data.id,
        startDate,
        stripeSubscriptionStatus: subscription.status,
        vehicleRegistration: approvedVehicle,
        weeklyPrice: approvedWeeklyPrice,
      },
      targetId: applicationId,
      targetType: 'application',
    });

    return { created: true as const, rental: inserted.data };
  });
};

const toIsoDateOnly = (epochSeconds: number | null | undefined) => {
  if (!Number.isFinite(Number(epochSeconds)) || Number(epochSeconds) <= 0) {
    return null;
  }

  return new Date(Number(epochSeconds) * 1000).toISOString().slice(0, 10);
};

/**
 * Mirror a Stripe subscription invoice into operational invoice history.
 *
 * Uses the real Stripe invoice id as the idempotency key. Nothing is inferred:
 * if the invoice has no resolvable operational customer, the sync is skipped
 * rather than fabricating a customer or an invoice.
 */
export const syncStripeInvoice = async (
  invoice: Stripe.Invoice,
  customerId: string | null,
  subscriptionId: string | null
) => {
  const invoiceId = typeof invoice.id === 'string' ? invoice.id : null;
  if (!invoiceId || !customerId) {
    return { synced: false as const, reason: 'missing_identity' };
  }

  const invoiceDate = toIsoDateOnly(invoice.created);
  if (!invoiceDate) {
    return { synced: false as const, reason: 'invalid_invoice_date' };
  }

  const customer = await db
    .from('customers')
    .select('id, full_name')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (customer.error) {
    throw new Error(
      `Failed to resolve customer for Stripe invoice sync: ${customer.error.message || 'Unknown error'}`
    );
  }

  if (!customer.data?.id) {
    // The operational customer is only created once payment is verified. An
    // invoice arriving before that is not an error; it will be reconciled.
    return { synced: false as const, reason: 'customer_not_linked' };
  }

  const amount = Number(invoice.amount_due ?? 0) / 100;
  const amountRemaining = Number(
    invoice.amount_remaining ?? invoice.amount_due ?? 0
  ) / 100;
  const isPaid = invoice.status === 'paid';

  const payload = {
    amount: Math.max(amount, 0),
    balance: isPaid ? 0 : Math.max(amountRemaining, 0),
    customer_id: Number(customer.data.id),
    customer_name: String(customer.data.full_name || 'Maple Rentals customer'),
    due_label: isPaid ? 'Paid' : 'Due',
    external_invoice_number: `stripe:${invoiceId}`,
    invoice_date: invoiceDate,
    source: 'stripe-verified',
    stripe_invoice_id: invoiceId,
    stripe_subscription_id: subscriptionId,
    transaction_summary: `Stripe subscription invoice (${invoice.status || 'unknown'})`,
  };

  const existing = await db
    .from('invoices')
    .select('id')
    .eq('stripe_invoice_id', invoiceId)
    .maybeSingle();

  if (existing.error) {
    throw new Error(
      `Failed to look up existing Stripe invoice: ${existing.error.message || 'Unknown error'}`
    );
  }

  const result = existing.data?.id
    ? await db.from('invoices').update(payload).eq('id', existing.data.id)
    : await db.from('invoices').insert(payload);

  if (result.error) {
    throw new Error(
      `Failed to sync Stripe invoice: ${result.error.message || 'Unknown error'}`
    );
  }

  return { synced: true as const, updated: Boolean(existing.data?.id) };
};
