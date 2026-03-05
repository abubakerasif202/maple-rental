export interface RentalPlan {
  id: string;
  name: string;
  description: string;
  priceAud: number;
  cadence: string;
  highlight?: string;
  popular?: boolean;
  features: string[];
}

export const rentalPlans: RentalPlan[] = [
  {
    id: 'weekly',
    name: 'Weekly Rental',
    description: 'Fastest path to getting on the road with a low-commitment weekly cadence.',
    priceAud: 450,
    cadence: 'per week',
    highlight: 'Best for trial runs',
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
