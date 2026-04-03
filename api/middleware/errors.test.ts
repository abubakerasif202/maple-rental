import { describe, expect, it, vi } from 'vitest';
import { z, ZodError } from 'zod';
import { apiNotFoundHandler, errorHandler } from './errors.js';

const makeReq = (path: string) => ({ path } as Parameters<typeof apiNotFoundHandler>[0]);

const makeRes = (headersSent = false) => {
  const res = {
    headersSent,
    locals: { requestId: 'test-req-id' },
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Parameters<typeof apiNotFoundHandler>[1];
};

const makeNext = () => vi.fn() as Parameters<typeof apiNotFoundHandler>[2];

describe('apiNotFoundHandler', () => {
  it('responds 404 for /api/ paths', () => {
    const req = makeReq('/api/unknown-route');
    const res = makeRes();
    const next = makeNext();

    apiNotFoundHandler(req, res, next);

    expect((res as any).status).toHaveBeenCalledWith(404);
    expect((res as any).json).toHaveBeenCalledWith({ error: 'API route not found' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() for non-API paths without sending a response', () => {
    const req = makeReq('/about');
    const res = makeRes();
    const next = makeNext();

    apiNotFoundHandler(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((res as any).status).not.toHaveBeenCalled();
    expect((res as any).json).not.toHaveBeenCalled();
  });

  it('calls next() for the root path', () => {
    const req = makeReq('/');
    const res = makeRes();
    const next = makeNext();

    apiNotFoundHandler(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('errorHandler', () => {
  it('calls next() with the error when response headers are already sent', () => {
    const error = new Error('Already sent');
    const req = makeReq('/api/something');
    const res = makeRes(true);
    const next = makeNext();

    errorHandler(error, req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect((res as any).status).not.toHaveBeenCalled();
  });

  it('calls next() for non-API paths without sending a response', () => {
    const error = new Error('Page error');
    const req = makeReq('/about');
    const res = makeRes();
    const next = makeNext();

    errorHandler(error, req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect((res as any).status).not.toHaveBeenCalled();
  });

  it('returns 400 with issue details for a ZodError', () => {
    const schema = z.object({ name: z.string().min(1) });
    let zodError: ZodError;
    try {
      schema.parse({});
    } catch (err) {
      zodError = err as ZodError;
    }

    const req = makeReq('/api/cars');
    const res = makeRes();
    const next = makeNext();

    errorHandler(zodError!, req, res, next);

    expect((res as any).status).toHaveBeenCalledWith(400);
    expect((res as any).json).toHaveBeenCalledWith({
      error: 'Validation failed',
      details: expect.arrayContaining([expect.objectContaining({ path: ['name'] })]),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 500 and generic message for an unrecognised Error', () => {
    const error = new Error('Something blew up');
    const req = makeReq('/api/cars');
    const res = makeRes();
    const next = makeNext();

    errorHandler(error, req, res, next);

    expect((res as any).status).toHaveBeenCalledWith(500);
    expect((res as any).json).toHaveBeenCalledWith({ error: 'Internal server error' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 500 and generic message for a non-Error thrown value', () => {
    const req = makeReq('/api/cars');
    const res = makeRes();
    const next = makeNext();

    errorHandler('a plain string error', req, res, next);

    expect((res as any).status).toHaveBeenCalledWith(500);
    expect((res as any).json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('uses a numeric status attached to the error object for 4xx errors', () => {
    const error = Object.assign(new Error('Gone'), { status: 410 });
    const req = makeReq('/api/resource');
    const res = makeRes();
    const next = makeNext();

    errorHandler(error, req, res, next);

    expect((res as any).status).toHaveBeenCalledWith(410);
    expect((res as any).json).toHaveBeenCalledWith({ error: 'Gone' });
  });

  it('uses a numeric status attached to the error and returns generic message for 5xx', () => {
    const error = Object.assign(new Error('Bad gateway detail'), { status: 502 });
    const req = makeReq('/api/resource');
    const res = makeRes();
    const next = makeNext();

    errorHandler(error, req, res, next);

    expect((res as any).status).toHaveBeenCalledWith(502);
    expect((res as any).json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('returns 404 and the error message for errors with status 404', () => {
    const error = Object.assign(new Error('Car not found'), { status: 404 });
    const req = makeReq('/api/cars/999');
    const res = makeRes();
    const next = makeNext();

    errorHandler(error, req, res, next);

    expect((res as any).status).toHaveBeenCalledWith(404);
    expect((res as any).json).toHaveBeenCalledWith({ error: 'Car not found' });
  });
});
