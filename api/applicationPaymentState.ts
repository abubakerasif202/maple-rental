import { db } from './db/index.js';
import {
  getApplicationSelectColumns,
  getSchemaCompat,
  toApplicationPaymentWritePayload,
} from './schemaCompat.js';

type ApplicationPaymentWritePayload = {
  approved_at?: string | null;
  approved_bond?: number | null;
  bond_notes?: string | null;
  bond_payment_method?: string | null;
  bond_payment_status?: string | null;
  approved_vehicle?: string | null;
  approved_weekly_price?: number | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  intended_start_date?: string | null;
  paid_at?: string | null;
  payment_link_sent_at?: string | null;
  payment_link_version?: number;
  pending_checkout_session_id?: string | null;
  status?: string;
};

const PAYMENT_REVIEW_SOURCE_STATUSES = ['Approved', 'Payment Review'] as const;

export const updateApplicationPaymentStateIfCurrentVersionAndStatus = async ({
  applicationId,
  expectedPaymentLinkVersion,
  expectedStatuses,
  payload,
}: {
  applicationId: string;
  expectedPaymentLinkVersion: number;
  expectedStatuses: readonly string[];
  payload: ApplicationPaymentWritePayload;
}) => {
  const compat = await getSchemaCompat();
  const selectColumns = await getApplicationSelectColumns();
  const mappedPayload = await toApplicationPaymentWritePayload(payload);

  const { data, error } = await db
    .from('applications')
    .update(mappedPayload)
    .eq('id', applicationId)
    .eq(compat.applicationPaymentLinkVersionColumn, expectedPaymentLinkVersion)
    .in('status', [...expectedStatuses])
    .select(selectColumns)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as unknown as Record<string, unknown> | null) ?? null;
};

export const updateApplicationPaymentStateIfCurrentVersion = async ({
  applicationId,
  expectedPaymentLinkVersion,
  payload,
}: {
  applicationId: string;
  expectedPaymentLinkVersion: number;
  payload: ApplicationPaymentWritePayload;
}) => {
  const compat = await getSchemaCompat();
  const selectColumns = await getApplicationSelectColumns();
  const mappedPayload = await toApplicationPaymentWritePayload(payload);

  const { data, error } = await db
    .from('applications')
    .update(mappedPayload)
    .eq('id', applicationId)
    .eq(
      compat.applicationPaymentLinkVersionColumn,
      expectedPaymentLinkVersion
    )
    .select(selectColumns)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as unknown as Record<string, unknown> | null) ?? null;
};

export const transitionApplicationToPaymentReviewIfCurrentVersion = async ({
  applicationId,
  paidAt,
  pendingCheckoutSessionId,
}: {
  applicationId: string;
  paidAt?: string | null;
  pendingCheckoutSessionId?: string | null;
}) => {
  const selectColumns = await getApplicationSelectColumns();
  const mappedPayload = await toApplicationPaymentWritePayload({
    paid_at: paidAt,
    pending_checkout_session_id: pendingCheckoutSessionId,
    status: 'Payment Review',
  });

  const { data, error } = await db
    .from('applications')
    .update(mappedPayload)
    .eq('id', applicationId)
    .in('status', [...PAYMENT_REVIEW_SOURCE_STATUSES])
    .select(selectColumns)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as unknown as Record<string, unknown> | null) ?? null;
};

export const persistPendingCheckoutSessionIdIfCurrentVersion = async ({
  applicationId,
  expectedPaymentLinkVersion,
  sessionId,
}: {
  applicationId: string;
  expectedPaymentLinkVersion: number;
  sessionId: string | null;
}) => {
  const updatedApplication = await updateApplicationPaymentStateIfCurrentVersion({
    applicationId,
    expectedPaymentLinkVersion,
    payload: {
      pending_checkout_session_id: sessionId,
    },
  });

  return Boolean(updatedApplication);
};
