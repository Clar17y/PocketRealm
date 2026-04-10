import type { Server as SocketServer } from 'socket.io';
import { prisma } from '@pocketrealm/database';
import { redis } from '../redis';
import { logger } from '../logger';

export type DependencyStatus = 'ok' | 'error';

export const PROBE_TIMEOUT_MS = 2000;

/**
 * Wraps a probe promise with a timeout fallback. If the probe does not
 * resolve within PROBE_TIMEOUT_MS, the returned promise resolves with the
 * provided fallback value (typically 'error'). This prevents /health/ready
 * from hanging indefinitely when a dependency TCP-blackholes.
 *
 * The timer is .unref()'d so it doesn't keep the process (or vitest) alive,
 * and is cleared when the probe wins the race to avoid leaks.
 */
function withProbeTimeout<T>(label: string, probe: Promise<T>, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      logger.warn({ label, timeoutMs: PROBE_TIMEOUT_MS }, 'Health check: probe timed out');
      resolve(fallback);
    }, PROBE_TIMEOUT_MS);
    timer.unref?.();
  });
  return Promise.race([
    probe.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    timeout,
  ]);
}

export async function checkDatabase(): Promise<DependencyStatus> {
  return withProbeTimeout<DependencyStatus>(
    'database',
    (async (): Promise<DependencyStatus> => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return 'ok';
      } catch (err) {
        logger.warn({ err }, 'Health check: database probe failed');
        return 'error';
      }
    })(),
    'error',
  );
}

export async function checkRedis(): Promise<DependencyStatus> {
  return withProbeTimeout<DependencyStatus>(
    'redis',
    (async (): Promise<DependencyStatus> => {
      try {
        const reply = await redis.ping();
        return reply === 'PONG' ? 'ok' : 'error';
      } catch (err) {
        logger.warn({ err }, 'Health check: redis probe failed');
        return 'error';
      }
    })(),
    'error',
  );
}

export function getSocketIoStats(io: SocketServer | null): { connected: number } {
  if (!io) return { connected: 0 };
  return { connected: io.sockets.sockets.size };
}
