export const SITE_NAME = 'Maple Rentals';
export const SITE_URL = 'https://www.maplerentals.com.au';
export const DEFAULT_SOCIAL_IMAGE_PATH = '/camry-deep-blue.webp';

export type JsonLd = Record<string, unknown> | Array<Record<string, unknown>>;

export const buildCanonicalUrl = (path = '/') => new URL(path, SITE_URL).toString();
