import crypto from 'node:crypto';

import { normalizeUuid } from '../shared/uuid.js';

export type CheckoutTokenPurpose = 'application' | 'vehicle';

type CheckoutTokenPayload = {
  applicationId: string | number;
  carId: number | null;
  expiresAt: number;
  nonce: string;
  purpose: CheckoutTokenPurpose;
  version: number;
};

export const normalizeCheckoutTokenPayload = (
  payload: CheckoutTokenPayload
): CheckoutTokenPayload => ({
  ...payload,
  carId: null,
});

const DEFAULT_TOKEN_TTL_HOURS = 24;

const getCheckoutLinkSecret = () => {
  const secret = (process.env.CHECKOUT_LINK_SECRET || '').trim();
  if (!secret) {
    throw new Error('CHECKOUT_LINK_SECRET is required to mint checkout tokens.');
  }
  return secret;
};

const signTokenValue = (value: string) =>
  crypto.createHmac('sha256', getCheckoutLinkSecret()).update(value).digest('base64url');

const toTokenPayload = (payload: CheckoutTokenPayload) =>
  Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

const fromTokenPayload = (payload: string): CheckoutTokenPayload => {
  const decoded = Buffer.from(payload, 'base64url').toString('utf8');
  return JSON.parse(decoded) as CheckoutTokenPayload;
};

export const createCheckoutToken = ({
  applicationId,
  expiresInHours = DEFAULT_TOKEN_TTL_HOURS,
  purpose,
  version = 0,
}: {
  applicationId: string | number;
  carId?: number | null;
  expiresInHours?: number;
  purpose: CheckoutTokenPurpose;
  version?: number;
}) => {
  const normalizedApplicationId =
    typeof applicationId === 'string' ? normalizeUuid(applicationId) : applicationId;
  const payload = toTokenPayload({
    applicationId: normalizedApplicationId,
    carId: null,
    expiresAt: Date.now() + expiresInHours * 60 * 60 * 1000,
    nonce: crypto.randomBytes(12).toString('hex'),
    purpose,
    version,
  });
  const signature = signTokenValue(payload);

  return {
    expiresAt: new Date(fromTokenPayload(payload).expiresAt).toISOString(),
    token: `${payload}.${signature}`,
  };
};

export const verifyCheckoutToken = ({
  applicationId,
  purpose,
  token,
  version,
}: {
  applicationId: string | number;
  carId?: number | null;
  purpose: CheckoutTokenPurpose;
  token: string;
  version?: number | null;
}) => {
  const normalizedApplicationId =
    typeof applicationId === 'string' ? normalizeUuid(applicationId) : applicationId;
  const [encodedPayload, providedSignature] = token.split('.');

  if (!encodedPayload || !providedSignature) {
    throw new Error('Invalid checkout token.');
  }

  const expectedSignature = signTokenValue(encodedPayload);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new Error('Invalid checkout token signature.');
  }

  const payload = fromTokenPayload(encodedPayload);

  if (payload.purpose !== purpose) {
    throw new Error('Checkout token purpose mismatch.');
  }

  if (payload.applicationId !== normalizedApplicationId) {
    throw new Error('Checkout token application mismatch.');
  }

  if (typeof version === 'number' && payload.version !== version) {
    throw new Error('Checkout token version mismatch.');
  }

  if (payload.expiresAt <= Date.now()) {
    throw new Error('Checkout token has expired.');
  }

  return normalizeCheckoutTokenPayload({
    ...payload,
    // Legacy signed links may still contain a historical vehicle id. Preserve
    // payment recovery while permanently removing that id from runtime state.
    carId: null,
  });
};
