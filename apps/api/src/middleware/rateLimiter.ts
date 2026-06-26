import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../redis';

function makeRedisStore(name: string) {
  return new RedisStore({
    sendCommand: (command: string, ...args: string[]) =>
      redis.call(command, ...args) as Promise<number | string>,
    prefix: `rl:${name}:`,
  });
}

interface EndpointLimiterOptions {
  message?: string;
  skip?: (req: Request) => boolean;
  passOnStoreError?: boolean;
}

/**
 * Creates a Redis-backed rate limiter for a specific endpoint group.
 * Falls through if Redis is unavailable unless passOnStoreError is disabled.
 */
export function createEndpointLimiter(
  name: string, windowMs: number, max: number,
  options?: EndpointLimiterOptions,
) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: options?.message ?? 'Too many requests, please try again later', code: 'RATE_LIMITED' },
    passOnStoreError: options?.passOnStoreError ?? true,
    store: makeRedisStore(name),
    ...(options?.skip && { skip: options.skip }),
  });
}

/**
 * Creates an in-process limiter for broad, low-risk request caps.
 * Use this for coarse global protection so normal reads do not spend Redis commands.
 */
export function createLocalEndpointLimiter(
  _name: string, windowMs: number, max: number,
  options?: EndpointLimiterOptions,
) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: options?.message ?? 'Too many requests, please try again later', code: 'RATE_LIMITED' },
    passOnStoreError: options?.passOnStoreError ?? true,
    ...(options?.skip && { skip: options.skip }),
  });
}
