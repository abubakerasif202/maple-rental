import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

const isApiRequest = (req: Request) => req.path.startsWith('/api/');

const getErrorStatus = (error: unknown) => {
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
  ) {
    return Number((error as { status: number }).status);
  }

  return null;
};

export const apiNotFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!isApiRequest(req)) {
    next();
    return;
  }

  res.status(404).json({ error: 'API route not found' });
};

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (!isApiRequest(req)) {
    next(error);
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: error.issues });
    return;
  }

  const status = getErrorStatus(error) ?? 500;
  const requestId = String(res.locals.requestId || '-');
  const message =
    error instanceof Error ? error.message : 'Unknown server error';

  if (status >= 500) {
    console.error(`[${requestId}] API error:`, error);
  } else {
    console.warn(`[${requestId}] API request rejected: ${message}`);
  }

  res.status(status).json({
    error:
      status >= 500
        ? 'Internal server error'
        : message || 'Request failed',
    request_id: requestId !== '-' ? requestId : undefined,
  });
};
