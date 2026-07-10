import type Stripe from 'stripe';

export const FALLBACK_ADMIN_EMAIL = 'admin@maplerentals.com.au';

export const LEASE_SETTINGS = {
  currency: 'aud',
  recurring_interval: 'week' as const,
  minimum_rental_weeks: 6,
  insurance_coverage_region: 'NSW',
  fees: {
    account_management_weekly: 0,
    new_account_setup: 0,
    direct_debit_account_setup: 0,
  },
};

export const RENTAL_PLAN_SETUP_FEES_AUD = Number(
  (
    LEASE_SETTINGS.fees.new_account_setup +
    LEASE_SETTINGS.fees.direct_debit_account_setup
  ).toFixed(2)
);

export const STRIPE_API_VERSION = '2026-04-22.dahlia' as const;

export const STRIPE_CONFIG: Stripe.StripeConfig = {
  // stripe-node only types the library's latest API version literal. Maple Rental
  // intentionally pins a validated account version until a broader Stripe upgrade.
  apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
  typescript: true,
};
