import type Stripe from 'stripe';

import { db } from '../db/index.js';
import { getStripeClient } from '../stripeClient.js';
import { clearPendingCheckoutSessionIdIfCurrent } from '../applicationPaymentState.js';
import {
  getRentalStatusUpdatePayload,
  handleVehicleCheckoutCompletion,
} from '../paymentActivation.js';
import { getTodayInAustralia } from '../../shared/applicationSubmission.js';
import { persistVerifiedStripeRelationship, syncStripeInvoice } from '../paymentLifecycle.js';

const getStripe = () => getStripeClient();

const STRIPE_WEBHOOK_DUPLICATE_ERROR_CODE = '23505';
const STALE_WEBHOOK_PROCESSING_WINDOW_MS = 5 * 60 * 1000;
const LEGACY_WEBHOOK_PROCESSING_PREFIX = 'processing:';

const todayIsoDate = () => getTodayInAustralia();

type WebhookLedgerMode = 'modern' | 'legacy';
type WebhookLedgerStatus = 'received' | 'processing' | 'processed' | 'failed';
type WebhookRetryClassification = 'transient' | 'permanent' | 'business_blocked';

type WebhookEventClaim =
  | { eventId: string; ledgerMode: WebhookLedgerMode; mode: 'owned' }
  | { eventId: string; ledgerMode: WebhookLedgerMode; mode: 'already_processed' }
  | { eventId: string; ledgerMode: WebhookLedgerMode; mode: 'in_flight' };

