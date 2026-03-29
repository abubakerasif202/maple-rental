import { env } from '../config/env.js';
import { badRequest, notFound } from '../lib/httpError.js';
import { stripe } from '../lib/stripe.js';
import { supabaseAdmin, createSignedStorageUrl } from '../lib/supabase.js';
import { sendPaymentFailedNotification, sendPaymentSuccessNotification } from './notificationService.js';
import { getDriverById, updateDriver } from './driverService.js';

const currency = env.STRIPE_PRICE_CURRENCY.toLowerCase();
const toCents = (value) => Math.round(Number(value || 0) * 100);
const fromUnix = (value) => (value ? new Date(value * 1000).toISOString() : null);

const getApplicationWithJoins = async (applicationId) => {
  const { data, error } = await supabaseAdmin
    .from('applications')
    .select('*, drivers(*), vehicles(*), contract:contracts!applications_contract_id_fkey(*)')
    .eq('id', applicationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const getVehicleById = async (vehicleId) => {
  const { data, error } = await supabaseAdmin
    .from('vehicles')
    .select('*')
    .eq('id', vehicleId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const getSubscriptionByStripeSubscriptionId = async (stripeSubscriptionId) => {
  if (!stripeSubscriptionId) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const getSubscriptionByApplicationId = async (applicationId) => {
  if (!applicationId) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('application_id', applicationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const getPaymentByInvoiceId = async (stripeInvoiceId) => {
  if (!stripeInvoiceId) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('payments')
    .select('*')
    .eq('stripe_invoice_id', stripeInvoiceId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const ensureStripeCustomer = async (driver) => {
  if (driver.stripe_customer_id) {
    return driver.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    email: driver.email,
    name: driver.full_name,
    phone: driver.phone || undefined,
    metadata: {
      driverId: driver.id,
    },
  });

  await supabaseAdmin
    .from('drivers')
    .update({ stripe_customer_id: customer.id })
    .eq('id', driver.id);

  return customer.id;
};

const syncContractUrl = async (application) => {
  const contract = application.contract;
  if (!contract?.storage_path) {
    return null;
  }

  return createSignedStorageUrl(contract.storage_bucket || env.CONTRACTS_BUCKET, contract.storage_path);
};

const upsertSubscriptionRecord = async (payload) => {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .upsert(payload, { onConflict: 'application_id' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

const upsertPayment = async (payload) => {
  const { data, error } = await supabaseAdmin
    .from('payments')
    .upsert(payload, { onConflict: 'stripe_invoice_id' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

const resolveSubscriptionContext = async ({ stripeSubscriptionId, metadata = {} }) => {
  const byStripeId = await getSubscriptionByStripeSubscriptionId(stripeSubscriptionId);
  const byApplicationId =
    metadata.applicationId && metadata.applicationId !== byStripeId?.application_id
      ? await getSubscriptionByApplicationId(metadata.applicationId)
      : null;

  const subscriptionRecord = byStripeId || byApplicationId || null;

  return {
    subscriptionRecord,
    applicationId: metadata.applicationId || subscriptionRecord?.application_id || null,
    driverId: metadata.driverId || subscriptionRecord?.driver_id || null,
    vehicleId: metadata.vehicleId || subscriptionRecord?.vehicle_id || null,
  };
};

export const createCheckoutSession = async ({
  applicationId,
  successUrl,
  cancelUrl,
}) => {
  const application = await getApplicationWithJoins(applicationId);
  if (!application) {
    throw notFound('Application not found');
  }

  if (!['approved', 'checkout_pending'].includes(application.status)) {
    throw badRequest('Application must be approved before billing starts');
  }

  const driver = application.drivers;
  const vehicle = application.vehicles;

  if (!driver || !vehicle) {
    throw badRequest('Application is missing driver or vehicle details');
  }

  const stripeCustomerId = await ensureStripeCustomer(driver);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: stripeCustomerId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    payment_method_collection: 'always',
    line_items: [
      {
        price_data: {
          currency,
          product_data: {
            name: `${vehicle.make} ${vehicle.model} weekly rental`,
          },
          recurring: {
            interval: 'week',
          },
          unit_amount: toCents(vehicle.weekly_rate),
        },
        quantity: 1,
      },
      {
        price_data: {
          currency,
          product_data: {
            name: `${vehicle.make} ${vehicle.model} security bond`,
          },
          unit_amount: toCents(vehicle.bond_amount),
        },
        quantity: 1,
      },
    ],
    metadata: {
      applicationId: application.id,
      driverId: driver.id,
      vehicleId: vehicle.id,
    },
    subscription_data: {
      metadata: {
        applicationId: application.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
      },
    },
  });

  await Promise.all([
    upsertSubscriptionRecord({
      application_id: application.id,
      driver_id: driver.id,
      vehicle_id: vehicle.id,
      stripe_customer_id: stripeCustomerId,
      stripe_checkout_session_id: session.id,
      status: 'checkout_pending',
      weekly_rate: vehicle.weekly_rate,
      bond_amount: vehicle.bond_amount,
    }),
    supabaseAdmin
      .from('applications')
      .update({ status: 'checkout_pending' })
      .eq('id', application.id),
  ]);

  return {
    url: session.url,
    sessionId: session.id,
    contractUrl: await syncContractUrl(application),
  };
};

export const createDirectSubscription = async ({
  applicationId,
  paymentMethodId,
}) => {
  const application = await getApplicationWithJoins(applicationId);
  if (!application) {
    throw notFound('Application not found');
  }

  if (!['approved', 'checkout_pending'].includes(application.status)) {
    throw badRequest('Application must be approved before a subscription can be created');
  }

  const driver = application.drivers;
  const vehicle = application.vehicles;
  if (!driver || !vehicle) {
    throw badRequest('Application is missing billing context');
  }

  const stripeCustomerId = await ensureStripeCustomer(driver);
  await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId });
  await stripe.customers.update(stripeCustomerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });

  const subscription = await stripe.subscriptions.create({
    customer: stripeCustomerId,
    items: [
      {
        price_data: {
          currency,
          product_data: {
            name: `${vehicle.make} ${vehicle.model} weekly rental`,
          },
          recurring: {
            interval: 'week',
          },
          unit_amount: toCents(vehicle.weekly_rate),
        },
      },
    ],
    add_invoice_items: [
      {
        price_data: {
          currency,
          product_data: {
            name: `${vehicle.make} ${vehicle.model} security bond`,
          },
          unit_amount: toCents(vehicle.bond_amount),
        },
      },
    ],
    metadata: {
      applicationId: application.id,
      driverId: driver.id,
      vehicleId: vehicle.id,
    },
  });

  await Promise.all([
    upsertSubscriptionRecord({
      application_id: application.id,
      driver_id: driver.id,
      vehicle_id: vehicle.id,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      weekly_rate: vehicle.weekly_rate,
      bond_amount: vehicle.bond_amount,
      current_period_start: fromUnix(subscription.current_period_start),
      current_period_end: fromUnix(subscription.current_period_end),
    }),
    supabaseAdmin
      .from('applications')
      .update({ status: 'checkout_pending' })
      .eq('id', application.id),
  ]);

  return subscription;
};

export const createCustomerPortal = async ({ driverId, returnUrl }) => {
  const driver = await getDriverById(driverId);
  if (!driver?.stripe_customer_id) {
    throw badRequest('Driver is not linked to a Stripe customer');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: driver.stripe_customer_id,
    return_url: returnUrl,
  });

  return session;
};

export const handleInvoicePaid = async (invoice) => {
  const stripeSubscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id;

  if (!stripeSubscriptionId) {
    return null;
  }

  const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const {
    subscriptionRecord: existingSubscription,
    applicationId,
    driverId,
    vehicleId,
  } = await resolveSubscriptionContext({
    stripeSubscriptionId,
    metadata: stripeSubscription.metadata,
  });

  if (!applicationId || !driverId || !vehicleId) {
    throw badRequest('Stripe payment could not resolve application, driver, and vehicle identifiers');
  }

  const [driver, vehicle, existingPayment] = await Promise.all([
    getDriverById(driverId),
    getVehicleById(vehicleId),
    getPaymentByInvoiceId(invoice.id),
  ]);

  if (!driver) {
    throw notFound('Driver not found for paid invoice');
  }

  if (!vehicle) {
    throw notFound('Vehicle not found for paid invoice');
  }

  const recurringLine = stripeSubscription.items.data.find((item) => item.price?.recurring);
  const bondLine = invoice.lines.data.find((item) => item.price && !item.price.recurring);

  const subscriptionRecord = await upsertSubscriptionRecord({
    application_id: applicationId,
    driver_id: driverId,
    vehicle_id: vehicleId,
    stripe_customer_id:
      typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id || existingSubscription?.stripe_customer_id || null,
    stripe_subscription_id: stripeSubscription.id,
    stripe_checkout_session_id: existingSubscription?.stripe_checkout_session_id || null,
    status: 'active',
    weekly_rate:
      existingSubscription?.weekly_rate ??
      Number(recurringLine?.price?.unit_amount || 0) / 100,
    bond_amount:
      existingSubscription?.bond_amount ??
      Number(bondLine?.amount || 0) / 100,
    current_period_start: fromUnix(stripeSubscription.current_period_start),
    current_period_end: fromUnix(stripeSubscription.current_period_end),
    canceled_at: null,
    last_invoice_id: invoice.id,
  });

  const payment = await upsertPayment({
    driver_id: driverId,
    subscription_id: subscriptionRecord.id,
    application_id: applicationId,
    stripe_invoice_id: invoice.id,
    stripe_payment_intent_id:
      typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent?.id,
    amount: Number(invoice.amount_paid || 0) / 100,
    currency: invoice.currency || currency,
    status: 'paid',
    paid_at: new Date().toISOString(),
    failure_message: null,
    retry_count: 0,
    next_retry_at: null,
  });

  await Promise.all([
    supabaseAdmin.from('applications').update({ status: 'subscribed' }).eq('id', applicationId),
    supabaseAdmin.from('vehicles').update({ status: 'active' }).eq('id', vehicleId),
    updateDriver(driverId, {
      status: 'active',
      current_vehicle_id: vehicleId,
    }),
  ]);

  if (existingPayment?.status !== 'paid') {
    await sendPaymentSuccessNotification({
      driver,
      payment,
      vehicle,
    });
  }

  return {
    subscription: subscriptionRecord,
    payment,
  };
};

export const handleInvoicePaymentFailed = async (invoice) => {
  const stripeSubscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id;

  if (!stripeSubscriptionId) {
    return null;
  }

  let subscriptionRecord = await getSubscriptionByStripeSubscriptionId(stripeSubscriptionId);

  if (!subscriptionRecord) {
    const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    subscriptionRecord = await getSubscriptionByApplicationId(
      stripeSubscription.metadata.applicationId,
    );
  }

  if (!subscriptionRecord) {
    throw notFound('Subscription record not found for failed invoice');
  }

  const [driver, existingPayment] = await Promise.all([
    getDriverById(subscriptionRecord.driver_id),
    getPaymentByInvoiceId(invoice.id),
  ]);

  const payment = await upsertPayment({
    driver_id: subscriptionRecord.driver_id,
    subscription_id: subscriptionRecord.id,
    application_id: subscriptionRecord.application_id,
    stripe_invoice_id: invoice.id,
    stripe_payment_intent_id:
      typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent?.id,
    amount: Number(invoice.amount_due || 0) / 100,
    currency: invoice.currency || currency,
    status: 'failed',
    failure_message:
      invoice.last_finalization_error?.message ||
      existingPayment?.failure_message ||
      'Payment failed',
    retry_count: existingPayment?.retry_count || 0,
    next_retry_at:
      existingPayment?.next_retry_at ||
      new Date(Date.now() + env.PAYMENT_RETRY_DELAY_HOURS * 60 * 60 * 1000).toISOString(),
  });

  await Promise.all([
    upsertSubscriptionRecord({
      ...subscriptionRecord,
      status: 'past_due',
      last_invoice_id: invoice.id,
    }),
    driver
      ? updateDriver(subscriptionRecord.driver_id, { status: 'suspended' })
      : Promise.resolve(null),
  ]);

  if (driver && existingPayment?.status !== 'failed') {
    await sendPaymentFailedNotification({
      driver,
      payment,
    });
  }

  return payment;
};

export const handleSubscriptionDeleted = async (subscription) => {
  const {
    subscriptionRecord,
    applicationId,
    driverId,
    vehicleId,
  } = await resolveSubscriptionContext({
    stripeSubscriptionId: subscription.id,
    metadata: subscription.metadata,
  });

  if (applicationId && driverId && vehicleId) {
    await upsertSubscriptionRecord({
      ...(subscriptionRecord || {}),
      application_id: applicationId,
      driver_id: driverId,
      vehicle_id: vehicleId,
      stripe_customer_id:
        subscriptionRecord?.stripe_customer_id ||
        (typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id) ||
        null,
      stripe_subscription_id: subscription.id,
      status: 'canceled',
      weekly_rate: subscriptionRecord?.weekly_rate || 0,
      bond_amount: subscriptionRecord?.bond_amount || 0,
      current_period_start:
        subscriptionRecord?.current_period_start || fromUnix(subscription.current_period_start),
      current_period_end:
        subscriptionRecord?.current_period_end || fromUnix(subscription.current_period_end),
      canceled_at: new Date().toISOString(),
      last_invoice_id: subscriptionRecord?.last_invoice_id || null,
    });
  } else if (subscriptionRecord) {
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
      })
      .eq('id', subscriptionRecord.id);

    if (error) {
      throw error;
    }
  }

  await Promise.all([
    applicationId
      ? supabaseAdmin.from('applications').update({ status: 'cancelled' }).eq('id', applicationId)
      : Promise.resolve(null),
    vehicleId
      ? supabaseAdmin.from('vehicles').update({ status: 'available' }).eq('id', vehicleId)
      : Promise.resolve(null),
    driverId
      ? updateDriver(driverId, { status: 'disabled', current_vehicle_id: null })
      : Promise.resolve(null),
  ]);

  return { driverId, vehicleId, applicationId };
};

export const getBillingSummary = async (driverId) => {
  const [driver, { data: subscriptions }, { data: payments }, { data: contracts }] = await Promise.all([
    getDriverById(driverId),
    supabaseAdmin
      .from('subscriptions')
      .select('*, vehicles(*)')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('payments')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabaseAdmin
      .from('contracts')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  if (!driver) {
    throw notFound('Driver not found');
  }

  const resolvedContracts = await Promise.all(
    (contracts || []).map(async (contract) => ({
      ...contract,
      signed_url: await createSignedStorageUrl(
        contract.storage_bucket || env.CONTRACTS_BUCKET,
        contract.storage_path,
      ),
    })),
  );

  return {
    driver,
    subscriptions: subscriptions || [],
    payments: payments || [],
    contracts: resolvedContracts,
  };
};
