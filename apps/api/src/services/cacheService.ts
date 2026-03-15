import { redis } from '../redis';

export async function cachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number,
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached !== null) return JSON.parse(cached) as T;
  } catch {
    // Redis unavailable — fall through to fetcher
  }

  const result = await fetcher();

  try {
    await redis.set(key, JSON.stringify(result), 'EX', ttlSeconds);
  } catch {
    // Best-effort cache write
  }

  return result;
}

export async function invalidateCache(...keys: string[]): Promise<void> {
  try {
    await redis.del(...keys);
  } catch {
    // Best-effort invalidation
  }
}
