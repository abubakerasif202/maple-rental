import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const TEST_MODE = process.env.VITEST === 'true';
const ASSET_PATH_REGEX =
  /\.(?:css|gif|ico|jpeg|jpg|js|map|png|svg|webp|woff2?)$/i;

const REDACTED_QUERY_VALUE = '[REDACTED]';
const REDACTED_QUERY_KEYS = new Set([
  'access_token',
  'admin_token',
  'application_id',
  'checkout_token',
  'email',
  'license_number',
  'phone',
  'refresh_token',
  'search',
  'session_id',
  'token',
]);
const SENSITIVE_PATH_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f-]{27,}|(?:cs|cus|evt|in|pi|sub)_[A-Za-z0-9_]+)$/i;

const isSensitivePathSegment = (segment: string) => {
  try {
    return SENSITIVE_PATH_SEGMENT.test(decodeURIComponent(segment));
  } catch {
    return SENSITIVE_PATH_SEGMENT.test(segment);
  }
};

const shouldSkipLogging = (req: Request) =>
  TEST_MODE ||
  req.path === '/api/live' ||
  req.path === '/api/health' ||
  req.path.startsWith('/assets/') ||
  req.path === '/favicon.ico' ||
  ASSET_PATH_REGEX.test(req.path);

const getRequestId = (req: Request) => {
  const headerValue = req.header('x-request-id');
  if (typeof headerValue === 'string' && headerValue.trim()) {
    return headerValue.trim().slice(0, 128);
  }

  return crypto.randomUUID();
};

const sanitizePath = (path: string) =>
  path
    .split('/')
    .map((segment) => (isSensitivePathSegment(segment) ? REDACTED_QUERY_VALUE : segment))
    .join('/');

export const sanitizeOriginalUrl = (originalUrl: string) => {
  const [path, queryString] = originalUrl.split('?', 2);
  const sanitizedPath = sanitizePath(path);

  if (!queryString) {
    return sanitizedPath;
  }

  const query = new URLSearchParams(queryString);
  for (const key of REDACTED_QUERY_KEYS) {
    if (query.has(key)) {
      query.set(key, REDACTED_QUERY_VALUE);
    }
  }

  const sanitizedQuery = query.toString();
  return sanitizedQuery ? `${sanitizedPath}?${sanitizedQuery}` : sanitizedPath;
};

export const requestContext = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestId = getRequestId(req);
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
};

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (shouldSkipLogging(req)) {
    next();
    return;
  }

  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    const requestId = String(res.locals.requestId || '-');
    const safeOriginalUrl = sanitizeOriginalUrl(req.originalUrl);

    console.info(
      `[${requestId}] ${req.method} ${safeOriginalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`
    );
  });

  next();
};
