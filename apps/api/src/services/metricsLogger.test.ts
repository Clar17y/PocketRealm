import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../logger', () => ({
  logger: { info: vi.fn() },
}));

import { logger } from '../logger';
import { collectMetrics, startMetricsLogger } from './metricsLogger';

describe('collectMetrics', () => {
  it('returns metrics object with required fields', () => {
    const mockIo = {
      sockets: { sockets: new Map([['s1', { data: { playerId: 'p1' } }], ['s2', { data: { playerId: 'p2' } }], ['s3', { data: { playerId: 'p1' } }]]) },
    } as any;

    const metrics = collectMetrics(mockIo, null);

    expect(metrics).toHaveProperty('activeConnections', 3);
    expect(metrics).toHaveProperty('connectedPlayers', 2); // p1 deduplicated
    expect(metrics).toHaveProperty('memoryUsageMb');
    expect(typeof metrics.memoryUsageMb).toBe('number');
    expect(metrics.eventLoopLagMs).toBe(0); // null histogram
  });

  it('handles null io gracefully', () => {
    const metrics = collectMetrics(null, null);

    expect(metrics.activeConnections).toBe(0);
    expect(metrics.connectedPlayers).toBe(0);
  });
});

describe('startMetricsLogger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('logs metrics on the configured interval', () => {
    const mockIo = {
      sockets: { sockets: new Map() },
    } as any;

    const stop = startMetricsLogger(() => mockIo, 1000);

    expect(logger.info).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(logger.info).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ activeConnections: 0, connectedPlayers: 0 }),
      'Server metrics snapshot',
    );

    vi.advanceTimersByTime(1000);
    expect(logger.info).toHaveBeenCalledTimes(2);

    stop();
  });
});
