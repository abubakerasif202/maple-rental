import Stripe from 'stripe';

import { FALLBACK_ADMIN_EMAIL } from './constants.js';
import { db } from './db/index.js';
import {
  hasDirectDatabaseConnection,
  withPostgresAdvisoryLock,
  withPostgresTransaction,
} from './db/postgres.js';
import {
  transitionApplicationToPaymentReviewIfCurrentVersion,
} from './applicationPaymentState.js';
import {
  getApplicationSelectColumns,
  getCarSelectColumns,
  getRentalApplicationIdColumn,
  getRentalCarIdColumn,
  getSchemaCompat,
  toApplicationPaymentWritePayload,
  toRentalWritePayload,
} from './schemaCompat.js';
import { getTodayInAustralia } from '../shared/applicationSubmission.js';
import { escapeHtml, getResend, sendResendEmail } from './email.js';
import {
  AUTOMATIC_PAYMENT_ACTIVATION_RESTRICTED_REASON,
  hasTransactionalPaymentProcessing,
} from './paymentProcessing.js';
import { normalizeUuid } from '../shared/uuid.js';

const VEHICLE_CHECKOUT_FULFILLMENT_EVENT_TYPE =
  'vehicle_checkout.fulfillment.processed';

const buildVehicleCheckoutFulfillmentLedgerId = (sessionId: string) =>
  `fulfill:vehicle-checkout:${sessionId}`;

const assertSupabaseWrite = (
  result: { error: { code?: string; message?: string } | null } | null | undefined,
  context: string
) => {
  if (result?.error) {
    throw new Error(`${context}: ${result.error.message || 'Unknown Supabase error'}`);
  }
};

const isDuplicateWrite = (error: unknown) =>
  Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      String((error as { code?: string }).code || '') === '23505'
  );

const isLiveRentalStatus = (status: unknown) => {
  const normalized = String(status || '').toLowerCase();
  return normalized !== 'completed' && normalized !== 'cancelled';
};

const getApplicationRentalStartDate = (application: Record<string, unknown>) => {
  const value = String(
    application.intended_start_date ?? application.intendedStartDate ?? ''
  ).trim();

  return value || getTodayInAustralia();
};

export const getRentalStatusUpdatePayload = async (status: string, endDate?: string) => {
  const compat = await getSchemaCompat();
  const payload: Record<string, unknown> = { status };

  if (endDate) {
    payload[compat.coreMode === 'camel' ? 'endDate' : 'end_date'] = endDate;
  }

  return payload;
};

const updateApplicationPaymentState = async ({
  applicationId,
  expectedPaymentLinkVersion,
  paidAt,
  pendingCheckoutSessionId,
  status,
}: {
  applicationId: string;
  expectedPaymentLinkVersion?: number;
  paidAt?: string | null;
  pendingCheckoutSessionId?: string | null;
  status?: string;
}) => {
  if (
    status === 'Payment Review' &&
    typeof expectedPaymentLinkVersion === 'number'
  ) {
    return transitionApplicationToPaymentReviewIfCurrentVersion({
      applicationId,
      paidAt,
      pendingCheckoutSessionId,
    });
  }

  const payload = await toApplicationPaymentWritePayload({
    paid_at: paidAt,
    pending_checkout_session_id: pendingCheckoutSessionId,
    status,
  });
  const result = await db.from('applications').update(payload).eq('id', applicationId);
  assertSupabaseWrite(result, 'Failed to update application payment state');
  return null;
};

export const updateRentalsBySubscriptionIdentity = async (
  subscriptionId: string,
  metadata: Record<string, string | undefined>,
  payload: Record<string, unknown>
) => {
  const compat = await getSchemaCompat();

  if (!compat.rentalStripeSubscriptionColumn) {
    throw new Error(
      'Rental schema is missing a Stripe subscription identity column; refusing fallback rental updates.'
    );
  }

  const { data: rentalBySubscription, error: rentalBySubscriptionError } = await db
    .from('rentals')
    .select('id')
    .eq(compat.rentalStripeSubscriptionColumn, subscriptionId)
    .maybeSingle();

  if (rentalBySubscriptionError) {
    throw new Error(
      `Failed to inspect rental by subscription id: ${rentalBySubscriptionError.message || 'Unknown error'}`
    );
  }

  if (!rentalBySubscription?.id) {
    const safeApplicationId = typeof metadata.application_id === 'string'
      ? normalizeUuid(metadata.application_id)
      : null;
    const safeCarId = Number(metadata.car_id || 0) || null;
    throw new Error(
      `No rental found for Stripe subscription ${subscriptionId}. ` +
        `Refusing fallback update for application=${String(safeApplicationId)} car=${String(safeCarId)}.`
    );
  }

  const result = await db.from('rentals').update(payload).eq('id', rentalBySubscription.id);
  assertSupabaseWrite(result, 'Failed to update rental by subscription id');
};

