import { describe, expect, it } from 'vitest';
import {
  getCheckoutStatusPresentation,
  type CheckoutSessionStatusView,
} from './checkoutSessionStatus';

const baseStatus: CheckoutSessionStatusView = {
  application_status: 'Approved',
  checkout_kind: 'vehicle',
  id: 'cs_test_123',
  internal_status: 'pending_webhook',
  payment_method_type: 'card',
  payment_method_types: ['card'],
  payment_status: 'paid',
  rental_status: null,
  state: 'pending_webhook',
  status: 'complete',
};

describe('checkout session status presentation', () => {
  it('shows success for an activated card checkout that is complete and paid', () => {
    const presentation = getCheckoutStatusPresentation({
      data: {
        ...baseStatus,
        application_status: 'Paid',
        internal_status: 'complete_paid',
        rental_status: 'Active',
        state: 'complete_paid',
      },
      hasVerificationContext: true,
      isError: false,
    });

    expect(presentation.title).toBe('Payment Successful');
    expect(presentation.isFailure).toBe(false);
    expect(presentation.showSecurePaymentLink).toBe(false);
    expect(presentation.shouldRefetch).toBe(false);
  });

  it('shows a stable scheduled state before a future first payment', () => {
    const presentation = getCheckoutStatusPresentation({
      data: {
        ...baseStatus,
        internal_status: 'scheduled',
        payment_status: 'no_payment_required',
        state: 'scheduled',
      },
      hasVerificationContext: true,
      isError: false,
    });

    expect(presentation.title).toBe('Payment Scheduled');
    expect(presentation.isFailure).toBe(false);
    expect(presentation.shouldRefetch).toBe(false);
    expect(presentation.showSpinner).toBe(false);
  });

  it('shows BECS direct debit processing copy without treating unpaid complete checkout as failure', () => {
    const presentation = getCheckoutStatusPresentation({
      data: {
        ...baseStatus,
        internal_status: 'processing',
        payment_method_type: 'au_becs_debit',
        payment_method_types: ['au_becs_debit'],
        payment_status: 'unpaid',
        state: 'processing',
      },
      hasVerificationContext: true,
      isError: false,
    });

    expect(presentation.title).toBe('Payment Setup Received');
    expect(presentation.body).toContain('Your direct debit has been created');
    expect(presentation.isFailure).toBe(false);
    expect(presentation.showSecurePaymentLink).toBe(false);
    expect(presentation.shouldRefetch).toBe(true);
  });

  it('shows failed checkout copy and secure payment return for expired sessions', () => {
    const presentation = getCheckoutStatusPresentation({
      data: {
        ...baseStatus,
        internal_status: 'failed',
        payment_status: 'unpaid',
        state: 'failed',
        status: 'expired',
      },
      hasVerificationContext: true,
      isError: false,
    });

    expect(presentation.title).toBe('Payment Not Completed');
    expect(presentation.isFailure).toBe(true);
    expect(presentation.showSecurePaymentLink).toBe(true);
    expect(presentation.shouldRefetch).toBe(false);
  });

  it('shows webhook delay as pending, not failure', () => {
    const presentation = getCheckoutStatusPresentation({
      data: {
        ...baseStatus,
        internal_status: 'pending_webhook',
        state: 'pending_webhook',
      },
      hasVerificationContext: true,
      isError: false,
    });

    expect(presentation.title).toBe('Payment Received');
    expect(presentation.isFailure).toBe(false);
    expect(presentation.showSecurePaymentLink).toBe(false);
    expect(presentation.shouldRefetch).toBe(true);
  });

  it('stops automatic polling after repeated pending webhook checks without showing failure', () => {
    const presentation = getCheckoutStatusPresentation({
      data: {
        ...baseStatus,
        internal_status: 'pending_webhook',
        state: 'pending_webhook',
      },
      hasVerificationContext: true,
      isError: false,
      pollingTimedOut: true,
    });

    expect(presentation.title).toBe('Payment Received');
    expect(presentation.isFailure).toBe(false);
    expect(presentation.shouldRefetch).toBe(false);
    expect(presentation.showSpinner).toBe(false);
    expect(presentation.body).toContain('stopped automatic checks');
  });
});
