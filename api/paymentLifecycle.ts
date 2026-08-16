import type Stripe from 'stripe';

import { db } from './db/index.js';
import { recordAdminAuditEvent } from './adminAudit.js';
import { withPostgresAdvisoryLock } from './db/postgres.js';

type VerifiedRelationship = {
  applicationId: string;
  checkoutSessionId?: string | null;
  customerId: string;
  subscriptionId: string;
};

const isoDate = (value: string | number | null | undefined) => {
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
};

const stripeId = (value: string | { id?: string } | null | undefined) =>
  typeof value === 'string' ? value : value?.id || null;

export const persistVerifiedStripeRelationship = async (input: VerifiedRelationship) => {
  const { data: application, error: applicationError } = await db
    .from('applications')
    .select('id, name, email, phone, address, status, stripe_customer_id, stripe_subscription_id')
    .eq('id', input.applicationId)
    .single();
  if (applicationError || !application) throw applicationError || new Error('Application not found for verified Stripe relationship.');

  if (application.stripe_subscription_id && application.stripe_subscription_id !== input.subscriptionId) {
    throw new Error('Application is already linked to a different Stripe subscription; manual review is required.');
  }
  const applicationUpdate = await db.from('applications').update({
    stripe_checkout_session_id: input.checkoutSessionId || undefined,
    stripe_customer_id: input.customerId,
    stripe_subscription_id: input.subscriptionId,
  }).eq('id', input.applicationId);
  if (applicationUpdate.error) throw applicationUpdate.error;

  const existing = await db.from('customers').select('id, application_id, stripe_customer_id').eq('stripe_customer_id', input.customerId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.application_id && existing.data.application_id !== input.applicationId) {
    throw new Error('Stripe customer is already linked to another application; manual review is required.');
  }

  const customerPayload = {
    application_id: input.applicationId,
    stripe_customer_id: input.customerId,
    external_id: `stripe:${input.customerId}`,
    full_name: String(application.name || 'Stripe customer'),
    phone: application.phone || null,
    email: application.email || null,
    street: application.address || null,
    source: 'stripe-verified',
    updated_at: new Date().toISOString(),
  };
  if (existing.data?.id) {
    const update = await db.from('customers').update(customerPayload).eq('id', existing.data.id);
    if (update.error) throw update.error;
    return Number(existing.data.id);
  }
  const inserted = await db.from('customers').insert(customerPayload).select('id').single();
  if (inserted.error) {
    // A concurrent webhook may have won the unique Stripe-customer insert.
    const concurrent = await db.from('customers').select('id').eq('stripe_customer_id', input.customerId).maybeSingle();
    if (concurrent.data?.id) return Number(concurrent.data.id);
    throw inserted.error;
  }
  return Number(inserted.data.id);
};

export const persistCheckoutRelationshipFromSession = async (session: Stripe.Checkout.Session) => {
  const applicationId = session.metadata?.application_id;
  const customerId = stripeId(session.customer);
  const subscriptionId = stripeId(session.subscription);
  if (!applicationId || !customerId || !subscriptionId) return null;
  return persistVerifiedStripeRelationship({
    applicationId,
    checkoutSessionId: session.id,
    customerId,
    subscriptionId,
  });
};

export const activateRentalForApplication = async (applicationId: string, actor: string | null) =>
  withPostgresAdvisoryLock(`activate-rental:${applicationId}`, async () => {
    const { data: application, error } = await db.from('applications').select('*').eq('id', applicationId).single();
    if (error || !application) throw new Error('Application not found.');
    if (application.status !== 'Paid') throw new Error('Only Paid applications can be activated.');
    if (!application.stripe_subscription_id || !application.stripe_customer_id) throw new Error('Verified Stripe subscription and customer are required.');

    const existing = await db.from('rentals').select('*').eq('application_id', applicationId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return existing.data;

    const customer = await db.from('customers').select('id').eq('stripe_customer_id', application.stripe_customer_id).maybeSingle();
    if (customer.error || !customer.data?.id) throw customer.error || new Error('Linked operational customer is missing.');
    const inserted = await db.from('rentals').insert({
      application_id: applicationId,
      customer_id: customer.data.id,
      vehicle_registration: application.approved_vehicle,
      start_date: application.intended_start_date,
      weekly_price: application.approved_weekly_price,
      bond_paid: 0,
      status: 'Active',
      stripe_customer_id: application.stripe_customer_id,
      stripe_subscription_id: application.stripe_subscription_id,
    }).select('*').single();
    if (inserted.error) {
      const raced = await db.from('rentals').select('*').eq('application_id', applicationId).maybeSingle();
      if (raced.data) return raced.data;
      throw inserted.error;
    }
    await recordAdminAuditEvent({ action: 'rental.activated', actor, targetId: applicationId, targetType: 'application', metadata: { rentalId: inserted.data.id, stripeSubscriptionId: application.stripe_subscription_id } });
    return inserted.data;
  });

export const syncStripeInvoice = async (invoice: Stripe.Invoice, customerId: string | null, subscriptionId: string | null) => {
  if (!invoice.id || !customerId) return;
  const customer = await db.from('customers').select('id, full_name').eq('stripe_customer_id', customerId).maybeSingle();
  if (customer.error || !customer.data?.id) return;
  const amount = Number(invoice.amount_due || invoice.amount_paid || 0) / 100;
  const balance = invoice.status === 'paid' ? 0 : Math.max(Number(invoice.amount_remaining || invoice.amount_due || 0) / 100, 0);
  const payload = {
    external_invoice_number: `stripe:${invoice.id}`,
    stripe_invoice_id: invoice.id,
    stripe_subscription_id: subscriptionId,
    customer_id: customer.data.id,
    customer_name: customer.data.full_name || 'Stripe subscription customer',
    invoice_date: isoDate(invoice.created),
    due_label: invoice.status === 'paid' ? 'Paid' : 'Due',
    amount,
    balance,
    transaction_summary: 'Stripe subscription invoice',
    source: 'stripe-verified',
  };
  const existing = await db.from('invoices').select('id').eq('stripe_invoice_id', invoice.id).maybeSingle();
  if (existing.error) throw existing.error;
  const result = existing.data
    ? await db.from('invoices').update(payload).eq('id', existing.data.id)
    : await db.from('invoices').insert(payload);
  if (result.error) throw result.error;
};
