import Redis from 'ioredis';
import { logger } from './logger';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 100;
const MAX_DELAY_MS = 5_000;

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > MAX_RETRIES) {
      logger.error({ attempts: MAX_RETRIES }, 'Redis failed to reconnect — giving up');
      return null;
    }
    const delay = Math.min(BASE_DELAY_MS * 2 ** (times - 1), MAX_DELAY_MS);
    logger.warn({ delay, attempt: times, maxRetries: MAX_RETRIES }, 'Redis reconnecting');
    return delay;
  },
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});
