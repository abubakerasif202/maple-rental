import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { unauthorized } from './httpError.js';

const base64Url = (value) =>
  Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

const fromBase64Url = (value) => {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padding = '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
};

const signPayload = (payload) =>
  crypto.createHmac('sha256', env.JWT_SECRET).update(payload).digest('base64url');

export const createSessionToken = ({ driverId, email, role, authUserId }) => {
  const payload = JSON.stringify({
    driverId,
    email,
    role,
    authUserId,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
  });

  const encodedPayload = base64Url(payload);
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
};

export const verifySessionToken = (token) => {
  if (!token) {
    throw unauthorized();
  }

  const [payload, signature] = token.split('.');
  if (!payload || !signature) {
    throw unauthorized('Malformed session token');
  }

  const expected = signPayload(payload);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw unauthorized('Invalid session token');
  }

  const parsed = JSON.parse(fromBase64Url(payload));
  if (parsed.exp <= Math.floor(Date.now() / 1000)) {
    throw unauthorized('Session token expired');
  }

  return parsed;
};
