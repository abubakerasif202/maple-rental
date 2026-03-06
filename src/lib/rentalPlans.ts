export type RentalPlanInterval = 'week' | 'month';

export interface RentalPlan {
  id: string;
  name: string;
  description: string;
  priceAud: number;
  cadence: string;
  highlight?: string;
  popular?: boolean;
  features: string[];
  billingInterval: RentalPlanInterval;
  billingIntervalCount: number;
  bondAud: number;
}

export interface RentalFeeSettings {
  account_management_weekly: number;
  new_account_setup: number;
  direct_debit_account_setup: number;
}

export interface RentalPlanPricing {
  currency: 'AUD';
  bondAud: number;
  initialRentalAud: number;
  setupFeesAud: number;
  serviceFeeAud: number;
  upfrontDueAud: number;
  recurringDueAud: number;
  recurringLabel: string;
  recurringInterval: RentalPlanInterval;
  recurringIntervalCount: number;
}

export interface RentalPlanWithPricing extends RentalPlan {
  pricing: RentalPlanPricing;
}

export const rentalPlans: RentalPlan[] = [
  {
    id: 'weekly',
    name: 'Weekly Rental',
    description: 'Fastest path to getting on the road with a low-commitment weekly cadence.',
    priceAud: 450,
    cadence: 'per week',
    highlight: 'Best for trial runs',
    billingInterval: 'week',
    billingIntervalCount: 1,
    bondAud: 500,
    features: [
      'Toyota Camry Hybrid',
      'Full insurance coverage',
      '24/7 roadside assistance',
      'Weekly vehicle inspection',
    ],
  },
  {
    id: 'fortnightly',
    name: 'Fortnightly Rental',
    description: 'Balanced pricing for active drivers who want stronger weekly economics.',
    priceAud: 800,
    cadence: 'per fortnight',
    highlight: 'Most popular',
    popular: true,
    billingInterval: 'week',
    billingIntervalCount: 2,
    bondAud: 500,
    features: [
      'Toyota Camry Hybrid',
      'Full insurance coverage',
      '24/7 roadside assistance',
      'Bi-weekly vehicle inspection',
      'Priority support',
    ],
  },
  {
    id: 'monthly',
    name: 'Monthly Rental',
    description: 'Lowest blended rate for committed drivers who want predictable fleet access.',
    priceAud: 1500,
    cadence: 'per month',
    highlight: 'Best value',
    billingInterval: 'month',
    billingIntervalCount: 1,
    bondAud: 500,
    features: [
      'Toyota Camry Hybrid',
      'Full insurance coverage',
      '24/7 roadside assistance',
      'Monthly vehicle inspection',
      'Priority support',
      'Free vehicle swap',
    ],
  },
];

export function getRentalPlanById(id?: string | null): RentalPlan | undefined {
  if (!id) return undefined;
  return rentalPlans.find((plan) => plan.id === id);
}

function getManagementFeeMultiplier(plan: RentalPlan): number {
  if (plan.billingInterval === 'month') {
    return 4 * plan.billingIntervalCount;
  }
  return plan.billingIntervalCount;
}

export function buildRentalPlanWithPricing(
  plan: RentalPlan,
  fees: RentalFeeSettings
): RentalPlanWithPricing {
  const setupFeesAud = Number(
    (fees.new_account_setup + fees.direct_debit_account_setup).toFixed(2)
  );
  const serviceFeeAud = Number(
    (fees.account_management_weekly * getManagementFeeMultiplier(plan)).toFixed(2)
  );
  const upfrontDueAud = Number(
    (plan.bondAud + plan.priceAud + setupFeesAud).toFixed(2)
  );
  const recurringDueAud = Number((plan.priceAud + serviceFeeAud).toFixed(2));

  return {
    ...plan,
    pricing: {
      currency: 'AUD',
      bondAud: plan.bondAud,
      initialRentalAud: plan.priceAud,
      setupFeesAud,
      serviceFeeAud,
      upfrontDueAud,
      recurringDueAud,
      recurringLabel: plan.cadence,
      recurringInterval: plan.billingInterval,
      recurringIntervalCount: plan.billingIntervalCount,
    },
  };
}