const quoteIdentifier = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;

export const buildLockedApplicationSelectSql = async () => {
  const {
    applicationAssignedCarColumn,
    applicationPaymentLinkVersionColumn,
  } = await getSchemaCompat();
  const assignedCarSelect = applicationAssignedCarColumn
    ? `${quoteIdentifier(applicationAssignedCarColumn)} AS assigned_car_id`
    : 'NULL::bigint AS assigned_car_id';

  return (
    `SELECT status, ` +
    `${quoteIdentifier(applicationPaymentLinkVersionColumn)} AS payment_link_version, ` +
    `${assignedCarSelect} ` +
    `FROM ${quoteIdentifier('applications')} WHERE id = $1 FOR UPDATE`
  );
};

export const withVehicleCheckoutProcessingLock = async <T>(
  applicationId: string,
  callback: () => Promise<T>
) => {
  if (!hasDirectDatabaseConnection()) {
    return callback();
  }

  return withPostgresAdvisoryLock(`vehicle-checkout:${applicationId}`, callback);
};

const stripRentalIdentityFields = (payload: Record<string, unknown>) => {
  const {
    startDate: _unusedCamelStartDate,
    start_date: _unusedSnakeStartDate,
    carId: _unusedCamelCarId,
    car_id: _unusedSnakeCarId,
    applicationId: _unusedCamelApplicationId,
    application_id: _unusedSnakeApplicationId,
    ...repairPayload
  } = payload;

  return repairPayload;
};

const insertRowInTransaction = async (
  client: import('pg').PoolClient,
  table: string,
  payload: Record<string, unknown>
) => {
  const entries = Object.entries(payload);
  const columns = entries.map(([column]) => quoteIdentifier(column)).join(', ');
  const placeholders = entries.map((_, index) => `$${index + 1}`).join(', ');
  const values = entries.map(([, value]) => value);

  const result = await client.query(
    `INSERT INTO ${quoteIdentifier(table)} (${columns}) VALUES (${placeholders})`,
    values
  );

  if (result.rowCount !== 1) {
    throw new Error(`Failed to insert ${table} row within transaction.`);
  }
};

const updateRowByIdInTransaction = async (
  client: import('pg').PoolClient,
  table: string,
  id: number | string,
  payload: Record<string, unknown>,
  context: string
) => {
  const entries = Object.entries(payload);
  const setClauses = entries
    .map(([column], index) => `${quoteIdentifier(column)} = $${index + 1}`)
    .join(', ');
  const values = [...entries.map(([, value]) => value), id];

  const result = await client.query(
    `UPDATE ${quoteIdentifier(table)} SET ${setClauses} WHERE id = $${entries.length + 1}`,
    values
  );

  if (result.rowCount !== 1) {
    throw new Error(context);
  }
};

const readVehicleCheckoutFulfillmentMarkerInTransaction = async (
  client: import('pg').PoolClient,
  sessionId: string
) =>
  client.query(
    'SELECT id, event_type FROM stripe_webhook_events WHERE stripe_event_id = $1 FOR UPDATE',
    [buildVehicleCheckoutFulfillmentLedgerId(sessionId)]
  );

const persistVehicleCheckoutFulfillmentMarkerInTransaction = async (
  client: import('pg').PoolClient,
  sessionId: string,
  existingLedgerRowId: number | null
) => {
  const ledgerId = buildVehicleCheckoutFulfillmentLedgerId(sessionId);
  const processedAt = new Date().toISOString();

  if (existingLedgerRowId) {
    await updateRowByIdInTransaction(
      client,
      'stripe_webhook_events',
      existingLedgerRowId,
      {
        event_type: VEHICLE_CHECKOUT_FULFILLMENT_EVENT_TYPE,
        processed_at: processedAt,
        updated_at: processedAt,
      },
      'Failed to update vehicle checkout fulfillment marker'
    );
    return;
  }

  const result = await client.query(
    'INSERT INTO "stripe_webhook_events" ("stripe_event_id", "event_type", "processed_at") VALUES ($1, $2, $3)',
    [ledgerId, VEHICLE_CHECKOUT_FULFILLMENT_EVENT_TYPE, processedAt]
  );

  if (result.rowCount !== 1) {
    throw new Error('Failed to persist vehicle checkout fulfillment marker.');
  }
};

