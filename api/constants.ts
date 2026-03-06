export const LEASE_SETTINGS = {
  currency: 'aud',
  recurring_interval: 'week' as const,
  minimum_rental_weeks: 6,
  insurance_coverage_region: 'NSW',
  fees: {
    account_management_weekly: 1.0,
    new_account_setup: 10.0,
    direct_debit_account_setup: 2.2,
  },
};

export const RENTAL_PLAN_SETUP_FEES_AUD = Number(
  (
    LEASE_SETTINGS.fees.new_account_setup +
    LEASE_SETTINGS.fees.direct_debit_account_setup
  ).toFixed(2)
);

export const STRIPE_CONFIG = {
  apiVersion: '2023-10-16' as any,
};

export const SAAS_CONFIG = {
  mcc: '7519',
  product_description_suffix: 'on Maple SaaS',
  url: 'https://maple-rental.com',
};
