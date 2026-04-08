import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requestLogger } from './requestLogger';

// Mock the logger module
vi.mock('../logger', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { logger: mockLogger };
});

import { logger } from '../logger';

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/api/v1/player',
    originalUrl: '/api/v1/player',
    requestId: 'test-uuid-1234',
    player: undefined,
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    statusCode: 200,
    on(event: string, cb: () => void) {
      (listeners[event] ??= []).push(cb);
      return this;
    },
    _emit(event: string) {
      for (const cb of listeners[event] ?? []) cb();
    },
  } as unknown as Response & { _emit: (event: string) => void };
}

describe('requestLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next()', () => {
    const next = vi.fn();
    requestLogger(createMockReq(), createMockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('logs request on response finish with correct fields', () => {
    const req = createMockReq({ player: { playerId: 'p1', username: 'hero', role: 'user' } as any });
    const res = createMockRes();
    const next = vi.fn();

    requestLogger(req, res, next);
    (res as any)._emit('finish');

    expect(logger.debug).toHaveBeenCalledOnce();
    const [context, message] = (logger.debug as any).mock.calls[0];
    expect(context).toMatchObject({
      requestId: 'test-uuid-1234',
      method: 'GET',
      path: '/api/v1/player',
      status: 200,
      playerId: 'p1',
    });
    expect(context).toHaveProperty('duration');
    expect(typeof context.duration).toBe('number');
    expect(message).toBe('request');
  });

  it('skips /health requests', () => {
    const req = createMockReq({ path: '/health' });
    const res = createMockRes();
    const next = vi.fn();

    requestLogger(req, res, next);
    (res as any)._emit('finish');

    expect(next).toHaveBeenCalledOnce();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('skips /health/ready requests', () => {
    const req = createMockReq({ path: '/health/ready' });
    const res = createMockRes();
    const next = vi.fn();

    requestLogger(req, res, next);
    (res as any)._emit('finish');

    expect(next).toHaveBeenCalledOnce();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('logs 4xx as warn', () => {
    const req = createMockReq();
    const res = createMockRes();
    res.statusCode = 404;
    const next = vi.fn();

    requestLogger(req, res, next);
    (res as any)._emit('finish');

    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('logs 5xx as error', () => {
    const req = createMockReq();
    const res = createMockRes();
    res.statusCode = 500;
    const next = vi.fn();

    requestLogger(req, res, next);
    (res as any)._emit('finish');

    expect(logger.error).toHaveBeenCalledOnce();
  });
});
