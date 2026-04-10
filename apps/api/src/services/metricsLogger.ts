import { monitorEventLoopDelay, type IntervalHistogram } from 'perf_hooks';
import type { Server as SocketServer } from 'socket.io';
import { logger } from '../logger';

export interface Metrics {
  activeConnections: number;
  connectedPlayers: number;
  memoryUsageMb: number;
  eventLoopLagMs: number;
}

export function collectMetrics(io: SocketServer | null, histogram: IntervalHistogram | null): Metrics {
  let activeConnections = 0;
  let connectedPlayers = 0;

  if (io) {
    const sockets = io.sockets.sockets;
    activeConnections = sockets.size;
    const playerIds = new Set<string>();
    for (const [, socket] of sockets) {
      if (socket.data?.playerId) playerIds.add(socket.data.playerId);
    }
    connectedPlayers = playerIds.size;
  }

  const memoryUsageMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100;
  const eventLoopLagMs = histogram
    ? Math.round(histogram.mean / 1e6 * 100) / 100
    : 0;
  if (histogram) histogram.reset();

  return { activeConnections, connectedPlayers, memoryUsageMb, eventLoopLagMs };
}

const DEFAULT_INTERVAL_MS = 60_000;

export function startMetricsLogger(
  getIo: () => SocketServer | null,
  intervalMs = DEFAULT_INTERVAL_MS,
): () => void {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();

  const timer = setInterval(() => {
    const metrics = collectMetrics(getIo(), histogram);
    logger.info(metrics, 'Server metrics snapshot');
  }, intervalMs);

  return () => {
    clearInterval(timer);
    histogram.disable();
  };
}
