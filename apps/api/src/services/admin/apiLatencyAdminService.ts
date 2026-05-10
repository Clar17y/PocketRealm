import { prisma } from '@pocketrealm/database';
import { logger } from '../../logger';
import {
  API_LATENCY_RETENTION_DAYS,
  DURATION_HISTOGRAM_UPPER_BOUNDS_MS,
  type DurationHistogramJson,
  estimatePercentileFromHistogram,
} from '../apiLatencyMetricsService';

export type ApiLatencyPeriod = '1h' | '6h' | '24h' | '7d' | '30d';

export interface LatencyReportQuery {
  period: ApiLatencyPeriod;
  action?: string;
}

export interface LatencyReport {
  period: ApiLatencyPeriod;
  bucketSizeSeconds: number;
  generatedAt: string;
  actions: LatencyActionSummary[];
  series: LatencySeriesRow[];
}

export interface LatencyActionSummary {
  action: string;
  requestCount: number;
  avgMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  errorRate: number;
}

export interface LatencySeriesRow {
  bucketStart: string;
  action: string;
  requestCount: number;
  avgMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  errorRate: number;
  connectedPlayers: number;
  activeConnections: number;
  eventLoopLagMs: number;
  memoryUsageMb: number;
}

interface ApiLatencySnapshotRow {
  bucketStart: Date;
  action: string;
  requestCount: number;
  clientErrorCount: number;
  serverErrorCount: number;
  avgMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  durationHistogram: unknown;
  activeConnections: number;
  connectedPlayers: number;
  eventLoopLagMs: number;
  memoryUsageMb: number;
}

interface SeriesBucketGroup {
  bucketStartMs: number;
  action: string;
  rows: ApiLatencySnapshotRow[];
}

const PERIOD_MS: Record<ApiLatencyPeriod, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const SERIES_BUCKET_SECONDS: Record<ApiLatencyPeriod, number> = {
  '1h': 60,
  '6h': 300,
  '24h': 900,
  '7d': 3600,
  '30d': 21600,
};

const RETENTION_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
let lastAdminRetentionCleanupAt = 0;

export async function getAdminApiLatencyReport(query: LatencyReportQuery): Promise<LatencyReport> {
  const rows = await prisma.apiLatencySnapshot.findMany({
    where: {
      bucketStart: { gte: sinceForPeriod(query.period) },
      ...(query.action ? { action: query.action } : {}),
    },
    select: {
      bucketStart: true,
      action: true,
      requestCount: true,
      clientErrorCount: true,
      serverErrorCount: true,
      avgMs: true,
      p50Ms: true,
      p90Ms: true,
      p95Ms: true,
      p99Ms: true,
      durationHistogram: true,
      activeConnections: true,
      connectedPlayers: true,
      eventLoopLagMs: true,
      memoryUsageMb: true,
    },
    orderBy: [{ bucketStart: 'asc' }, { action: 'asc' }],
  });

  await opportunisticCleanup();

  return {
    period: query.period,
    bucketSizeSeconds: SERIES_BUCKET_SECONDS[query.period],
    generatedAt: new Date().toISOString(),
    actions: buildActionSummaries(rows),
    series: buildSeriesRows(rows, SERIES_BUCKET_SECONDS[query.period]),
  };
}

export async function getAdminApiLatencyActions(period: ApiLatencyPeriod): Promise<string[]> {
  const rows = await prisma.apiLatencySnapshot.findMany({
    where: {
      bucketStart: { gte: sinceForPeriod(period) },
    },
    select: { action: true },
    distinct: ['action'],
    orderBy: { action: 'asc' },
  });

  await opportunisticCleanup();

  return [...new Set(rows.map((row) => row.action))].sort((a, b) => a.localeCompare(b));
}

function sinceForPeriod(period: ApiLatencyPeriod, now = Date.now()): Date {
  return new Date(now - PERIOD_MS[period]);
}

function buildActionSummaries(rows: ApiLatencySnapshotRow[]): LatencyActionSummary[] {
  const rowsByAction = new Map<string, ApiLatencySnapshotRow[]>();

  for (const row of rows) {
    const actionRows = rowsByAction.get(row.action) ?? [];
    actionRows.push(row);
    rowsByAction.set(row.action, actionRows);
  }

  return [...rowsByAction.entries()]
    .map(([action, actionRows]) => {
      const requestCount = sumBy(actionRows, (row) => row.requestCount);
      const clientErrorCount = sumBy(actionRows, (row) => row.clientErrorCount);
      const serverErrorCount = sumBy(actionRows, (row) => row.serverErrorCount);
      const weightedAvgMs = requestCount === 0
        ? 0
        : sumBy(actionRows, (row) => row.avgMs * row.requestCount) / requestCount;
      const histogram = mergeHistograms(actionRows);

      return {
        action,
        requestCount,
        avgMs: roundTo(weightedAvgMs, 2),
        p50Ms: estimatePercentileFromHistogram(histogram, 50),
        p90Ms: estimatePercentileFromHistogram(histogram, 90),
        p95Ms: estimatePercentileFromHistogram(histogram, 95),
        p99Ms: estimatePercentileFromHistogram(histogram, 99),
        errorRate: calculateErrorRate({ requestCount, clientErrorCount, serverErrorCount }),
      };
    })
    .sort((left, right) => right.p95Ms - left.p95Ms);
}

