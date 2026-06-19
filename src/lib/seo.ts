export const SITE_NAME = 'Gala Rentals';
export const SITE_URL = 'https://www.galarentals.com.au';
export const DEFAULT_SOCIAL_IMAGE_PATH = '/hero-camry.webp';

export type JsonLd = Record<string, unknown> | Array<Record<string, unknown>>;

export const buildCanonicalUrl = (path = '/') => new URL(path, SITE_URL).toString();
