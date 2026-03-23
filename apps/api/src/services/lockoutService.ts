import { redis } from '../redis';

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_TTL_SECONDS = 900; // 15 minutes

function lockoutKey(playerId: string): string {
  return `login:lockout:${playerId}`;
}

/** Record a failed login attempt. Sets TTL on first failure. */
export async function recordFailedLogin(playerId: string): Promise<void> {
  const key = lockoutKey(playerId);
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, LOCKOUT_TTL_SECONDS);
  }
}

/** Check if a player is currently locked out. */
export async function isLockedOut(playerId: string): Promise<boolean> {
  const count = await redis.get(lockoutKey(playerId));
  return count !== null && parseInt(count, 10) >= LOCKOUT_THRESHOLD;
}

/** Clear lockout after successful login. */
export async function clearLockout(playerId: string): Promise<void> {
  await redis.del(lockoutKey(playerId));
}

/** Per-email rate limiting for password reset (prevents email bombing). */
export async function checkEmailRateLimit(email: string): Promise<boolean> {
  const key = `password-reset:email:${email.toLowerCase()}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 3600); // 1 hour TTL
  return count <= 3; // max 3 per hour per email
}
