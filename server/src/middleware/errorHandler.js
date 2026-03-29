import { HttpError } from '../lib/httpError.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler = (_request, response) => {
  response.status(404).json({ error: 'Route not found' });
};

export const errorHandler = (error, _request, response, _next) => {
  if (error instanceof HttpError) {
    response.status(error.status).json({
      error: error.message,
      details: error.details ?? null,
    });
    return;
  }

  logger.error('Unhandled server error', error);
  response.status(500).json({
    error: 'Internal server error',
  });
};
