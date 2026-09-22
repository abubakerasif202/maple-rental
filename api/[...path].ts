import type { Request, Response } from 'express';

import app from './index.js';

const apiPathPattern = /^\/api(?:\/|$)/;

export default (request: Request, response: Response) => {
  if (!apiPathPattern.test(request.url)) {
    request.url = `/api${request.url.startsWith('/') ? '' : '/'}${request.url}`;
  }

  return app(request, response);
};
