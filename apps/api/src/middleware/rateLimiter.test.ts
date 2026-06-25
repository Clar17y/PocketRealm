import { describe, expect, it, vi, beforeEach } from 'vitest';

const rateLimitMock = vi.hoisted(() => vi.fn((options: unknown) => options));
const redisStoreMock = vi.hoisted(() => vi.fn(function RedisStore(this: { options: unknown }, options: unknown) {
  this.options = options;
}));
const redisCallMock = vi.hoisted(() => vi.fn());

vi.mock('express-rate-limit', () => ({
  default: rateLimitMock,
}));

vi.mock('rate-limit-redis', () => ({
  RedisStore: redisStoreMock,
}));

vi.mock('../redis', () => ({
  redis: { call: redisCallMock },
}));

import { createEndpointLimiter, createLocalEndpointLimiter } from './rateLimiter';

describe('rate limiter stores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps named endpoint limiters on the Redis store', () => {
    createEndpointLimiter('login', 60_000, 5);

    expect(redisStoreMock).toHaveBeenCalledTimes(1);
    expect(rateLimitMock).toHaveBeenCalledWith(expect.objectContaining({
      windowMs: 60_000,
      max: 5,
      store: expect.any(Object),
    }));
  });

  it('uses the default in-memory store for local endpoint limiters', () => {
    createLocalEndpointLimiter('global', 60_000, 120);

    expect(redisStoreMock).not.toHaveBeenCalled();
    expect(rateLimitMock).toHaveBeenCalledWith(expect.not.objectContaining({
      store: expect.anything(),
    }));
  });
});
