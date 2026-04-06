import { monitorEventLoopDelay } from 'perf_hooks';
import type { Server as SocketServer } from 'socket.io';
import { logger } from '../logger';

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

export interface Metrics {
  activeConnections: number;
  activePlayers: number;
  memoryUsageMb: number;
  eventLoopLagMs: number;
}

export function collectMetrics(io: SocketServer | null): Metrics {
  let activeConnections = 0;
  let activePlayers = 0;

  if (io) {
    const sockets = io.sockets.sockets;
    activeConnections = sockets.size;
    const playerIds = new Set<string>();
    for (const [, socket] of sockets) {
      const pid = (socket as any).data?.playerId;
      if (pid) playerIds.add(pid);
    }
    activePlayers = playerIds.size;
  }

  const memoryUsageMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100;
  const eventLoopLagMs = Math.round(histogram.mean / 1e6 * 100) / 100;
  histogram.reset();

  return { activeConnections, activePlayers, memoryUsageMb, eventLoopLagMs };
}

const DEFAULT_INTERVAL_MS = 60_000;

export function startMetricsLogger(
  getIo: () => SocketServer | null,
  intervalMs = DEFAULT_INTERVAL_MS,
): () => void {
  const timer = setInterval(() => {
    const metrics = collectMetrics(getIo());
    logger.info(metrics, 'metrics');
  }, intervalMs);

  return () => clearInterval(timer);
}
