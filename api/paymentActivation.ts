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
  getSchemaCompat,
  toApplicationPaymentWritePayload,
} from './schemaCompat.js';
import { escapeHtml, getResend, sendResendEmail } from './email.js';
import { hasTransactionalPaymentProcessing } from './paymentProcessing.js';
import { normalizeUuid } from '../shared/uuid.js';
import { persistCheckoutRelationshipFromSession } from './paymentLifecycle.js';

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

export const isPaymentRecordingStatus = (status: unknown) =>
  ['Approved', 'Paid', 'Payment Review'].includes(String(status || ''));

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
    throw new Error(
      `No rental found for Stripe subscription ${subscriptionId}. ` +
        `Refusing fallback update for application=${String(safeApplicationId)}.`
    );
  }

  const result = await db.from('rentals').update(payload).eq('id', rentalBySubscription.id);
  assertSupabaseWrite(result, 'Failed to update rental by subscription id');
};

const quoteIdentifier = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;

export const buildLockedApplicationSelectSql = async () => {
  const { applicationPaymentLinkVersionColumn } = await getSchemaCompat();

  return (
    `SELECT status, ` +
    `${quoteIdentifier(applicationPaymentLinkVersionColumn)} AS payment_link_version ` +
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
    if (!isPaymentRecordingStatus(lockedApplicationStatus)) {
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

export const handleVehicleCheckoutCompletion = async (
  session: Stripe.Checkout.Session
): Promise<'already_fulfilled' | 'fulfilled' | 'manual_review' | 'skipped'> => {
  const applicationId = normalizeUuid(session.metadata?.application_id || '');
  const sessionPaymentLinkVersion = Number(session.metadata?.payment_link_version || 0);
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || null;
  if (!applicationId || !subscriptionId) {
    return 'skipped' as const;
  }

  return withVehicleCheckoutProcessingLock(applicationId, async () => {
    if (await hasVehicleCheckoutFulfillmentMarker(session.id)) {
      console.info('Ignoring replayed checkout completion because fulfillment is already recorded.');
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
      console.warn('Vehicle checkout activation requires review.');

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
          'Skipped Payment Review transition because the payment state advanced during processing.'
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
          from: 'Maple Rentals <noreply@maplerentals.com.au>',
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
        console.error('Failed to send activation review alert email', {
          errorName: emailError instanceof Error ? emailError.name : 'UnknownError',
        });
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
        `Paid Stripe session arrived while application ${applicationStatus || 'Unknown'} is not eligible for payment recording.`
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

    try {
      // This is deliberately separate from rental activation. The verified
      // Stripe identity must survive payment-only fulfillment for admin
      // operations and later, explicit rental activation.
      await persistCheckoutRelationshipFromSession(session);
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
  });
};
