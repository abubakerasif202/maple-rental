import crypto from 'node:crypto';
import type { OutgoingHttpHeader, OutgoingHttpHeaders } from 'node:http';
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
const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

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

const shouldSkipServerTiming = (req: Request) =>
  req.path.startsWith('/assets/') ||
  req.path === '/favicon.ico' ||
  ASSET_PATH_REGEX.test(req.path);

const getRequestId = (req: Request) => {
  const headerValue = req.header('x-request-id');
  if (typeof headerValue === 'string' && VALID_REQUEST_ID.test(headerValue.trim())) {
    return headerValue.trim();
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
  const startTime = process.hrtime.bigint();
  const skipLogging = shouldSkipLogging(req);
  let completed = false;
  let logged = false;

  if (!shouldSkipServerTiming(req)) {
    const originalWriteHead = res.writeHead;
    res.writeHead = (function (
      this: Response,
      statusCode: number,
      statusMessageOrHeaders?: string | OutgoingHttpHeaders | OutgoingHttpHeader[],
      headers?: OutgoingHttpHeaders | OutgoingHttpHeader[]
    ) {
      if (!res.hasHeader('Server-Timing')) {
        const durationMs =
          Number(process.hrtime.bigint() - startTime) / 1_000_000;
        res.setHeader('Server-Timing', `app;dur=${durationMs.toFixed(1)}`);
      }
      return Reflect.apply(originalWriteHead, this, [
        statusCode,
        statusMessageOrHeaders,
        headers,
      ]);
    }) as Response['writeHead'];
  }

  const logRequest = (aborted: boolean) => {
    if (skipLogging || logged) {
      return;
    }

    logged = true;
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    const contentLength = res.getHeader('content-length');

    console.info(JSON.stringify({
      event: 'http_request',
      requestId: String(res.locals.requestId || '-'),
      method: req.method,
      path: sanitizePath(req.path),
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
      contentLength:
        typeof contentLength === 'string' || typeof contentLength === 'number'
          ? Number(contentLength)
          : null,
      aborted,
    }));
  };

  res.on('finish', () => {
    completed = true;
    logRequest(false);
  });
  res.on('close', () => {
    if (!completed) {
      logRequest(true);
    }
  });

  next();
};
