import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

vi.mock('../logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { logger } from '../logger';
import { AppError, errorHandler } from './errorHandler';

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

const mockNext: NextFunction = vi.fn();

function mockReq(overrides: Partial<Request> = {}): Request {
  return { requestId: 'req-123', ...overrides } as unknown as Request;
}

describe('AppError', () => {
  it('creates error with status code and message', () => {
    const err = new AppError(404, 'Not found', 'NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('AppError');
  });

  it('extends Error', () => {
    const err = new AppError(500, 'oops');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('errorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles AppError with correct status and body', () => {
    const res = mockRes();
    const err = new AppError(400, 'Bad request', 'BAD_REQUEST');

    errorHandler(err, mockReq(), res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        message: 'Bad request',
        code: 'BAD_REQUEST',
        requestId: 'req-123',
      },
    });
  });

  it('logs 4xx AppErrors at warn level', () => {
    const res = mockRes();
    const err = new AppError(400, 'Bad request', 'BAD_REQUEST');

    errorHandler(err, mockReq(), res, mockNext);

    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-123', statusCode: 400 }),
      expect.stringContaining('Bad request'),
    );
  });

  it('logs 5xx errors at error level', () => {
    const res = mockRes();
    const err = new Error('unexpected');

    errorHandler(err, mockReq(), res, mockNext);

    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-123', err }),
      expect.stringContaining('unexpected'),
    );
  });

  it('handles unknown errors as 500', () => {
    const res = mockRes();
    const err = new Error('unexpected');

    errorHandler(err, mockReq(), res, mockNext);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR',
        requestId: 'req-123',
      },
    });
  });

  it('handles AppError without code', () => {
    const res = mockRes();
    const err = new AppError(422, 'Validation failed');

    errorHandler(err, mockReq(), res, mockNext);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        message: 'Validation failed',
        code: undefined,
        requestId: 'req-123',
      },
    });
  });

  it('handles ZodError as 400', () => {
    const res = mockRes();
    const err = new ZodError([
      { code: 'invalid_type', expected: 'string', received: 'number', path: ['name'], message: 'Expected string' },
    ]);

    errorHandler(err, mockReq(), res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
