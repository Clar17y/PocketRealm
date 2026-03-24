import { redis } from '../redis';
import { AUTH_CONSTANTS, RATE_LIMIT_CONSTANTS } from '@pocketrealm/shared';

function lockoutKey(playerId: string): string {
  return `login:lockout:${playerId}`;
}

/** Record a failed login attempt. Sets TTL on first failure. */
export async function recordFailedLogin(playerId: string): Promise<void> {
  const key = lockoutKey(playerId);
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, AUTH_CONSTANTS.LOCKOUT_TTL_SECONDS);
  }
}

/** Check if a player is currently locked out. */
export async function isLockedOut(playerId: string): Promise<boolean> {
  const count = await redis.get(lockoutKey(playerId));
  return count !== null && parseInt(count, 10) >= AUTH_CONSTANTS.LOCKOUT_THRESHOLD;
}

/** Clear lockout after successful login. */
export async function clearLockout(playerId: string): Promise<void> {
  await redis.del(lockoutKey(playerId));
}

/** Per-email rate limiting for password reset (prevents email bombing). */
export async function checkEmailRateLimit(email: string): Promise<boolean> {
  const key = `password-reset:email:${email.toLowerCase()}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, RATE_LIMIT_CONSTANTS.EMAIL_RATE_LIMIT_WINDOW_SECONDS);
  return count <= RATE_LIMIT_CONSTANTS.EMAIL_RATE_LIMIT_MAX;
}
