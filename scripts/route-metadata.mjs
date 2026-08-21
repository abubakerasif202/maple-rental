export const SITE_URL = 'https://www.maplerentals.com.au';
export const SOCIAL_IMAGE_URL = `${SITE_URL}/hero-camry-social.webp`;

export const ROUTE_METADATA = {
  '/': {
    title: 'Premium Driver Car Rentals Sydney | Maple Rentals',
    description: 'Apply with Maple Rentals for a premium, admin-reviewed driver rental program in Sydney with secure Stripe payments and structured onboarding.',
  },
  '/apply': {
    title: 'Apply to Drive with Maple Rentals | Sydney Car Rental Applications',
    description: 'Apply to drive with Maple Rentals for a premium weekly rental and Uber-ready vehicle program in Sydney. Simple onboarding, fast approval, and reliable cars.',
  },
  '/pricing': {
    title: 'Car Rental Plans Sydney | Uber Rental Options | Maple Rentals',
    description: 'Compare Maple Rentals car rental plans for Uber drivers in Sydney, Merrylands, and Parramatta. Review billing cadence, inclusions, and the approval flow before you apply.',
  },
};

export const canonicalForRoute = (route) => new URL(route, SITE_URL).toString();
