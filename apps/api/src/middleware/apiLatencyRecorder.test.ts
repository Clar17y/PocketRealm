import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const {
  recordApiLatencySampleMock,
} = vi.hoisted(() => ({
  recordApiLatencySampleMock: vi.fn(),
}));

vi.mock('../services/apiLatencyMetricsService', () => ({
  recordApiLatencySample: recordApiLatencySampleMock,
  normalizeApiRoute: (route: string) => route.split('?')[0],
  shouldRecordApiLatency: (method: string, route: string) => (
    method !== 'OPTIONS'
    && route.startsWith('/api/')
    && !route.startsWith('/api/v1/admin/analytics/latency')
  ),
}));

import { apiLatencyRecorder } from './apiLatencyRecorder';

type ResponseEvent = 'finish' | 'close';
type ResponseListener = () => void;
type MockResponse = Response & {
  emitEvent: (event: ResponseEvent) => void;
};

function createMockReq(overrides: Partial<Pick<Request, 'method' | 'originalUrl' | 'path'>> = {}): Request {
  return {
    method: 'GET',
    originalUrl: '/api/v1/player?include=stats',
    path: '/api/v1/player',
    ...overrides,
  } as unknown as Request;
}

function createMockRes(statusCode = 200): MockResponse {
  const listeners: Partial<Record<ResponseEvent, ResponseListener[]>> = {};

  const response = {
    statusCode,
    on(event: ResponseEvent, listener: ResponseListener) {
      (listeners[event] ??= []).push(listener);
      return response;
    },
    emitEvent(event: ResponseEvent) {
      for (const listener of listeners[event] ?? []) {
        listener();
      }
    },
  };

  return response as unknown as MockResponse;
}

describe('apiLatencyRecorder', () => {
  beforeEach(() => {
    recordApiLatencySampleMock.mockClear();
  });

  it('records API request duration on finish with method, route, and status code', () => {
    const req = createMockReq({ method: 'POST' });
    const res = createMockRes(201);
    const next = vi.fn() as NextFunction;

    apiLatencyRecorder(req, res, next);
    res.emitEvent('finish');

    expect(next).toHaveBeenCalledOnce();
    expect(recordApiLatencySampleMock).toHaveBeenCalledOnce();
    expect(recordApiLatencySampleMock).toHaveBeenCalledWith({
      method: 'POST',
      route: '/api/v1/player',
      statusCode: 201,
      durationMs: expect.any(Number),
    });
  });

  it('does not record health requests', () => {
    const req = createMockReq({ originalUrl: '/health/ready', path: '/health/ready' });
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    apiLatencyRecorder(req, res, next);
    res.emitEvent('finish');

    expect(next).toHaveBeenCalledOnce();
    expect(recordApiLatencySampleMock).not.toHaveBeenCalled();
  });

  it('records only once when both finish and close fire', () => {
    const req = createMockReq();
    const res = createMockRes(500);
    const next = vi.fn() as NextFunction;

    apiLatencyRecorder(req, res, next);
    res.emitEvent('finish');
    res.emitEvent('close');

    expect(next).toHaveBeenCalledOnce();
    expect(recordApiLatencySampleMock).toHaveBeenCalledOnce();
    expect(recordApiLatencySampleMock).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      route: '/api/v1/player',
      statusCode: 500,
    }));
  });
});
