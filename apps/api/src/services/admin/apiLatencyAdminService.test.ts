import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../../__test__/setup';
import { getAdminApiLatencyActions, getAdminApiLatencyReport } from './apiLatencyAdminService';
import type { LatencyReport, LatencyReportQuery } from './diagnosticsAdminService';

const histogram = {
  upperBoundsMs: [25, 50, 100, 200, 400, 800, 1600, 3200, 6400, 12800, null],
  counts: [0, 0, 2, 1, 0, 1, 0, 0, 0, 0, 0],
};

describe('apiLatencyAdminService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.apiLatencySnapshot.findMany.mockResolvedValue([]);
    mockPrisma.apiLatencySnapshot.deleteMany.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns action summaries and series rows from snapshots', async () => {
    mockPrisma.apiLatencySnapshot.findMany.mockResolvedValue([
      {
        bucketStart: new Date('2026-05-09T10:00:00.000Z'),
        bucketSizeSeconds: 60,
        action: 'exploration.start',
        method: 'POST',
        route: '/api/v1/exploration/start',
        requestCount: 4,
        successCount: 3,
        clientErrorCount: 0,
        serverErrorCount: 1,
        avgMs: 175,
        minMs: 80,
        maxMs: 900,
        p50Ms: 100,
        p75Ms: 200,
        p90Ms: 800,
        p95Ms: 800,
        p99Ms: 800,
        durationHistogram: histogram,
        activeConnections: 2,
        connectedPlayers: 1,
        eventLoopLagMs: 4.2,
        memoryUsageMb: 120.5,
      },
    ]);

    const query = { period: '1h' } satisfies LatencyReportQuery;
    const report: LatencyReport = await getAdminApiLatencyReport(query);

    expect(report.period).toBe('1h');
    expect(report.actions[0]).toMatchObject({
      action: 'exploration.start',
      requestCount: 4,
      errorRate: 0.25,
    });
    expect(report.series[0]).toMatchObject({
      action: 'exploration.start',
      connectedPlayers: 1,
    });
  });

  it('filters by action when requested', async () => {
    await getAdminApiLatencyReport({ period: '24h', action: 'pvp.action' });

    expect(mockPrisma.apiLatencySnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ action: 'pvp.action' }),
    }));
  });

  it('returns distinct action names', async () => {
    mockPrisma.apiLatencySnapshot.findMany.mockResolvedValue([
      { action: 'pvp.action' },
      { action: 'exploration.start' },
      { action: 'pvp.action' },
    ]);

    await expect(getAdminApiLatencyActions('24h')).resolves.toEqual(['exploration.start', 'pvp.action']);
  });

  it('aggregates 6h series rows into 5-minute display buckets', async () => {
    mockPrisma.apiLatencySnapshot.findMany.mockResolvedValue([
      {
        bucketStart: new Date('2026-05-09T10:01:00.000Z'),
        action: 'exploration.start',
        requestCount: 2,
        clientErrorCount: 1,
        serverErrorCount: 0,
        avgMs: 100,
        p50Ms: 100,
        p90Ms: 100,
        p95Ms: 100,
        p99Ms: 100,
        durationHistogram: {
          upperBoundsMs: [25, 50, 100, 200, 400, 800, 1600, 3200, 6400, 12800, null],
          counts: [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0],
        },
        activeConnections: 4,
        connectedPlayers: 10,
        eventLoopLagMs: 3.22,
        memoryUsageMb: 120.111,
      },
      {
        bucketStart: new Date('2026-05-09T10:04:00.000Z'),
        action: 'exploration.start',
        requestCount: 6,
        clientErrorCount: 0,
        serverErrorCount: 2,
        avgMs: 200,
        p50Ms: 200,
        p90Ms: 400,
        p95Ms: 400,
        p99Ms: 400,
        durationHistogram: {
          upperBoundsMs: [25, 50, 100, 200, 400, 800, 1600, 3200, 6400, 12800, null],
          counts: [0, 0, 0, 3, 3, 0, 0, 0, 0, 0, 0],
        },
        activeConnections: 8,
        connectedPlayers: 14,
        eventLoopLagMs: 5.44,
        memoryUsageMb: 124.555,
      },
    ]);

    const report = await getAdminApiLatencyReport({ period: '6h' });

    expect(report.bucketSizeSeconds).toBe(300);
    expect(report.series).toEqual([
      expect.objectContaining({
        bucketStart: '2026-05-09T10:00:00.000Z',
        action: 'exploration.start',
        requestCount: 8,
        avgMs: 175,
        errorRate: 0.375,
        p50Ms: 200,
        p90Ms: 400,
        p95Ms: 400,
        p99Ms: 400,
        activeConnections: 6,
        connectedPlayers: 12,
        eventLoopLagMs: 4.33,
        memoryUsageMb: 122.33,
      }),
    ]);
  });

  it('keeps 1h reports on 60-second series buckets', async () => {
    mockPrisma.apiLatencySnapshot.findMany.mockResolvedValue([
      {
        bucketStart: new Date('2026-05-09T10:01:00.000Z'),
        action: 'exploration.start',
        requestCount: 1,
        clientErrorCount: 0,
        serverErrorCount: 0,
        avgMs: 100,
        p50Ms: 100,
        p90Ms: 100,
        p95Ms: 100,
        p99Ms: 100,
        durationHistogram: histogram,
        activeConnections: 2,
        connectedPlayers: 1,
        eventLoopLagMs: 4.2,
        memoryUsageMb: 120.5,
      },
    ]);

    const report = await getAdminApiLatencyReport({ period: '1h' });

    expect(report.bucketSizeSeconds).toBe(60);
    expect(report.series).toHaveLength(1);
    expect(report.series[0]?.bucketStart).toBe('2026-05-09T10:01:00.000Z');
  });

  it('throttles admin retention cleanup even when delete fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2050-01-01T00:00:00.000Z'));
    mockPrisma.apiLatencySnapshot.deleteMany.mockRejectedValue(new Error('delete failed'));

    await getAdminApiLatencyReport({ period: '1h' });
    await getAdminApiLatencyReport({ period: '1h' });

    expect(mockPrisma.apiLatencySnapshot.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed histograms when estimating percentiles', async () => {
    mockPrisma.apiLatencySnapshot.findMany.mockResolvedValue([
      {
        bucketStart: new Date('2026-05-09T10:00:00.000Z'),
        action: 'exploration.start',
        requestCount: 2,
        clientErrorCount: 0,
        serverErrorCount: 0,
        avgMs: 100,
        p50Ms: 100,
        p90Ms: 100,
        p95Ms: 100,
        p99Ms: 100,
        durationHistogram: {
          upperBoundsMs: [25, 50, 100],
          counts: [0, Number.NaN, 2],
        },
        activeConnections: 2,
        connectedPlayers: 1,
        eventLoopLagMs: 4.2,
        memoryUsageMb: 120.5,
      },
      {
        bucketStart: new Date('2026-05-09T10:01:00.000Z'),
        action: 'exploration.start',
        requestCount: 1,
        clientErrorCount: 0,
        serverErrorCount: 0,
        avgMs: 400,
        p50Ms: 400,
        p90Ms: 400,
        p95Ms: 400,
        p99Ms: 400,
        durationHistogram: {
          upperBoundsMs: [25, 50, 100, 200, 400, 800, 1600, 3200, 6400, 12800, null],
          counts: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
        },
        activeConnections: 4,
        connectedPlayers: 3,
        eventLoopLagMs: 6.2,
        memoryUsageMb: 122.5,
      },
    ]);

    const report = await getAdminApiLatencyReport({ period: '6h' });

    expect(report.series[0]).toMatchObject({
      p50Ms: 400,
      p90Ms: 400,
      p95Ms: 400,
      p99Ms: 400,
    });
    expect(report.actions[0]).toMatchObject({
      p50Ms: 400,
      p90Ms: 400,
      p95Ms: 400,
      p99Ms: 400,
    });
  });
});