export type StripeWebhookWorkItem = {
  applicationId: string | null;
  checkoutKind: string | null;
  checkoutSessionId: string | null;
  eventId: string;
  eventType: string;
  paymentLinkVersion: number | null;
  paymentStatus: string | null;
  processingSource: 'webhook-route' | 'queue-worker';
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

type ModernWebhookLedgerRow = {
  id: number;
  application_id?: string | null;
  checkout_kind?: string | null;
  checkout_session_id?: string | null;
  error_message?: string | null;
  fulfillment_state?: string | null;
  received_at?: string | null;
  retry_count?: number | null;
  retry_reason?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  status?: WebhookLedgerStatus | null;
  updated_at?: string | null;
};

type LegacyWebhookLedgerRow = {
  event_type?: string | null;
  id: number;
  processed_at?: string | null;
};

let preferredWebhookLedgerMode: WebhookLedgerMode | null = null;

export const buildStripeWebhookWorkItem = (
  event: Stripe.Event,
  processingSource: StripeWebhookWorkItem['processingSource'] = 'webhook-route'
): StripeWebhookWorkItem => {
  const payload = event.data.object as
    | (Stripe.Checkout.Session & { metadata?: Record<string, string | undefined> })
    | (Stripe.Invoice & { metadata?: Record<string, string | undefined> })
    | (Stripe.Subscription & { metadata?: Record<string, string | undefined> })
    | Record<string, unknown>;
  const metadata = (payload as { metadata?: Record<string, string | undefined> }).metadata || {};

  const checkoutSessionId =
    event.type.startsWith('checkout.session.') &&
    typeof (payload as { id?: string }).id === 'string'
      ? (payload as { id: string }).id
      : null;
  const applicationId =
    typeof metadata.application_id === 'string' && metadata.application_id.trim()
      ? metadata.application_id.trim()
      : null;
  const paymentLinkVersionValue = Number(metadata.payment_link_version || 0);
  const paymentLinkVersion =
    Number.isFinite(paymentLinkVersionValue) && paymentLinkVersionValue > 0
      ? paymentLinkVersionValue
      : null;
  const checkoutSessionSubscription = (payload as {
    subscription?: string | Stripe.Subscription | null;
  }).subscription;
  const invoiceSubscription = (payload as {
    subscription?: string | Stripe.Subscription | null;
  }).subscription;
  const stripeSubscriptionId =
    event.type.startsWith('customer.subscription.') &&
    typeof (payload as { id?: string }).id === 'string'
      ? String((payload as { id: string }).id)
      : typeof checkoutSessionSubscription === 'string'
        ? checkoutSessionSubscription
        : checkoutSessionSubscription?.id ||
          (typeof invoiceSubscription === 'string'
            ? invoiceSubscription
            : invoiceSubscription?.id || null);
  const customerReference = (payload as {
    customer?: string | { id?: string } | null;
  }).customer;
  const stripeCustomerId =
    typeof customerReference === 'string'
      ? customerReference
      : customerReference?.id || null;

  return {
    applicationId,
    checkoutKind:
      typeof metadata.checkout_kind === 'string' && metadata.checkout_kind.trim()
        ? metadata.checkout_kind.trim()
        : null,
    checkoutSessionId,
    eventId: getWebhookEventId(event),
    eventType: event.type,
    paymentLinkVersion,
    paymentStatus:
      event.type.startsWith('checkout.session.') &&
      typeof (payload as { payment_status?: string }).payment_status === 'string'
        ? String((payload as { payment_status?: string }).payment_status)
        : null,
    processingSource,
    stripeCustomerId,
    stripeSubscriptionId,
  };
};

const logStripeWebhookEvent = (
  level: 'info' | 'warn' | 'error',
  message: string,
  workItem: StripeWebhookWorkItem,
  extra?: Record<string, unknown>
) => {
  const {
    applicationId: _applicationId,
    checkoutSessionId: _checkoutSessionId,
    eventId: _eventId,
    stripeCustomerId: _stripeCustomerId,
    stripeSubscriptionId: _stripeSubscriptionId,
    ...safeWorkItem
  } = workItem;
  const safeExtra = extra
    ? Object.fromEntries(
        Object.entries(extra).filter(([key]) => key !== 'errorMessage')
      )
    : undefined;
  const payload = {
    ...safeWorkItem,
    ...safeExtra,
    level,
    message,
  };

  console[level](JSON.stringify(payload));
};

const setPreferredWebhookLedgerMode = (mode: WebhookLedgerMode) => {
  preferredWebhookLedgerMode = mode;
  return mode;
};

const toLegacyProcessingEventType = (eventType: string) =>
  `${LEGACY_WEBHOOK_PROCESSING_PREFIX}${eventType}`;

const isLegacyProcessingEventType = (eventType: string | null | undefined) =>
  typeof eventType === 'string' && eventType.startsWith(LEGACY_WEBHOOK_PROCESSING_PREFIX);

const isMissingLegacyLedgerColumnsError = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = String((error as { code?: string }).code || '').toUpperCase();
  const combinedMessage = [
    String((error as { message?: string }).message || ''),
    String((error as { details?: string }).details || ''),
    String((error as { hint?: string }).hint || ''),
  ]
    .join(' ')
    .toLowerCase();

  if (
    code !== 'PGRST204' &&
    code !== '42703' &&
    !combinedMessage.includes('column') &&
    !combinedMessage.includes('schema cache')
  ) {
    return false;
  }

  return (
    combinedMessage.includes('stripe_webhook_events') &&
    ['status', 'received_at', 'error_message'].some((columnName) =>
      combinedMessage.includes(columnName)
    )
  );
};

const readModernLedgerRow = async (eventId: string) => {
  const { data, error } = await db
    .from('stripe_webhook_events')
    .select(
      'id, application_id, checkout_kind, checkout_session_id, error_message, fulfillment_state, received_at, retry_count, retry_reason, stripe_customer_id, stripe_subscription_id, status, updated_at'
    )
    .eq('stripe_event_id', eventId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read Stripe webhook ledger row ${eventId}: ${error.message || 'Unknown error'}`);
  return data as ModernWebhookLedgerRow | null;
};

const readLegacyLedgerRow = async (eventId: string) => {
  const { data, error } = await db
    .from('stripe_webhook_events')
    .select('id, event_type, processed_at')
    .eq('stripe_event_id', eventId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read legacy Stripe webhook ledger row ${eventId}: ${error.message || 'Unknown error'}`);
  return data as LegacyWebhookLedgerRow | null;
};

const canReclaimStaleProcessingEvent = (lastUpdatedAt?: string | null) => {
  if (!lastUpdatedAt) return false;
  const lastUpdatedAtMs = Date.parse(lastUpdatedAt);
  return Number.isFinite(lastUpdatedAtMs) && Date.now() - lastUpdatedAtMs >= STALE_WEBHOOK_PROCESSING_WINDOW_MS;
};

