import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 100;
const MAX_DELAY_MS = 5_000;

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > MAX_RETRIES) {
      console.error(`[Redis] Failed to reconnect after ${MAX_RETRIES} attempts — exiting`);
      process.exit(1);
    }
    const delay = Math.min(BASE_DELAY_MS * 2 ** (times - 1), MAX_DELAY_MS);
    console.warn(`[Redis] Reconnecting in ${delay}ms (attempt ${times}/${MAX_RETRIES})`);
    return delay;
  },
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

redis.on('reconnecting', () => {
  console.warn('[Redis] Reconnecting...');
});
