import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const setUserMock = vi.fn();
const setTagMock = vi.fn();
const setContextMock = vi.fn();

vi.mock('@sentry/node', () => ({
  getCurrentScope: () => ({
    setUser: setUserMock,
    setTag: setTagMock,
    setContext: setContextMock,
  }),
}));

import { sentryContext, attachSentryUser } from './sentryContext';

function makeReq(over: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/api/v1/test',
    route: { path: '/test' },
    requestId: 'req-123',
    player: undefined,
    ...over,
  } as unknown as Request;
}

describe('sentryContext middleware', () => {
  beforeEach(() => {
    setUserMock.mockReset();
    setTagMock.mockReset();
    setContextMock.mockReset();
  });

  it('sets requestId tag and route context on every request', () => {
    const req = makeReq();
    const next = vi.fn() as NextFunction;
    sentryContext(req, {} as Response, next);
    expect(setTagMock).toHaveBeenCalledWith('requestId', 'req-123');
    expect(setContextMock).toHaveBeenCalledWith('route', { method: 'GET', path: '/api/v1/test' });
    expect(next).toHaveBeenCalled();
  });

  it('does not touch Sentry user (handled by attachSentryUser)', () => {
    const req = makeReq({ player: { accountId: 'account-1', playerId: 'p-1', username: 'hero', seasonId: null, role: 'player' } });
    sentryContext(req, {} as Response, vi.fn());
    expect(setUserMock).not.toHaveBeenCalled();
  });

  it('does not throw when requestId is missing', () => {
    const req = makeReq({ requestId: undefined });
    const next = vi.fn();
    expect(() => sentryContext(req, {} as Response, next)).not.toThrow();
    expect(next).toHaveBeenCalled();
  });
});

describe('attachSentryUser', () => {
  beforeEach(() => {
    setUserMock.mockReset();
    setTagMock.mockReset();
    setContextMock.mockReset();
  });

  it('sets Sentry user when req.player is populated', () => {
    const req = makeReq({ player: { accountId: 'account-1', playerId: 'p-1', username: 'hero', seasonId: null, role: 'player' } });
    attachSentryUser(req);
    expect(setUserMock).toHaveBeenCalledWith({ id: 'p-1', username: 'hero' });
  });

  it('clears Sentry user when no player is present', () => {
    const req = makeReq();
    attachSentryUser(req);
    expect(setUserMock).toHaveBeenCalledWith(null);
  });

  it('does not throw with a partial request missing player', () => {
    const req = { method: 'GET', path: '/x' } as unknown as Request;
    expect(() => attachSentryUser(req)).not.toThrow();
    expect(setUserMock).toHaveBeenCalledWith(null);
  });
});