const claimModernLedgerForProcessing = async (
  workItem: StripeWebhookWorkItem
) => {
  const claimByStatus = async (status: 'received' | 'failed') => {
    const { data, error } = await db
      .from('stripe_webhook_events')
      .update({
        application_id: workItem.applicationId,
        checkout_kind: workItem.checkoutKind,
        checkout_session_id: workItem.checkoutSessionId,
        ...(workItem.stripeCustomerId ? { stripe_customer_id: workItem.stripeCustomerId } : {}),
        stripe_subscription_id: workItem.stripeSubscriptionId,
        status: 'processing',
        error_message: null,
        processed_at: null,
        processing_source: workItem.processingSource,
        retry_reason: null,
        fulfillment_state: 'processing',
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_event_id', workItem.eventId)
      .eq('status', status)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(`Failed to claim Stripe webhook ledger row ${workItem.eventId} for processing: ${error.message || 'Unknown error'}`);
    return Boolean(data?.id);
  };

  if (await claimByStatus('received')) return true;
  return claimByStatus('failed');
};

const reclaimStaleModernInFlightLedger = async (
  workItem: StripeWebhookWorkItem,
  existing: ModernWebhookLedgerRow | null | undefined
) => {
  const existingLastUpdatedAt = existing?.updated_at || existing?.received_at;
  if (!canReclaimStaleProcessingEvent(existingLastUpdatedAt)) return false;
  const concurrencyColumn = existing?.updated_at ? 'updated_at' : 'received_at';
  const { data, error } = await db
    .from('stripe_webhook_events')
    .update({
      application_id: workItem.applicationId,
      checkout_kind: workItem.checkoutKind,
      checkout_session_id: workItem.checkoutSessionId,
      ...(workItem.stripeCustomerId ? { stripe_customer_id: workItem.stripeCustomerId } : {}),
      stripe_subscription_id: workItem.stripeSubscriptionId,
      error_message: null,
      status: 'processing',
      processing_source: workItem.processingSource,
      retry_reason: null,
      fulfillment_state: 'processing',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_event_id', workItem.eventId)
    .eq('status', 'processing')
    .eq(concurrencyColumn, existingLastUpdatedAt || '')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Failed to reclaim stale Stripe webhook ledger row ${workItem.eventId}: ${error.message || 'Unknown error'}`);
  return Boolean(data?.id);
};

const markModernLedgerProcessed = async (
  eventId: string,
  fulfillmentState: string
) => {
  const { data, error } = await db
    .from('stripe_webhook_events')
    .update({
      error_message: null,
      fulfillment_state: fulfillmentState,
      processed_at: new Date().toISOString(),
      retry_reason: null,
      status: 'processed',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_event_id', eventId)
    .eq('status', 'processing')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Failed to mark Stripe webhook ledger row ${eventId} as processed: ${error.message || 'Unknown error'}`);
  if (!data?.id) {
    const existing = await readModernLedgerRow(eventId);
    if (existing?.status === 'processed') return;
    throw new Error(`Stripe webhook ledger row ${eventId} was not in a processing state when finalizing.`);
  }
};

const markModernLedgerFailed = async (eventId: string, errorMessage: string) => {
  const { data, error } = await db
    .from('stripe_webhook_events')
    .update({
      error_message: errorMessage,
      fulfillment_state: 'failed',
      retry_reason: errorMessage,
      status: 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_event_id', eventId)
    .eq('status', 'processing')
    .select('id')
    .maybeSingle();
  if (error || !data?.id) {
    console.error(JSON.stringify({
      category: error ? 'database_error' : 'row_not_updated',
      message: 'stripe_webhook_ledger_finalization_failed',
    }));
    throw new Error('Stripe webhook processing failed and its ledger failure state could not be persisted.', {
      cause: error || new Error('No processing ledger row was updated'),
    });
  }
};

const markModernLedgerProcessedWithClassification = async (
  eventId: string,
  classification: WebhookRetryClassification,
  errorMessage: string
) => {
  const { data, error } = await db
    .from('stripe_webhook_events')
    .update({
      error_message: `${classification}:${errorMessage}`,
      fulfillment_state: classification === 'business_blocked' ? 'manual_review' : 'skipped',
      retry_reason: errorMessage,
      status: 'processed',
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_event_id', eventId)
    .eq('status', 'processing')
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to finalize Stripe webhook ledger row ${eventId} as ${classification}: ${error.message || 'Unknown error'}`
    );
  }

  if (!data?.id) {
    const existing = await readModernLedgerRow(eventId);
    if (existing?.status === 'processed') {
      return;
    }

    throw new Error(
      `Stripe webhook ledger row ${eventId} was not in a processing state when recording a terminal ${classification} outcome.`
    );
  }
};

const reclaimStaleLegacyLedgerClaim = async ({ eventId, existingEventType, existingProcessedAt, processingEventType }: { eventId: string; existingEventType: string; existingProcessedAt: string | null | undefined; processingEventType: string; }) => {
  if (!existingProcessedAt || !canReclaimStaleProcessingEvent(existingProcessedAt)) return false;
  const { data, error } = await db
    .from('stripe_webhook_events')
    .update({ event_type: processingEventType, processed_at: new Date().toISOString() })
    .eq('stripe_event_id', eventId)
    .eq('event_type', existingEventType)
    .eq('processed_at', existingProcessedAt)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Failed to reclaim stale legacy Stripe webhook ledger row ${eventId}: ${error.message || 'Unknown error'}`);
  return Boolean(data?.id);
};

const markLegacyLedgerProcessed = async (eventId: string, eventType: string) => {
  const processingEventType = toLegacyProcessingEventType(eventType);
  const { data, error } = await db
    .from('stripe_webhook_events')
    .update({ event_type: eventType, processed_at: new Date().toISOString() })
    .eq('stripe_event_id', eventId)
    .eq('event_type', processingEventType)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Failed to mark legacy Stripe webhook ledger row ${eventId} as processed: ${error.message || 'Unknown error'}`);
  if (!data?.id) {
    const existing = await readLegacyLedgerRow(eventId);
    if (existing?.event_type === eventType) return;
    throw new Error(`Legacy Stripe webhook ledger row ${eventId} was not in a processing state when finalizing.`);
  }
};

const markLegacyLedgerFailed = async (eventId: string, eventType: string) => {
  const processingEventType = toLegacyProcessingEventType(eventType);
  await db.from('stripe_webhook_events').delete().eq('stripe_event_id', eventId).eq('event_type', processingEventType);
};

export const classifyWebhookProcessingError = (
  error: unknown
): WebhookRetryClassification => {
  const status = Number(
    (error as { status?: number; statusCode?: number } | null | undefined)?.status ??
      (error as { statusCode?: number } | null | undefined)?.statusCode ??
      0
  );
  const type = String((error as { type?: string } | null | undefined)?.type || '');
  const message = String(
    (error as { message?: string } | null | undefined)?.message || ''
  ).toLowerCase();

  if (
    status >= 500 ||
    type === 'StripeAPIError' ||
    type === 'StripeConnectionError' ||
    type === 'StripeRateLimitError' ||
    message.includes('timed out') ||
    message.includes('temporary') ||
    message.includes('connection')
  ) {
    return 'transient';
  }

  if (
    status === 409 ||
    message.includes('manual review') ||
    message.includes('activation is pending') ||
    message.includes('no longer available') ||
    message.includes('payment link version changed') ||
    message.includes('already attached to another live rental') ||
    message.includes('cannot be activated from status')
  ) {
    return 'business_blocked';
  }

  if (
    (status >= 400 && status < 500) ||
    type === 'StripeInvalidRequestError' ||
    type === 'StripeSignatureVerificationError' ||
    message.includes('missing a stable id') ||
    message.includes('not found')
  ) {
    return 'permanent';
  }

  return 'transient';
};

const getWebhookEventId = (event: Stripe.Event) => {
  const eventId = typeof event.id === 'string' ? event.id.trim() : '';
  if (!eventId) throw new Error(`Stripe webhook event ${event.type} is missing a stable id.`);
  return eventId;
};

const claimModernWebhookEvent = async (
  workItem: StripeWebhookWorkItem
): Promise<WebhookEventClaim> => {
  const { error } = await db.from('stripe_webhook_events').insert([
    {
      application_id: workItem.applicationId,
      checkout_kind: workItem.checkoutKind,
      checkout_session_id: workItem.checkoutSessionId,
      stripe_customer_id: workItem.stripeCustomerId,
      stripe_subscription_id: workItem.stripeSubscriptionId,
      event_type: workItem.eventType,
      fulfillment_state: 'processing',
      payment_link_version: workItem.paymentLinkVersion,
      processing_source: workItem.processingSource,
      retry_count: 0,
      retry_reason: null,
      stripe_event_id: workItem.eventId,
      status: 'processing',
      updated_at: new Date().toISOString(),
    },
  ]);
  if (!error) {
    return {
      eventId: workItem.eventId,
      ledgerMode: setPreferredWebhookLedgerMode('modern'),
      mode: 'owned',
    };
  }
  const errorCode = String((error as { code?: string }).code || '');
  if (errorCode === STRIPE_WEBHOOK_DUPLICATE_ERROR_CODE) {
    const existing = await readModernLedgerRow(workItem.eventId);
    const existingStatus = existing?.status || null;
    if (existingStatus === 'processed') {
      return {
        eventId: workItem.eventId,
        ledgerMode: setPreferredWebhookLedgerMode('modern'),
        mode: 'already_processed',
      };
    }
    if (existingStatus === 'processing') {
      if (await reclaimStaleModernInFlightLedger(workItem, existing)) {
        return {
          eventId: workItem.eventId,
          ledgerMode: setPreferredWebhookLedgerMode('modern'),
          mode: 'owned',
        };
      }
      return {
        eventId: workItem.eventId,
        ledgerMode: setPreferredWebhookLedgerMode('modern'),
        mode: 'in_flight',
      };
    }
    const claimed = await claimModernLedgerForProcessing(workItem);
    if (claimed) {
      return {
        eventId: workItem.eventId,
        ledgerMode: setPreferredWebhookLedgerMode('modern'),
        mode: 'owned',
      };
    }
    const refreshed = await readModernLedgerRow(workItem.eventId);
    if (refreshed?.status === 'processed') {
      return {
        eventId: workItem.eventId,
        ledgerMode: setPreferredWebhookLedgerMode('modern'),
        mode: 'already_processed',
      };
    }
    if (refreshed?.status === 'processing') {
      return {
        eventId: workItem.eventId,
        ledgerMode: setPreferredWebhookLedgerMode('modern'),
        mode: 'in_flight',
      };
    }
    throw new Error(
      `Unable to claim Stripe webhook event ${workItem.eventId}; current ledger status is ${String(refreshed?.status || 'unknown')}.`
    );
  }
  throw new Error(`Failed to persist Stripe webhook event ${workItem.eventId}: ${error.message || 'Unknown error'}`);
};

const claimLegacyWebhookEvent = async (eventId: string, eventType: string): Promise<WebhookEventClaim> => {
  const processingEventType = toLegacyProcessingEventType(eventType);
  const { error } = await db.from('stripe_webhook_events').insert([{ stripe_event_id: eventId, event_type: processingEventType, processed_at: new Date().toISOString() }]);
  if (!error) return { eventId, ledgerMode: setPreferredWebhookLedgerMode('legacy'), mode: 'owned' };
  const errorCode = String((error as { code?: string }).code || '');
  if (errorCode === STRIPE_WEBHOOK_DUPLICATE_ERROR_CODE) {
    const existing = await readLegacyLedgerRow(eventId);
    const existingEventType = String(existing?.event_type || '');
    if (!isLegacyProcessingEventType(existingEventType)) return { eventId, ledgerMode: setPreferredWebhookLedgerMode('legacy'), mode: 'already_processed' };
    if (await reclaimStaleLegacyLedgerClaim({ eventId, existingEventType, existingProcessedAt: existing?.processed_at, processingEventType })) {
      return { eventId, ledgerMode: setPreferredWebhookLedgerMode('legacy'), mode: 'owned' };
    }
    return { eventId, ledgerMode: setPreferredWebhookLedgerMode('legacy'), mode: 'in_flight' };
  }
  throw new Error(`Failed to persist legacy Stripe webhook event ${eventId}: ${error.message || 'Unknown error'}`);
};

const claimWebhookEvent = async (workItem: StripeWebhookWorkItem): Promise<WebhookEventClaim> => {
  const { eventId, eventType } = workItem;
  if (preferredWebhookLedgerMode === 'legacy') return claimLegacyWebhookEvent(eventId, eventType);
  try {
    return await claimModernWebhookEvent(workItem);
  } catch (error) {
    if (isMissingLegacyLedgerColumnsError(error)) {
      return claimLegacyWebhookEvent(eventId, eventType);
    }
    throw error;
  }
};

const markLedgerProcessed = async (
  claim: WebhookEventClaim,
  eventType: string,
  fulfillmentState: string
) => {
  if (claim.ledgerMode === 'legacy') return markLegacyLedgerProcessed(claim.eventId, eventType);
  return markModernLedgerProcessed(claim.eventId, fulfillmentState);
};

const markLedgerFailed = async (
  claim: WebhookEventClaim,
  eventType: string,
  errorMessage: string
) => {
  if (claim.ledgerMode === 'legacy') return markLegacyLedgerFailed(claim.eventId, eventType);
  return markModernLedgerFailed(claim.eventId, errorMessage);
};

const markLedgerProcessedWithClassification = async (
  claim: WebhookEventClaim,
  eventType: string,
  classification: WebhookRetryClassification,
  errorMessage: string
) => {
  if (claim.ledgerMode === 'legacy') {
    return markLegacyLedgerProcessed(claim.eventId, eventType);
  }

  return markModernLedgerProcessedWithClassification(
    claim.eventId,
    classification,
    errorMessage
  );
};

const clearPendingCheckoutSessionForTerminatedSession = async (
  session: Stripe.Checkout.Session,
  reason: 'expired' | 'async_payment_failed'
) => {
  const applicationId = typeof session.metadata?.application_id === 'string' ? session.metadata.application_id : null;
  const expectedPaymentLinkVersion = Number(session.metadata?.payment_link_version);
  const sessionId = typeof session.id === 'string' ? session.id : null;
  if (!applicationId || !sessionId || !Number.isFinite(expectedPaymentLinkVersion) || expectedPaymentLinkVersion <= 0) return;
  const cleared = await clearPendingCheckoutSessionIdIfCurrent({
    applicationId,
    expectedPaymentLinkVersion,
    expectedSessionId: sessionId,
  });
  if (!cleared) {
    console.log(`Stripe webhook ignored ${reason} because the payment link advanced.`);
    return;
  }
  console.log(`Stripe webhook cleared the pending checkout session after ${reason}.`);
};

const shouldCompleteRentalAfterRequestedCancellation = (
  subscription: Stripe.Subscription
) => subscription.cancellation_details?.reason === 'cancellation_requested';

const updateRentalBySubscriptionIdentityOrSkip = async (
  subscriptionId: string,
  payload: Record<string, unknown>,
  event: Stripe.Event,
  terminal = false
) => {
  if (!Number.isSafeInteger(event.created) || event.created <= 0) {
    throw new Error(`Stripe event ${event.id} is missing a valid created timestamp.`);
  }

  const status = typeof payload.status === 'string' ? payload.status : '';
  const endDateValue = payload.end_date ?? payload.endDate;
  const endDate = typeof endDateValue === 'string' ? endDateValue : null;
  const { data, error } = await db.rpc('apply_stripe_rental_status_event', {
    p_end_date: endDate,
    p_event_created_at: new Date(event.created * 1000).toISOString(),
    p_event_id: event.id,
    p_status: status,
    p_subscription_id: subscriptionId,
    p_terminal: terminal,
  });

  if (error) {
    throw new Error(
      `Failed to apply ordered rental status for Stripe subscription ${subscriptionId}: ${error.message || 'Unknown error'}`
    );
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.matched) {
    console.warn(
      'Ignoring subscription lifecycle webhook because no strict Stripe rental identity could be resolved.'
    );
    return;
  }

  if (!result.applied) {
    console.info('Ignored stale Stripe rental status event.');
  }
};

const getFulfillmentStateFromOutcome = (
  outcome: string | null | undefined,
  eventType: string
) => {
  if (outcome === 'already_fulfilled') return 'already_fulfilled';
  if (outcome === 'fulfilled') return 'fulfilled';
  if (outcome === 'manual_review') return 'manual_review';
  if (
    eventType === 'checkout.session.async_payment_failed' ||
    eventType === 'checkout.session.expired'
  ) {
    return 'skipped';
  }
  return 'not_applicable';
};

export const processStripeWebhookWorkItem = async (
  workItem: StripeWebhookWorkItem,
  event: Stripe.Event
) => {
  const webhookClaim = await claimWebhookEvent(workItem);
  logStripeWebhookEvent('info', 'webhook.claimed', workItem, {
    claimMode: webhookClaim.mode,
    ledgerMode: webhookClaim.ledgerMode,
  });

  if (webhookClaim.mode === 'already_processed') {
    logStripeWebhookEvent('info', 'webhook.replay.skipped', workItem, {
      replaySkipped: true,
      reason: 'already_processed',
    });
    return { status: 200 as const, body: 'received' };
  }

  if (webhookClaim.mode === 'in_flight') {
    logStripeWebhookEvent('warn', 'webhook.in_flight', workItem, {
      replaySkipped: true,
      retryable: true,
    });
    return { status: 409 as const, body: 'Webhook event is currently processing' };
  }

  try {
    let fulfillmentOutcome: string | null = null;
    switch (event.type) {
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status === 'paid' && session.metadata?.checkout_kind === 'vehicle') {
          fulfillmentOutcome = await handleVehicleCheckoutCompletion(session);
        }
        break;
      }
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.checkout_kind === 'vehicle') {
          await clearPendingCheckoutSessionForTerminatedSession(session, 'async_payment_failed');
        }
        break;
      }
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.checkout_kind === 'vehicle') {
          await clearPendingCheckoutSessionForTerminatedSession(session, 'expired');
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionReference = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription;
        const subscriptionId = typeof subscriptionReference === 'string' ? subscriptionReference : subscriptionReference?.id || null;
        if (subscriptionId) {
          const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
          const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || null;
          if (subscription.metadata?.application_id && customerId) {
            await persistVerifiedStripeRelationship({ applicationId: subscription.metadata.application_id, customerId, subscriptionId });
          }
          await syncStripeInvoice(invoice, customerId, subscriptionId);
          await updateRentalBySubscriptionIdentityOrSkip(
            subscriptionId,
            await getRentalStatusUpdatePayload('Overdue'),
            event
          );
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionReference = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription;
        const subscriptionId = typeof subscriptionReference === 'string' ? subscriptionReference : subscriptionReference?.id || null;
        if (subscriptionId) {
          const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
          const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || null;
          if (subscription.metadata?.application_id && customerId) {
            await persistVerifiedStripeRelationship({ applicationId: subscription.metadata.application_id, customerId, subscriptionId });
          }
          await syncStripeInvoice(invoice, customerId, subscriptionId);
          if (
            subscription.metadata.checkout_kind === 'vehicle' &&
            Number(invoice.amount_paid || 0) > 0
          ) {
            const { data: persistedCheckoutLedger, error: persistedCheckoutLedgerError } =
              await db
                .from('stripe_webhook_events')
                .select('checkout_session_id')
                .eq('stripe_subscription_id', subscriptionId)
                .eq('checkout_kind', 'vehicle')
                .not('checkout_session_id', 'is', null)
                .order('received_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (persistedCheckoutLedgerError) {
              throw new Error(
                `Failed to resolve persisted Checkout Session for Stripe subscription ${subscriptionId}: ${persistedCheckoutLedgerError.message || 'Unknown error'}`
              );
            }

            let session: Stripe.Checkout.Session | null = null;
            const persistedSessionId = persistedCheckoutLedger?.checkout_session_id;
            if (persistedSessionId) {
              session = await getStripe().checkout.sessions.retrieve(persistedSessionId);
            } else {
              const applicationId = subscription.metadata.application_id || null;
              const paymentLinkVersion = subscription.metadata.payment_link_version || null;
              if (applicationId && paymentLinkVersion) {
                const { data: application, error: applicationError } = await db
                  .from('applications')
                  .select('pending_checkout_session_id, payment_link_version')
                  .eq('id', applicationId)
                  .maybeSingle();

                if (applicationError) {
                  throw new Error(
                    `Failed to resolve application ${applicationId} for Stripe subscription ${subscriptionId}: ${applicationError.message || 'Unknown error'}`
                  );
                }

                const applicationRecord = application as
                  | { pending_checkout_session_id?: string | null; payment_link_version?: number | null }
                  | null;
                if (
                  applicationRecord?.pending_checkout_session_id &&
                  Number(applicationRecord.payment_link_version || 0) ===
                    Number(paymentLinkVersion)
                ) {
                  session = await getStripe().checkout.sessions.retrieve(
                    applicationRecord.pending_checkout_session_id
                  );
                }
              }
            }
            if (!session) {
              // Compatibility for events received before the relationship column
              // existed. New checkout events always persist the relation above.
              const sessions = await getStripe().checkout.sessions.list({
                limit: 1,
                subscription: subscriptionId,
              });
              session = sessions.data.find(
                (candidate) =>
                  candidate.metadata?.checkout_kind === 'vehicle' &&
                  candidate.metadata?.application_id === subscription.metadata.application_id &&
                  candidate.metadata?.payment_link_version ===
                    subscription.metadata.payment_link_version
              ) || null;
            }

            if (!session) {
              throw new Error(
                `No matching vehicle Checkout Session found for Stripe subscription ${subscriptionId}.`
              );
            }

            fulfillmentOutcome = await handleVehicleCheckoutCompletion(session);
          }
          if (subscription.status === 'active') {
            await updateRentalBySubscriptionIdentityOrSkip(
              subscriptionId,
              await getRentalStatusUpdatePayload('Active'),
              event
            );
          }
        }
        break;
      }
      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || null;
        if (subscription.metadata?.application_id && customerId) {
          await persistVerifiedStripeRelationship({ applicationId: subscription.metadata.application_id, customerId, subscriptionId: subscription.id });
        }
        if (subscription.status === 'active') {
          await updateRentalBySubscriptionIdentityOrSkip(
            subscription.id,
            await getRentalStatusUpdatePayload('Active'),
            event
          );
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;
        const nextRentalStatus = shouldCompleteRentalAfterRequestedCancellation(subscription)
          ? 'Completed'
          : 'Cancelled';
        await updateRentalBySubscriptionIdentityOrSkip(
          subscriptionId,
          await getRentalStatusUpdatePayload(nextRentalStatus, todayIsoDate()),
          event,
          true
        );
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || null;
        if (subscription.metadata?.application_id && customerId) {
          await persistVerifiedStripeRelationship({ applicationId: subscription.metadata.application_id, customerId, subscriptionId });
        }
        const status = subscription.status;
        if (status === 'past_due' || status === 'unpaid') {
          await updateRentalBySubscriptionIdentityOrSkip(
            subscriptionId,
            await getRentalStatusUpdatePayload('Overdue'),
            event
          );
        } else if (status === 'active') {
          await updateRentalBySubscriptionIdentityOrSkip(
            subscriptionId,
            await getRentalStatusUpdatePayload('Active'),
            event
          );
        }
        break;
      }
      default:
        logStripeWebhookEvent('info', 'webhook.unhandled', workItem, {
          eventType: event.type,
        });
    }

    const fulfillmentState = getFulfillmentStateFromOutcome(
      fulfillmentOutcome,
      event.type
    );
    await markLedgerProcessed(webhookClaim, event.type, fulfillmentState);
    logStripeWebhookEvent('info', 'webhook.completed', workItem, {
      fulfillmentState,
    });
    return { status: 200 as const, body: 'received' };
  } catch (err) {
    if (webhookClaim?.mode === 'owned' && webhookClaim.eventId) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const classification = classifyWebhookProcessingError(err);

      if (classification === 'transient') {
        logStripeWebhookEvent('warn', 'webhook.retryable_failure', workItem, {
          classification,
          errorMessage: message,
        });
        try {
          await markLedgerFailed(
            webhookClaim,
            event.type,
            `${classification}:${message}`
          );
        } catch {
          logStripeWebhookEvent('error', 'webhook.ledger_finalization_failed', workItem, {
            classification: 'secondary_persistence_failure',
          });
        }
        throw err;
      }

      await markLedgerProcessedWithClassification(
        webhookClaim,
        event.type,
        classification,
        message
      );

      logStripeWebhookEvent('warn', 'webhook.terminal', workItem, {
        classification,
        errorMessage: message,
      });
      return { status: 200 as const, body: 'received' };
    }

    throw err;
  }
};

export const processStripeWebhookEvent = async (event: Stripe.Event) =>
  processStripeWebhookWorkItem(buildStripeWebhookWorkItem(event), event);