function buildSeriesRows(rows: ApiLatencySnapshotRow[], bucketSizeSeconds: number): LatencySeriesRow[] {
  const rowsByBucketAndAction = new Map<string, SeriesBucketGroup>();

  for (const row of rows) {
    const bucketStartMs = floorToBucketMs(row.bucketStart, bucketSizeSeconds);
    const key = `${bucketStartMs}|${row.action}`;
    const group = rowsByBucketAndAction.get(key) ?? {
      bucketStartMs,
      action: row.action,
      rows: [],
    };

    group.rows.push(row);
    rowsByBucketAndAction.set(key, group);
  }

  return [...rowsByBucketAndAction.values()]
    .map(({ bucketStartMs, action, rows: bucketRows }) => {
      const requestCount = sumBy(bucketRows, (row) => row.requestCount);
      const clientErrorCount = sumBy(bucketRows, (row) => row.clientErrorCount);
      const serverErrorCount = sumBy(bucketRows, (row) => row.serverErrorCount);
      const weightedAvgMs = requestCount === 0
        ? 0
        : sumBy(bucketRows, (row) => row.avgMs * row.requestCount) / requestCount;
      const histogram = mergeHistograms(bucketRows);

      return {
        bucketStart: new Date(bucketStartMs).toISOString(),
        action,
        requestCount,
        avgMs: roundTo(weightedAvgMs, 2),
        p50Ms: estimatePercentileFromHistogram(histogram, 50),
        p90Ms: estimatePercentileFromHistogram(histogram, 90),
        p95Ms: estimatePercentileFromHistogram(histogram, 95),
        p99Ms: estimatePercentileFromHistogram(histogram, 99),
        errorRate: calculateErrorRate({ requestCount, clientErrorCount, serverErrorCount }),
        connectedPlayers: averageMetric(bucketRows, (row) => row.connectedPlayers),
        activeConnections: averageMetric(bucketRows, (row) => row.activeConnections),
        eventLoopLagMs: averageMetric(bucketRows, (row) => row.eventLoopLagMs),
        memoryUsageMb: averageMetric(bucketRows, (row) => row.memoryUsageMb),
      };
    })
    .sort((left, right) => (
      left.bucketStart.localeCompare(right.bucketStart) || left.action.localeCompare(right.action)
    ));
}

function mergeHistograms(rows: ApiLatencySnapshotRow[]): DurationHistogramJson {
  const histograms = rows
    .map((row) => parseDurationHistogram(row.durationHistogram))
    .filter((histogram): histogram is DurationHistogramJson => histogram !== null);
  const firstHistogram = histograms[0];

  if (!firstHistogram) {
    return { upperBoundsMs: [], counts: [] };
  }

  const counts = firstHistogram.counts.map(() => 0);

  for (const histogram of histograms) {
    histogram.counts.forEach((count, index) => {
      counts[index] = (counts[index] ?? 0) + count;
    });
  }

  return {
    upperBoundsMs: [...firstHistogram.upperBoundsMs],
    counts,
  };
}

function parseDurationHistogram(value: unknown): DurationHistogramJson | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const histogram = value as { upperBoundsMs?: unknown; counts?: unknown };
  if (!Array.isArray(histogram.upperBoundsMs) || !Array.isArray(histogram.counts)) {
    return null;
  }

  if (!hasCanonicalUpperBounds(histogram.upperBoundsMs) || histogram.counts.length !== DURATION_HISTOGRAM_UPPER_BOUNDS_MS.length) {
    return null;
  }

  if (!histogram.counts.every((count) => typeof count === 'number' && Number.isFinite(count) && count >= 0)) {
    return null;
  }

  return {
    upperBoundsMs: [...DURATION_HISTOGRAM_UPPER_BOUNDS_MS],
    counts: [...histogram.counts],
  };
}

function calculateErrorRate(row: {
  requestCount: number;
  clientErrorCount: number;
  serverErrorCount: number;
}): number {
  if (row.requestCount === 0) {
    return 0;
  }

  return roundTo((row.clientErrorCount + row.serverErrorCount) / row.requestCount, 4);
}

function sumBy(rows: ApiLatencySnapshotRow[], selector: (row: ApiLatencySnapshotRow) => number): number {
  return rows.reduce((total, row) => total + selector(row), 0);
}

function averageMetric(rows: ApiLatencySnapshotRow[], selector: (row: ApiLatencySnapshotRow) => number): number {
  if (rows.length === 0) {
    return 0;
  }

  return roundTo(sumBy(rows, selector) / rows.length, 2);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function floorToBucketMs(date: Date, bucketSizeSeconds: number): number {
  const bucketSizeMs = bucketSizeSeconds * 1000;
  return Math.floor(date.getTime() / bucketSizeMs) * bucketSizeMs;
}

function hasCanonicalUpperBounds(upperBoundsMs: unknown[]): boolean {
  return (
    upperBoundsMs.length === DURATION_HISTOGRAM_UPPER_BOUNDS_MS.length &&
    upperBoundsMs.every((upperBound, index) => upperBound === DURATION_HISTOGRAM_UPPER_BOUNDS_MS[index])
  );
}

async function opportunisticCleanup(now = Date.now()): Promise<void> {
  if (now - lastAdminRetentionCleanupAt < RETENTION_CLEANUP_INTERVAL_MS) {
    return;
  }

  lastAdminRetentionCleanupAt = now;

  try {
    await prisma.apiLatencySnapshot.deleteMany({
      where: {
        bucketStart: {
          lt: new Date(now - API_LATENCY_RETENTION_DAYS * 24 * 60 * 60 * 1000),
        },
      },
    });
  } catch (err) {
    logger.warn({ err }, 'Failed to clean up old API latency snapshots from admin API');
  }
}
