import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../redis';

export function makeRedisStore(name: string) {
  return new RedisStore({
    sendCommand: (command: string, ...args: string[]) =>
      redis.call(command, ...args) as Promise<number | string>,
    prefix: `rl:${name}:`,
  });
}

/**
 * Creates a Redis-backed rate limiter for a specific endpoint group.
 * Falls through if Redis is unavailable (passOnStoreError).
 */
export function createEndpointLimiter(
  name: string, windowMs: number, max: number, message?: string,
) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message ?? 'Too many requests, please try again later', code: 'RATE_LIMITED' },
    passOnStoreError: true,
    store: makeRedisStore(name),
  });
}
