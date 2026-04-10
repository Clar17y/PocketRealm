import type { Server as SocketServer } from 'socket.io';
import { prisma } from '@pocketrealm/database';
import { redis } from '../redis';
import { logger } from '../logger';

export type DependencyStatus = 'ok' | 'error';

export const PROBE_TIMEOUT_MS = 2000;

/**
 * Runs a dependency probe with a timeout and error handling. The probe thunk
 * should return `true` on success, `false` on an explicit "unhealthy" reply.
 * Thrown errors and timeouts both resolve to 'error'.
 *
 * Prevents /health/ready from hanging indefinitely when a dependency
 * TCP-blackholes. The timer is .unref()'d so it doesn't keep the process
 * (or vitest) alive, and is cleared when the probe wins the race.
 */
async function probeDependency(label: string, probe: () => Promise<boolean>): Promise<DependencyStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<DependencyStatus>((resolve) => {
    timer = setTimeout(() => {
      logger.warn({ label, timeoutMs: PROBE_TIMEOUT_MS }, 'Health check: probe timed out');
      resolve('error');
    }, PROBE_TIMEOUT_MS);
    timer.unref?.();
  });
  const probePromise: Promise<DependencyStatus> = (async () => {
    try {
      return (await probe()) ? 'ok' : 'error';
    } catch (err) {
      logger.warn({ err, label }, 'Health check: probe failed');
      return 'error';
    }
  })().finally(() => {
    if (timer) clearTimeout(timer);
  });
  return Promise.race([probePromise, timeoutPromise]);
}

export async function checkDatabase(): Promise<DependencyStatus> {
  return probeDependency('database', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  });
}

export async function checkRedis(): Promise<DependencyStatus> {
  return probeDependency('redis', async () => {
    const reply = await redis.ping();
    return reply === 'PONG';
  });
}

export function getSocketIoStats(io: SocketServer | null): { connected: number } {
  if (!io) return { connected: 0 };
  return { connected: io.sockets.sockets.size };
}
