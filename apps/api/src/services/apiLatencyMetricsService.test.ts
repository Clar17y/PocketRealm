import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server as SocketServer } from 'socket.io';

vi.mock('../logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { mockPrisma } from '../__test__/setup';
import { logger } from '../logger';
import {
  buildDurationHistogram,
  calculatePercentile,
  classifyApiAction,
  estimatePercentileFromHistogram,
  flushApiLatencySnapshots,
  hasApiLatencySamples,
  normalizeApiRoute,
  recordApiLatencySample,
  resetApiLatencyBufferForTests,
  shouldRecordApiLatency,
  startApiLatencySnapshotWriter,
} from './apiLatencyMetricsService';

function mockSocketServer(playerIds: string[]): SocketServer {
  const sockets = new Map(
    playerIds.map((playerId, index) => [`s${index}`, { data: { playerId } }]),
  );

  return {
    sockets: { sockets },
  } as unknown as SocketServer;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

function existingLatencySnapshot() {
  return {
    id: 'snapshot-1',
    bucketStart: new Date('2026-05-11T10:00:00.000Z'),
    bucketSizeSeconds: 60,
    action: 'exploration.start',
    method: 'POST',
    route: '/api/v1/exploration/start',
    requestCount: 2,
    successCount: 2,
    clientErrorCount: 0,
    serverErrorCount: 0,
    avgMs: 150,
    minMs: 100,
    maxMs: 200,
    p50Ms: 100,
    p75Ms: 200,
    p90Ms: 200,
    p95Ms: 200,
    p99Ms: 200,
    durationHistogram: buildDurationHistogram([100, 200]),
    activeConnections: 1,
    connectedPlayers: 1,
    eventLoopLagMs: 2,
    memoryUsageMb: 100,
    createdAt: new Date('2026-05-11T10:00:05.000Z'),
  };
}

describe('apiLatencyMetricsService', () => {
  describe('duration metrics', () => {
    it('calculates nearest-rank percentiles from sorted durations', () => {
      const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

      expect(calculatePercentile(durations, 50)).toBe(50);
      expect(calculatePercentile(durations, 75)).toBe(80);
      expect(calculatePercentile(durations, 90)).toBe(90);
      expect(calculatePercentile(durations, 95)).toBe(100);
      expect(calculatePercentile(durations, 99)).toBe(100);
    });

    it('builds duration histograms with a JSON-safe overflow bucket', () => {
      const histogram = buildDurationHistogram([10, 25, 26, 900, 20000]);

      expect(histogram.upperBoundsMs.at(-1)).toBeNull();
      expect(histogram.counts.reduce((total, count) => total + count, 0)).toBe(5);
    });

    it('estimates nearest-rank percentiles from histogram bucket upper bounds', () => {
      const histogram = buildDurationHistogram([40, 60, 70, 900, 2000, 20000]);

      expect(estimatePercentileFromHistogram(histogram, 50)).toBe(100);
      expect(estimatePercentileFromHistogram(histogram, 90)).toBe(12800);
      expect(estimatePercentileFromHistogram(histogram, 99)).toBe(12800);
    });
  });

  describe('route normalization and action classification', () => {
    it('normalizes route identifiers while preserving stable literal route segments', () => {
      expect(
        normalizeApiRoute('/api/v1/combat/sites/123e4567-e89b-12d3-a456-426614174000/round?debug=true'),
      ).toBe('/api/v1/combat/sites/:id/round');
      expect(normalizeApiRoute('/api/v1/inventory/abc123')).toBe('/api/v1/inventory/:id');
    });

    it('classifies stable API actions', () => {
      expect(classifyApiAction('POST', '/api/v1/exploration/start')).toBe('exploration.start');
      expect(classifyApiAction('POST', '/api/v1/equipment/equip')).toBe('equipment.change');
      expect(classifyApiAction('POST', '/api/v1/pvp/challenge')).toBe('pvp.action');
      expect(classifyApiAction('POST', '/api/v1/combat/sites/:id/round')).toBe('combat.site');
    });

    it('classifies current non-POST gameplay routes to stable action labels', () => {
      expect(classifyApiAction('GET', '/api/v1/inventory')).toBe('inventory.action');
      expect(classifyApiAction('DELETE', '/api/v1/inventory/:id')).toBe('inventory.action');
      expect(classifyApiAction('GET', '/api/v1/gathering/nodes')).toBe('gathering.action');
      expect(classifyApiAction('GET', '/api/v1/crafting/recipes')).toBe('crafting.action');
      expect(classifyApiAction('GET', '/api/v1/pvp/ladder')).toBe('pvp.action');
      expect(classifyApiAction('GET', '/api/v1/combat/sites')).toBe('combat.site');
      expect(classifyApiAction('GET', '/api/v1/exploration/estimate')).toBe('exploration.estimate');
    });
  });

  describe('sample buffer', () => {
    beforeEach(() => {
      resetApiLatencyBufferForTests();
      vi.clearAllMocks();
    });

    it('records matching API latency samples in memory without writing snapshots', () => {
      recordApiLatencySample({
        method: 'POST',
        route: '/api/v1/exploration/start',
        statusCode: 200,
        durationMs: 123.4,
      });

      expect(hasApiLatencySamples()).toBe(true);
      expect(mockPrisma.apiLatencySnapshot.create).not.toHaveBeenCalled();
    });

    it('skips health, latency analytics, non-API, and OPTIONS requests', () => {
      expect(shouldRecordApiLatency('GET', '/api/v1/inventory')).toBe(true);
      expect(shouldRecordApiLatency('GET', '/api/v1/inventory/abc123')).toBe(false);
      expect(shouldRecordApiLatency('DELETE', '/api/v1/inventory/abc123')).toBe(true);
      expect(shouldRecordApiLatency('GET', '/api/v1/not-real/sensitive-token')).toBe(false);
      expect(shouldRecordApiLatency('GET', '/health')).toBe(false);
      expect(shouldRecordApiLatency('GET', '/api/v1/admin/analytics/latency')).toBe(false);
      expect(shouldRecordApiLatency('GET', '/assets/logo.png')).toBe(false);
      expect(shouldRecordApiLatency('OPTIONS', '/api/v1/inventory')).toBe(false);
    });

    it('does not buffer unclassified API paths', () => {
      recordApiLatencySample({
        method: 'GET',
        route: '/api/v1/not-real/sensitive-token?debug=true',
        statusCode: 404,
        durationMs: 25,
      });

      expect(hasApiLatencySamples()).toBe(false);
      expect(mockPrisma.apiLatencySnapshot.create).not.toHaveBeenCalled();
    });
  });

  describe('snapshot flush writer', () => {
    beforeEach(() => {
      resetApiLatencyBufferForTests();
      vi.clearAllMocks();
      mockPrisma.apiLatencySnapshot.findUnique.mockResolvedValue(null);
      mockPrisma.apiLatencySnapshot.create.mockResolvedValue({ id: 'snapshot-1' });
      mockPrisma.apiLatencySnapshot.update.mockResolvedValue({ id: 'snapshot-1' });
      mockPrisma.apiLatencySnapshot.deleteMany.mockResolvedValue({ count: 0 });
    });

    it('returns before Prisma when there are no samples', async () => {
      const result = await flushApiLatencySnapshots(() => null, null);

      expect(result).toEqual({ flushedRows: 0 });
      expect(mockPrisma.apiLatencySnapshot.create).not.toHaveBeenCalled();
      expect(mockPrisma.apiLatencySnapshot.deleteMany).not.toHaveBeenCalled();
    });

    it('writes aggregate snapshot rows when samples exist', async () => {
      recordApiLatencySample({
        method: 'POST',
        route: '/api/v1/exploration/start',
        statusCode: 200,
        durationMs: 100,
      });
      recordApiLatencySample({
        method: 'POST',
        route: '/api/v1/exploration/start',
        statusCode: 200,
        durationMs: 300,
      });
      recordApiLatencySample({
        method: 'POST',
        route: '/api/v1/exploration/start',
        statusCode: 500,
        durationMs: 900,
      });

      const result = await flushApiLatencySnapshots(() => mockSocketServer(['p1']), null);

      expect(result).toEqual({ flushedRows: 1 });
      expect(mockPrisma.apiLatencySnapshot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'exploration.start',
          method: 'POST',
          route: '/api/v1/exploration/start',
          requestCount: 3,
          successCount: 2,
          serverErrorCount: 1,
          p50Ms: 300,
          p95Ms: 900,
          connectedPlayers: 1,
        }),
      });
    });

    it('writes normalized route templates for dynamic paths', async () => {
      recordApiLatencySample({
        method: 'DELETE',
        route: '/api/v1/inventory/abc123?debug=true',
        statusCode: 200,
        durationMs: 50,
      });

      await flushApiLatencySnapshots(() => null, null);

      expect(mockPrisma.apiLatencySnapshot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'inventory.action',
          method: 'DELETE',
          route: '/api/v1/inventory/:id',
        }),
      });
    });

    it('merges duplicate snapshot rows instead of skipping later samples', async () => {
      mockPrisma.apiLatencySnapshot.findUnique.mockResolvedValueOnce(existingLatencySnapshot());

      recordApiLatencySample({
        method: 'POST',
        route: '/api/v1/exploration/start',
        statusCode: 500,
        durationMs: 300,
      });

      const result = await flushApiLatencySnapshots(() => null, null);

      expect(result).toEqual({ flushedRows: 1 });
      expect(mockPrisma.apiLatencySnapshot.create).not.toHaveBeenCalled();
      expect(mockPrisma.apiLatencySnapshot.update).toHaveBeenCalledWith({
        where: { id: 'snapshot-1' },
        data: expect.objectContaining({
          requestCount: 3,
          successCount: 2,
          serverErrorCount: 1,
          avgMs: 200,
          minMs: 100,
          maxMs: 300,
          durationHistogram: expect.objectContaining({
            upperBoundsMs: expect.arrayContaining([25, 50, 100, null]),
            counts: expect.any(Array),
          }),
        }),
      });
    });

    it('retries and merges when a concurrent writer creates the row first', async () => {
      mockPrisma.apiLatencySnapshot.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingLatencySnapshot());
      mockPrisma.apiLatencySnapshot.create.mockRejectedValueOnce({ code: 'P2002' });

      recordApiLatencySample({
        method: 'POST',
        route: '/api/v1/exploration/start',
        statusCode: 500,
        durationMs: 300,
      });

      const result = await flushApiLatencySnapshots(() => null, null);

      expect(result).toEqual({ flushedRows: 1 });
      expect(mockPrisma.apiLatencySnapshot.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.apiLatencySnapshot.update).toHaveBeenCalledWith({
        where: { id: 'snapshot-1' },
        data: expect.objectContaining({
          requestCount: 3,
          serverErrorCount: 1,
        }),
      });
    });

    it('starts a timer that skips Prisma until samples exist', async () => {
      vi.useFakeTimers();
      const stop = startApiLatencySnapshotWriter(() => null, 1000);

      try {
        await vi.advanceTimersByTimeAsync(1000);
        expect(mockPrisma.apiLatencySnapshot.create).not.toHaveBeenCalled();

        recordApiLatencySample({
          method: 'POST',
          route: '/api/v1/equipment/equip',
          statusCode: 200,
          durationMs: 80,
        });
        await vi.advanceTimersByTimeAsync(1000);

        expect(mockPrisma.apiLatencySnapshot.create).toHaveBeenCalledTimes(1);
      } finally {
        await stop();
        vi.useRealTimers();
      }
    });

    it('flushes buffered samples when the writer is stopped', async () => {
      const stop = startApiLatencySnapshotWriter(() => null, 60_000);

      recordApiLatencySample({
        method: 'POST',
        route: '/api/v1/equipment/equip',
        statusCode: 200,
        durationMs: 80,
      });

      await stop();

      expect(mockPrisma.apiLatencySnapshot.create).toHaveBeenCalledTimes(1);
      expect(hasApiLatencySamples()).toBe(false);
    });

    it('waits for an active timer flush when the writer is stopped', async () => {
      vi.useFakeTimers();
      const deferred = createDeferred<{ id: string }>();
      mockPrisma.apiLatencySnapshot.create.mockReturnValueOnce(deferred.promise);
      const stop = startApiLatencySnapshotWriter(() => null, 1000);

      try {
        recordApiLatencySample({
          method: 'POST',
          route: '/api/v1/equipment/equip',
          statusCode: 200,
          durationMs: 80,
        });

        vi.advanceTimersByTime(1000);
        await Promise.resolve();
        await Promise.resolve();

        expect(mockPrisma.apiLatencySnapshot.create).toHaveBeenCalledTimes(1);

        let stopped = false;
        const stopPromise = stop().then(() => {
          stopped = true;
        });

        await Promise.resolve();
        expect(stopped).toBe(false);

        deferred.resolve({ id: 'snapshot-1' });
        await stopPromise;

        expect(stopped).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('logs and requeues samples when snapshot creation fails', async () => {
      mockPrisma.apiLatencySnapshot.create
        .mockRejectedValueOnce(new Error('temporary database failure'))
        .mockResolvedValueOnce({ id: 'snapshot-1' });

      recordApiLatencySample({
        method: 'POST',
        route: '/api/v1/equipment/equip',
        statusCode: 200,
        durationMs: 80,
      });

      const failedResult = await flushApiLatencySnapshots(() => null, null);

      expect(failedResult).toEqual({ flushedRows: 0 });
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Failed to flush API latency snapshots',
      );
      expect(hasApiLatencySamples()).toBe(true);

      const successfulResult = await flushApiLatencySnapshots(() => null, null);

      expect(successfulResult).toEqual({ flushedRows: 1 });
      expect(mockPrisma.apiLatencySnapshot.create).toHaveBeenCalledTimes(2);
    });

    it('does not requeue inserted samples when retention cleanup fails', async () => {
      mockPrisma.apiLatencySnapshot.deleteMany.mockRejectedValueOnce(new Error('retention cleanup failed'));

      recordApiLatencySample({
        method: 'POST',
        route: '/api/v1/equipment/equip',
        statusCode: 200,
        durationMs: 80,
      });

      const result = await flushApiLatencySnapshots(() => null, null);

      expect(result).toEqual({ flushedRows: 1 });
      expect(hasApiLatencySamples()).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Failed to clean up old API latency snapshots',
      );

      const noSamplesResult = await flushApiLatencySnapshots(() => null, null);

      expect(noSamplesResult).toEqual({ flushedRows: 0 });
      expect(mockPrisma.apiLatencySnapshot.create).toHaveBeenCalledTimes(1);
    });

    it('throttles retention cleanup after cleanup fails', async () => {
      mockPrisma.apiLatencySnapshot.deleteMany
        .mockRejectedValueOnce(new Error('retention cleanup failed'))
        .mockResolvedValueOnce({ count: 0 });

      recordApiLatencySample({
        method: 'POST',
        route: '/api/v1/equipment/equip',
        statusCode: 200,
        durationMs: 80,
      });

      await flushApiLatencySnapshots(() => null, null);

      recordApiLatencySample({
        method: 'POST',
        route: '/api/v1/exploration/start',
        statusCode: 200,
        durationMs: 120,
      });

      const result = await flushApiLatencySnapshots(() => null, null);

      expect(result).toEqual({ flushedRows: 1 });
      expect(mockPrisma.apiLatencySnapshot.deleteMany).toHaveBeenCalledTimes(1);
    });
  });
});
