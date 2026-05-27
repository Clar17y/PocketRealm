import type { Server as SocketServer } from 'socket.io';
import { prisma } from '@pocketrealm/database';
import { redis } from '../redis';
import { logger } from '../logger';

export type DependencyStatus = 'ok' | 'error';

export const PROBE_TIMEOUT_MS = 2000;

let shuttingDown = false;

/**
 * Marks the process as shutting down so /health/ready flips to 503
 * immediately, allowing the load balancer to drain traffic before
 * dependencies actually close. Called from the SIGTERM handler.
 */
export function markShuttingDown(): void {
  shuttingDown = true;
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}

// Test-only: reset between suites.
export function resetShutdownState(): void {
  shuttingDown = false;
}

// Single-flight tracking of the raw probe promise per dependency. When a probe
// times out, the underlying prisma/redis call cannot actually be cancelled,
// so we keep the same in-flight promise around and race NEW timeouts against
// IT instead of spawning a fresh probe. Under periodic readiness polling
// during a dependency outage, exactly one probe stays alive instead of one
// per poll — orphaned probes no longer pile up on the connection pool.
const inflightProbes: Record<string, Promise<DependencyStatus> | undefined> = {};

function runRawProbe(label: string, probe: () => Promise<boolean>): Promise<DependencyStatus> {
  return (async () => {
    try {
      return (await probe()) ? 'ok' : 'error';
    } catch (err) {
      logger.warn({ err, label }, 'Health check: probe failed');
      return 'error';
    }
  })();
}

function withTimeout(label: string, rawProbe: Promise<DependencyStatus>): Promise<DependencyStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<DependencyStatus>((resolve) => {
    timer = setTimeout(() => {
      logger.warn({ label, timeoutMs: PROBE_TIMEOUT_MS }, 'Health check: probe timed out');
      resolve('error');
    }, PROBE_TIMEOUT_MS);
    timer.unref?.();
  });
  return Promise.race([rawProbe, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Runs a dependency probe with a timeout and error handling. The probe thunk
 * should return `true` on success, `false` on an explicit "unhealthy" reply.
 * Thrown errors and timeouts both resolve to 'error'.
 *
 * Prevents /health/ready from hanging indefinitely when a dependency
 * TCP-blackholes, and coalesces concurrent callers onto a single in-flight
 * probe so a hung DB/Redis call cannot leak one orphan per poll interval.
 */
function probeDependency(label: string, probe: () => Promise<boolean>): Promise<DependencyStatus> {
  let raw = inflightProbes[label];
  if (!raw) {
    raw = runRawProbe(label, probe);
    inflightProbes[label] = raw;
    raw.finally(() => {
      if (inflightProbes[label] === raw) inflightProbes[label] = undefined;
    });
  }
  return withTimeout(label, raw);
}

// Test-only: drop in-flight probe state between suites so mocks do not bleed.
export function resetProbeInflight(): void {
  for (const key of Object.keys(inflightProbes)) inflightProbes[key] = undefined;
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
