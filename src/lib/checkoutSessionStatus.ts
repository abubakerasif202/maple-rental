export type CheckoutSessionStatusState =
  | 'complete_paid'
  | 'processing'
  | 'pending_webhook'
  | 'manual_review'
  | 'failed';

export interface CheckoutSessionStatusView {
  application_status:
    | 'Pending'
    | 'Paid'
    | 'Approved'
    | 'Rejected'
    | 'Payment Review'
    | 'Cancelled';
  checkout_kind: 'application' | 'vehicle' | null;
  customer_id?: string | null;
  db_payment_activation_status?: {
    application_status: string;
    activated: boolean;
    pending_checkout_session_id: string | null;
    rental_status: string | null;
  };
  id: string;
  internal_status: CheckoutSessionStatusState;
  metadata_match?: {
    application_id?: boolean;
    car_id?: boolean | null;
    checkout_kind?: boolean;
    matched: boolean;
    payment_link_version?: boolean;
    reason?: string;
  };
  payment_method_type?: string | null;
  payment_method_types?: string[];
  payment_status: string | null;
  rental_status: 'Active' | 'Completed' | 'Cancelled' | 'Overdue' | string | null;
  state?: CheckoutSessionStatusState;
  status: string | null;
  subscription_id?: string | null;
}

export type CheckoutStatusTone = 'success' | 'processing' | 'review' | 'failure';

export interface CheckoutStatusPresentation {
  body: string;
  isFailure: boolean;
  shouldRefetch: boolean;
  showSecurePaymentLink: boolean;
  showSpinner: boolean;
  state: CheckoutSessionStatusState | 'verification_error';
  title: string;
  tone: CheckoutStatusTone;
}

const isDirectDebitStatus = (data: CheckoutSessionStatusView | null | undefined) =>
  data?.payment_method_type === 'au_becs_debit' ||
  Boolean(data?.payment_method_types?.includes('au_becs_debit'));

const isExpiredOrCanceledCheckout = (data: CheckoutSessionStatusView | null | undefined) =>
  ['canceled', 'cancelled', 'expired', 'failed'].includes(
    String(data?.status || '').toLowerCase()
  );

export const getCheckoutStatusPresentation = ({
  data,
  hasVerificationContext,
  isError,
  pollingTimedOut = false,
}: {
  data?: CheckoutSessionStatusView | null;
  hasVerificationContext: boolean;
  isError: boolean;
  pollingTimedOut?: boolean;
}): CheckoutStatusPresentation => {
  if (isError || !hasVerificationContext || !data) {
    return {
      body: 'We could not verify this secure checkout session yet. If Stripe charged the payment, Gala Rentals can recover it from the checkout session.',
      isFailure: true,
      shouldRefetch: false,
      showSecurePaymentLink: false,
      showSpinner: false,
      state: 'verification_error',
      title: 'Payment Verification Needed',
      tone: 'failure',
    };
  }

  const state = data.state || data.internal_status;
  const timeoutSuffix =
    ' This page stopped automatic checks to avoid an endless loading state. Use retry to check the latest Stripe status again.';

  if (state === 'complete_paid') {
    return {
      body: 'Your payment has been confirmed. Weekly payments will now be managed through Stripe, and Gala Rentals will contact you to complete onboarding and handover details.',
      isFailure: false,
      shouldRefetch: false,
      showSecurePaymentLink: false,
      showSpinner: false,
      state,
      title: 'Payment Successful',
      tone: 'success',
    };
  }

  if (data.application_status === 'Cancelled') {
    return {
      body: 'This application has been cancelled by Gala Rentals. If you believe this is a mistake, contact support before trying the link again.',
      isFailure: true,
      shouldRefetch: false,
      showSecurePaymentLink: false,
      showSpinner: false,
      state: 'failed',
      title: 'Application Cancelled',
      tone: 'failure',
    };
  }

  if (state === 'pending_webhook') {
    return {
      body:
        'Stripe has confirmed your payment. We are finalizing your onboarding status now and this page refreshes automatically while that completes.' +
        (pollingTimedOut ? timeoutSuffix : ''),
      isFailure: false,
      shouldRefetch: !pollingTimedOut,
      showSecurePaymentLink: false,
      showSpinner: !pollingTimedOut,
      state,
      title: 'Payment Received',
      tone: 'processing',
    };
  }

  if (state === 'manual_review') {
    return {
      body:
        'Stripe has already confirmed your payment. We are waiting for Gala Rentals to complete the final onboarding checks, and this page will keep checking automatically while that finishes. Gala Rentals will contact you if any manual action is still needed.' +
        (pollingTimedOut ? timeoutSuffix : ''),
      isFailure: false,
      shouldRefetch: !pollingTimedOut,
      showSecurePaymentLink: false,
      showSpinner: false,
      state,
      title: 'Activation Pending',
      tone: 'review',
    };
  }

  if (state === 'processing') {
    const directDebit = isDirectDebitStatus(data);

    return {
      body: directDebit
        ? "Your direct debit has been created. Bank payments can take a few business days to confirm. We'll update your rental status once Stripe confirms the payment." +
          (pollingTimedOut ? timeoutSuffix : '')
        : 'Stripe is still confirming this checkout session. This page refreshes automatically while the payment status updates.' +
          (pollingTimedOut ? timeoutSuffix : ''),
      isFailure: false,
      shouldRefetch: !pollingTimedOut,
      showSecurePaymentLink: false,
      showSpinner: !pollingTimedOut,
      state,
      title: directDebit ? 'Payment Setup Received' : 'Payment Processing',
      tone: 'processing',
    };
  }

  return {
    body: isExpiredOrCanceledCheckout(data)
      ? 'Stripe reported that this checkout did not complete. Return to the secure payment link to try again.'
      : 'This checkout could not be verified against the secure payment link. Contact Gala Rentals so the session can be reviewed safely.',
    isFailure: true,
    shouldRefetch: false,
    showSecurePaymentLink: isExpiredOrCanceledCheckout(data),
    showSpinner: false,
    state,
    title: 'Payment Not Completed',
    tone: 'failure',
  };
};