const hasVehicleCheckoutFulfillmentMarker = async (sessionId: string) => {
  const { data, error } = await db
    .from('stripe_webhook_events')
    .select('id, event_type')
    .eq('stripe_event_id', buildVehicleCheckoutFulfillmentLedgerId(sessionId))
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to read vehicle checkout fulfillment marker ${sessionId}: ${error.message || 'Unknown error'}`
    );
  }

  return data?.event_type === VEHICLE_CHECKOUT_FULFILLMENT_EVENT_TYPE;
};

const applyVehicleCheckoutActivationWrites = async ({
  applicationId,
  carId,
  existingRentalId,
  expectedPaymentLinkVersion,
  fulfillmentSessionId,
  paidAt,
  rentalInsertPayload,
  rentalRepairPayload,
}: {
  applicationId: string;
  carId: number;
  existingRentalId: number | null;
  expectedPaymentLinkVersion: number;
  fulfillmentSessionId: string;
  paidAt: string;
  rentalInsertPayload: Record<string, unknown>;
  rentalRepairPayload: Record<string, unknown>;
}) => {
  const applicationPaymentPayload = await toApplicationPaymentWritePayload({
    paid_at: paidAt,
    pending_checkout_session_id: null,
    status: 'Paid',
  });

  if (!hasDirectDatabaseConnection()) {
    throw new Error(
      'Automatic payment activation requires a session-capable Postgres connection.'
    );
  }

  return withPostgresTransaction(async (client) => {
    const fulfillmentLedgerResult =
      await readVehicleCheckoutFulfillmentMarkerInTransaction(
        client,
        fulfillmentSessionId
      );
    const existingFulfillmentLedgerRow =
      (fulfillmentLedgerResult.rows[0] as
        | { event_type?: string | null; id?: number | null }
        | undefined) || undefined;

    if (
      existingFulfillmentLedgerRow?.event_type ===
      VEHICLE_CHECKOUT_FULFILLMENT_EVENT_TYPE
    ) {
      return 'already_fulfilled' as const;
    }

    const applicationRes = await client.query(
      await buildLockedApplicationSelectSql(),
      [applicationId]
    );

    const lockedApplicationRow = applicationRes.rows[0] as
      | {
          assigned_car_id?: number | string | null;
          payment_link_version?: number | string | null;
          status?: string | null;
        }
      | undefined;

    if (!lockedApplicationRow) {
      throw new Error(`Application ${applicationId} disappeared while activating payment.`);
    }

    const lockedPaymentLinkVersion = Number(lockedApplicationRow.payment_link_version || 0);
    if (lockedPaymentLinkVersion !== expectedPaymentLinkVersion) {
      throw new Error(
        `Application ${applicationId} payment link version changed from ${expectedPaymentLinkVersion} to ${lockedPaymentLinkVersion}.`
      );
    }

const lockedApplicationStatus = String(lockedApplicationRow.status || '');
    if (
      lockedApplicationStatus !== 'Approved' &&
      lockedApplicationStatus !== 'Paid' &&
      lockedApplicationStatus !== 'Payment Review' &&
      lockedApplicationStatus !== 'Cancelled'
    ) {
      throw new Error(
        `Application ${applicationId} cannot be activated from status ${lockedApplicationStatus || 'Unknown'}.`
      );
    }

    // Lock the car row and re-validate availability inside the transaction
    const carRes = await client.query(
      'SELECT status FROM cars WHERE id = $1 FOR UPDATE',
      [carId]
    );
    const currentCarStatus = carRes.rows[0]?.status;

    if (!existingRentalId && currentCarStatus !== 'Available' && currentCarStatus !== 'Rented') {
      throw new Error(`Vehicle is no longer available for activation (currently ${currentCarStatus})`);
    }

    if (existingRentalId) {
      await updateRowByIdInTransaction(
        client,
        'rentals',
        existingRentalId,
        rentalRepairPayload,
        'Failed to repair existing rental after checkout completion'
      );
    } else {
      await insertRowInTransaction(client, 'rentals', rentalInsertPayload);
    }

    await updateRowByIdInTransaction(
      client,
      'cars',
      carId,
      { status: 'Rented' },
      'Failed to mark car as rented'
    );

    await updateRowByIdInTransaction(
      client,
      'applications',
      applicationId,
      applicationPaymentPayload,
      'Failed to update application payment state'
    );

    await persistVehicleCheckoutFulfillmentMarkerInTransaction(
      client,
      fulfillmentSessionId,
      Number(existingFulfillmentLedgerRow?.id || 0) || null
    );

    return 'fulfilled' as const;
  });
};

const applyVehicleCheckoutPaymentOnlyWrites = async ({
  applicationId,
  expectedPaymentLinkVersion,
  fulfillmentSessionId,
  paidAt,
}: {
  applicationId: string;
  expectedPaymentLinkVersion: number;
  fulfillmentSessionId: string;
  paidAt: string;
}) => {
  const applicationPaymentPayload = await toApplicationPaymentWritePayload({
    paid_at: paidAt,
    pending_checkout_session_id: null,
    status: 'Paid',
  });

  if (!hasDirectDatabaseConnection()) {
    const result = await db.from('applications').update(applicationPaymentPayload).eq('id', applicationId);
    assertSupabaseWrite(result, 'Failed to update application payment state');
    return 'fulfilled' as const;
  }

  return withPostgresTransaction(async (client) => {
    const fulfillmentLedgerResult =
      await readVehicleCheckoutFulfillmentMarkerInTransaction(
        client,
        fulfillmentSessionId
      );
    const existingFulfillmentLedgerRow =
      (fulfillmentLedgerResult.rows[0] as
        | { event_type?: string | null; id?: number | null }
        | undefined) || undefined;

    if (
      existingFulfillmentLedgerRow?.event_type ===
      VEHICLE_CHECKOUT_FULFILLMENT_EVENT_TYPE
    ) {
      return 'already_fulfilled' as const;
    }

    const applicationRes = await client.query(
      await buildLockedApplicationSelectSql(),
      [applicationId]
    );
    const lockedApplicationRow = applicationRes.rows[0] as
      | {
          payment_link_version?: number | string | null;
          status?: string | null;
        }
      | undefined;

    if (!lockedApplicationRow) {
      throw new Error(`Application ${applicationId} disappeared while recording payment.`);
    }

    const lockedPaymentLinkVersion = Number(lockedApplicationRow.payment_link_version || 0);
    if (lockedPaymentLinkVersion !== expectedPaymentLinkVersion) {
      throw new Error(
        `Application ${applicationId} payment link version changed from ${expectedPaymentLinkVersion} to ${lockedPaymentLinkVersion}.`
      );
    }

const lockedApplicationStatus = String(lockedApplicationRow.status || '');
    if (
      lockedApplicationStatus !== 'Approved' &&
      lockedApplicationStatus !== 'Paid' &&
      lockedApplicationStatus !== 'Payment Review' &&
      lockedApplicationStatus !== 'Cancelled'
    ) {
      throw new Error(
        `Application ${applicationId} cannot be marked paid from status ${lockedApplicationStatus || 'Unknown'}.`
      );
    }

    await updateRowByIdInTransaction(
      client,
      'applications',
      applicationId,
      applicationPaymentPayload,
      'Failed to update application payment state'
    );

    await persistVehicleCheckoutFulfillmentMarkerInTransaction(
      client,
      fulfillmentSessionId,
      Number(existingFulfillmentLedgerRow?.id || 0) || null
    );

    return 'fulfilled' as const;
  });
};

const fetchExistingRentalsForCar = async (carId: number) => {
  const compat = await getSchemaCompat();
  const rentalCarIdColumn = await getRentalCarIdColumn();
  const rentalApplicationIdColumn = await getRentalApplicationIdColumn();
  const existingRentalColumns = [
    'id',
    'status',
    'weekly_price',
    'bond_paid',
    rentalCarIdColumn,
    rentalApplicationIdColumn,
    compat.rentalStripeSubscriptionColumn,
    compat.rentalStripeCustomerColumn,
  ]
    .filter((column): column is string => Boolean(column))
    .join(', ');
  const existingRentalResult = await db
    .from('rentals')
    .select(existingRentalColumns)
    .eq(rentalCarIdColumn, carId);

  if (existingRentalResult.error) {
    throw new Error(
      `Failed to inspect existing rentals: ${existingRentalResult.error.message || 'Unknown error'}`
    );
  }

  return {
    compat,
    rentalApplicationIdColumn,
    rentals: ((existingRentalResult.data || []) as unknown) as Array<Record<string, unknown>>,
  };
};

export const maybeMarkCarAvailable = async (carId: number) => {
  const { rentals } = await fetchExistingRentalsForCar(carId);
  const hasLiveRental = rentals.some((rental) => isLiveRentalStatus(rental.status));

  if (hasLiveRental) {
    return;
  }

  const { data: car, error: carError } = await db
    .from('cars')
    .select('id, status')
    .eq('id', carId)
    .single();

  if (carError || !car) {
    throw new Error(`Failed to fetch car ${carId} before availability release.`);
  }

  if (car.status !== 'Rented') {
    return;
  }

  const result = await db.from('cars').update({ status: 'Available' }).eq('id', carId);
  assertSupabaseWrite(result, 'Failed to mark car as available');
};

export const handleVehicleCheckoutCompletion = async (
  session: Stripe.Checkout.Session
): Promise<'already_fulfilled' | 'fulfilled' | 'manual_review' | 'skipped'> => {
  const applicationId = normalizeUuid(session.metadata?.application_id || '');
  const legacyCarId = Number(session.metadata?.car_id || 0) || null;
  const sessionPaymentLinkVersion = Number(session.metadata?.payment_link_version || 0);
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || null;
  if (!applicationId || !subscriptionId) {
    return 'skipped' as const;
  }

  return withVehicleCheckoutProcessingLock(applicationId, async () => {
    if (await hasVehicleCheckoutFulfillmentMarker(session.id)) {
      console.info(
        `Ignoring replayed checkout completion ${session.id} because fulfillment is already recorded.`
      );
      return 'already_fulfilled' as const;
    }

    const selectColumns = await getApplicationSelectColumns();
    const applicationResult = await db
      .from('applications')
      .select(selectColumns)
      .eq('id', applicationId)
      .single();

    if (applicationResult.error || !applicationResult.data) {
      throw new Error(`Failed to fetch application ${applicationId} for payment completion.`);
    }

    const application = applicationResult.data as unknown as Record<string, unknown>;
    const safeApplicantName = escapeHtml(String(application.name || ''));
    const safeApprovedVehicle = escapeHtml(
      String(
        application.approved_vehicle ??
          application.approvedVehicle ??
          session.metadata?.approved_vehicle ??
          'Approved vehicle'
      )
    );
    const recordedPaidAt = application.paid_at
      ? String(application.paid_at)
      : new Date().toISOString();
    const applicationStatus = String(application.status || '');

    if (applicationStatus === 'Cancelled') {
      return 'skipped' as const;
    }

    const moveApplicationToPaymentReview = async (reason: string) => {
      console.warn('Vehicle checkout activation requires review', {
        applicationId,
        checkoutSessionId: session.id,
        reason,
        stripeSubscriptionId: subscriptionId,
      });

      const transitionedApplication = await updateApplicationPaymentState({
        applicationId,
        expectedPaymentLinkVersion: sessionPaymentLinkVersion,
        paidAt: recordedPaidAt,
        pendingCheckoutSessionId: session.id,
        status: 'Payment Review',
      });

      if (
        transitionedApplication === null &&
        applicationStatus !== 'Payment Review'
      ) {
        console.warn(
          `Skipped Payment Review transition for application ${applicationId} because its payment state advanced before ${session.id} finished processing.`
        );
        return 'manual_review' as const;
      }

      if (!process.env.RESEND_API_KEY) {
        return 'manual_review' as const;
      }

      try {
        const resend = await getResend();
        const adminEmail = process.env.ADMIN_EMAIL || FALLBACK_ADMIN_EMAIL;

        await sendResendEmail(resend, {
          from: 'Gala Rentals <noreply@galarentals.com.au>',
          to: adminEmail,
          subject: `Activation review required for vehicle checkout ${session.id}`,
          html: `
            <div style="font-family: sans-serif; max-width: 640px; margin: 0 auto; color: #1a202c;">
              <h2 style="color: #D4AF37;">Payment Received, Activation Pending</h2>
              <p><strong>Application ID:</strong> ${applicationId}</p>
              <p><strong>Applicant:</strong> ${safeApplicantName}</p>
              <p><strong>Approved vehicle:</strong> ${safeApprovedVehicle}</p>
              <p><strong>Checkout session:</strong> ${escapeHtml(session.id)}</p>
              <p><strong>Stripe subscription:</strong> ${escapeHtml(subscriptionId)}</p>
              <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
            </div>
          `,
        });
      } catch (emailError) {
        console.error('Failed to send activation review alert email:', emailError);
      }

      return 'manual_review' as const;
    };

    const pendingCheckoutSessionId = application.pending_checkout_session_id
      ? String(application.pending_checkout_session_id)
      : null;
    const sessionStillMatchesCurrentApproval =
      sessionPaymentLinkVersion === Number(application.payment_link_version || 0);

    if (!sessionStillMatchesCurrentApproval) {
      return moveApplicationToPaymentReview(
        'Paid Stripe session no longer matches the latest approved payment link version.'
      );
    }

    if (
      applicationStatus !== 'Approved' &&
      applicationStatus !== 'Paid' &&
      applicationStatus !== 'Payment Review'
    ) {
      return moveApplicationToPaymentReview(
        `Paid Stripe session arrived while application ${applicationStatus || 'Unknown'} is not eligible for automatic activation.`
      );
    }

    // "Payment Review" means Stripe has already confirmed payment, but activation
    // hit a transient blocker. If the same signed checkout session replays later,
    // allow it to complete automatically instead of forcing a brand-new payment.
    if (
      applicationStatus === 'Payment Review' &&
      pendingCheckoutSessionId &&
      pendingCheckoutSessionId !== session.id
    ) {
      return moveApplicationToPaymentReview(
        `Stored payment review session ${pendingCheckoutSessionId} does not match checkout session ${session.id}.`
      );
    }

    if (!legacyCarId) {
      try {
        return await applyVehicleCheckoutPaymentOnlyWrites({
          applicationId,
          expectedPaymentLinkVersion: sessionPaymentLinkVersion,
          fulfillmentSessionId: session.id,
          paidAt: recordedPaidAt,
        });
      } catch (error) {
        return moveApplicationToPaymentReview(
          error instanceof Error
            ? error.message
            : 'Payment was received but could not be recorded automatically.'
        );
      }
    }

    if (legacyCarId) {
      const { rentalApplicationIdColumn, rentals } =
        await fetchExistingRentalsForCar(legacyCarId);
      const existingRentalForApplication =
        rentals.find(
          (rental) =>
            normalizeUuid(String(rental[rentalApplicationIdColumn] || '')) ===
            applicationId
        ) || null;
      const blockingRental =
        rentals.find((rental) => {
          const rentalApplicationId = normalizeUuid(
            String(rental[rentalApplicationIdColumn] || '')
          );
          return (
            rentalApplicationId !== applicationId &&
            isLiveRentalStatus(rental.status)
          );
        }) || null;

      if (blockingRental) {
        return moveApplicationToPaymentReview(
          `Vehicle ${legacyCarId} is no longer available for automatic activation.`
        );
      }

      const approvedBond = Number(
        session.metadata?.approved_bond ?? application.approved_bond ?? 0
      );
      const approvedWeeklyPrice = Number(
        session.metadata?.approved_weekly_price ??
          application.approved_weekly_price ??
          0
      );
      const rentalPayload = await toRentalWritePayload({
        application_id: applicationId,
        bond_paid: approvedBond,
        car_id: legacyCarId,
        start_date: getApplicationRentalStartDate(application),
        status: 'Active',
        stripe_customer_id:
          typeof session.customer === 'string' ? session.customer : null,
        stripe_subscription_id: subscriptionId,
        weekly_price: approvedWeeklyPrice,
      });

      try {
        return await applyVehicleCheckoutActivationWrites({
          applicationId,
          carId: legacyCarId,
          existingRentalId:
            Number(existingRentalForApplication?.id || 0) || null,
          expectedPaymentLinkVersion: sessionPaymentLinkVersion,
          fulfillmentSessionId: session.id,
          paidAt: recordedPaidAt,
          rentalInsertPayload: rentalPayload,
          rentalRepairPayload: stripRentalIdentityFields(rentalPayload),
        });
      } catch (error) {
        if (isDuplicateWrite(error)) {
          return 'already_fulfilled' as const;
        }

        return moveApplicationToPaymentReview(
          error instanceof Error
            ? error.message
            : 'Automatic vehicle activation failed and requires manual review.'
        );
      }
    }
  });
};
