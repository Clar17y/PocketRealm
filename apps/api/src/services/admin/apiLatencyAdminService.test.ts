import { beforeEach, describe, expect, it, vi } from 'vitest';
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
});
