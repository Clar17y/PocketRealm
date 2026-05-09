import { monitorEventLoopDelay, type IntervalHistogram } from 'perf_hooks';
import type { Server as SocketServer } from 'socket.io';
import { prisma, type Prisma } from '@pocketrealm/database';
import { logger } from '../logger';
import { collectMetrics, type Metrics } from './metricsLogger';

export interface DurationHistogramJson {
  upperBoundsMs: Array<number | null>;
  counts: number[];
}

export interface ApiLatencySampleInput {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}

interface ApiLatencySampleBucket {
  action: string;
  method: string;
  route: string;
  durationsMs: number[];
  successCount: number;
  clientErrorCount: number;
  serverErrorCount: number;
}

type ApiLatencySnapshotRow = Prisma.ApiLatencySnapshotCreateManyInput;

export interface FlushResult {
  flushedRows: number;
}

export const API_LATENCY_BUCKET_SIZE_SECONDS = 60;
export const API_LATENCY_RETENTION_DAYS = 30;
export const DURATION_HISTOGRAM_UPPER_BOUNDS_MS = [
  25,
  50,
  100,
  200,
  400,
  800,
  1600,
  3200,
  6400,
  12800,
  null,
];

const apiLatencySampleBuffer = new Map<string, ApiLatencySampleBucket>();
let lastRetentionCleanupAt = 0;
const UUID_SEGMENT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_SEGMENT_PATTERN = /^\d+$/;
const ID_LIKE_SEGMENT_PATTERN = /^(?=.*\d)[a-z0-9_-]{6,}$/i;

export function calculatePercentile(sortedDurations: number[], percentile: number): number {
  if (sortedDurations.length === 0) {
    return 0;
  }

  const rank = Math.ceil((percentile / 100) * sortedDurations.length);
  const index = Math.min(Math.max(rank - 1, 0), sortedDurations.length - 1);

  return Math.round(sortedDurations[index]);
}

export function buildDurationHistogram(durationsMs: number[]): DurationHistogramJson {
  const counts = DURATION_HISTOGRAM_UPPER_BOUNDS_MS.map(() => 0);

  for (const durationMs of durationsMs) {
    const roundedDurationMs = Math.max(0, Math.round(durationMs));
    const bucketIndex = DURATION_HISTOGRAM_UPPER_BOUNDS_MS.findIndex(
      (upperBoundMs) => upperBoundMs === null || roundedDurationMs <= upperBoundMs,
    );

    counts[bucketIndex] += 1;
  }

  return {
    upperBoundsMs: [...DURATION_HISTOGRAM_UPPER_BOUNDS_MS],
    counts,
  };
}

export function estimatePercentileFromHistogram(histogram: DurationHistogramJson, percentile: number): number {
  const totalCount = histogram.counts.reduce((total, count) => total + count, 0);

  if (totalCount === 0) {
    return 0;
  }

  const rank = Math.min(Math.max(Math.ceil((percentile / 100) * totalCount), 1), totalCount);
  let cumulativeCount = 0;
  let previousFiniteUpperBound = 0;

  for (let index = 0; index < histogram.counts.length; index += 1) {
    cumulativeCount += histogram.counts[index];

    const upperBoundMs = histogram.upperBoundsMs[index];
    if (upperBoundMs !== null) {
      previousFiniteUpperBound = upperBoundMs;
    }

    if (cumulativeCount >= rank) {
      return upperBoundMs ?? previousFiniteUpperBound;
    }
  }

  return previousFiniteUpperBound;
}

export function normalizeApiRoute(rawRoute: string): string {
  const path = rawRoute.split('?')[0] || '/';
  const segments = path.split('/').map((segment) => {
    if (isApiIdSegment(segment)) {
      return ':id';
    }

    return segment;
  });

  return segments.join('/');
}

export function classifyApiAction(method: string, route: string): string {
  const upperMethod = method.toUpperCase();

  if (upperMethod === 'POST' && route === '/api/v1/exploration/start') return 'exploration.start';
  if (route === '/api/v1/exploration/estimate') return 'exploration.estimate';
  if (upperMethod === 'POST' && route === '/api/v1/zones/travel') return 'zones.travel';
  if (route.startsWith('/api/v1/equipment/')) return 'equipment.change';
  if (route === '/api/v1/combat/start') return 'combat.start';
  if (isApiRouteFamily(route, '/api/v1/combat/sites')) return 'combat.site';
  if (route.startsWith('/api/v1/pvp/')) return 'pvp.action';
  if (route.startsWith('/api/v1/gathering/')) return 'gathering.action';
  if (route.startsWith('/api/v1/crafting/')) return 'crafting.action';
  if (isApiRouteFamily(route, '/api/v1/inventory')) return 'inventory.action';

  return `${upperMethod} ${route}`;
}

export function shouldRecordApiLatency(method: string, route: string): boolean {
  const upperMethod = method.toUpperCase();

  if (upperMethod === 'OPTIONS') {
    return false;
  }

  if (route === '/health' || route === '/health/live' || route === '/health/ready') {
    return false;
  }

  if (route.startsWith('/api/v1/admin/analytics/latency')) {
    return false;
  }

  return route.startsWith('/api/');
}

export function recordApiLatencySample(input: ApiLatencySampleInput): void {
  try {
    const method = input.method.toUpperCase();
    const route = normalizeApiRoute(input.route);

    if (!shouldRecordApiLatency(method, route)) {
      return;
    }

    const action = classifyApiAction(method, route);
    const key = getSampleBucketKey(action, method, route);
    const bucket = getOrCreateSampleBucket(key, action, method, route);

    bucket.durationsMs.push(Math.max(0, input.durationMs));

    if (input.statusCode >= 500) {
      bucket.serverErrorCount += 1;
    } else if (input.statusCode >= 400) {
      bucket.clientErrorCount += 1;
    } else {
      bucket.successCount += 1;
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to record API latency sample');
  }
}

export function hasApiLatencySamples(): boolean {
  return apiLatencySampleBuffer.size > 0;
}

export function resetApiLatencyBufferForTests(): void {
  apiLatencySampleBuffer.clear();
  lastRetentionCleanupAt = 0;
}

export async function flushApiLatencySnapshots(
  getIo: () => SocketServer | null,
  histogram: IntervalHistogram | null,
): Promise<FlushResult> {
  if (!hasApiLatencySamples()) {
    return { flushedRows: 0 };
  }

  const samples = takeBufferedSamples();
  const metrics = collectMetrics(getIo(), histogram);
  const rows = aggregateSamples(samples, metrics, getBucketStart());

  if (rows.length === 0) {
    return { flushedRows: 0 };
  }

  let flushedRows: number;

  try {
    const result = await prisma.apiLatencySnapshot.createMany({
      data: rows,
      skipDuplicates: true,
    });
    flushedRows = result.count;
  } catch (err) {
    requeueBufferedSamples(samples);
    logger.error({ err }, 'Failed to flush API latency snapshots');

    return { flushedRows: 0 };
  }

  try {
    await cleanupOldSnapshots();
  } catch (err) {
    logger.error({ err }, 'Failed to clean up old API latency snapshots');
  }

  return { flushedRows };
}

export function startApiLatencySnapshotWriter(
  getIo: () => SocketServer | null,
  intervalMs = API_LATENCY_BUCKET_SIZE_SECONDS * 1000,
): () => void {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();

  const timer = setInterval(() => {
    if (!hasApiLatencySamples()) {
      return;
    }

    void flushApiLatencySnapshots(getIo, histogram);
  }, intervalMs);

  return () => {
    clearInterval(timer);
    histogram.disable();
  };
}

function getOrCreateSampleBucket(key: string, action: string, method: string, route: string): ApiLatencySampleBucket {
  const existingBucket = apiLatencySampleBuffer.get(key);

  if (existingBucket) {
    return existingBucket;
  }

  const bucket: ApiLatencySampleBucket = {
    action,
    method,
    route,
    durationsMs: [],
    successCount: 0,
    clientErrorCount: 0,
    serverErrorCount: 0,
  };

  apiLatencySampleBuffer.set(key, bucket);

  return bucket;
}

function takeBufferedSamples(): ApiLatencySampleBucket[] {
  const samples = Array.from(apiLatencySampleBuffer.values(), cloneSampleBucket);
  apiLatencySampleBuffer.clear();

  return samples;
}

function requeueBufferedSamples(samples: ApiLatencySampleBucket[]): void {
  for (const sample of samples) {
    const key = getSampleBucketKey(sample.action, sample.method, sample.route);
    const bucket = getOrCreateSampleBucket(key, sample.action, sample.method, sample.route);

    bucket.durationsMs.push(...sample.durationsMs);
    bucket.successCount += sample.successCount;
    bucket.clientErrorCount += sample.clientErrorCount;
    bucket.serverErrorCount += sample.serverErrorCount;
  }
}

function cloneSampleBucket(sample: ApiLatencySampleBucket): ApiLatencySampleBucket {
  return {
    ...sample,
    durationsMs: [...sample.durationsMs],
  };
}

function aggregateSamples(
  samples: ApiLatencySampleBucket[],
  metrics: Metrics,
  bucketStart: Date,
): ApiLatencySnapshotRow[] {
  return samples
    .filter((sample) => sample.durationsMs.length > 0)
    .map((sample) => {
      const sortedDurations = [...sample.durationsMs].sort((a, b) => a - b);
      const requestCount = sortedDurations.length;
      const totalDurationMs = sortedDurations.reduce((total, durationMs) => total + durationMs, 0);

      return {
        bucketStart,
        bucketSizeSeconds: API_LATENCY_BUCKET_SIZE_SECONDS,
        action: sample.action,
        method: sample.method,
        route: sample.route,
        requestCount,
        successCount: sample.successCount,
        clientErrorCount: sample.clientErrorCount,
        serverErrorCount: sample.serverErrorCount,
        avgMs: Math.round((totalDurationMs / requestCount) * 100) / 100,
        minMs: Math.round(sortedDurations[0] ?? 0),
        maxMs: Math.round(sortedDurations[sortedDurations.length - 1] ?? 0),
        p50Ms: calculatePercentile(sortedDurations, 50),
        p75Ms: calculatePercentile(sortedDurations, 75),
        p90Ms: calculatePercentile(sortedDurations, 90),
        p95Ms: calculatePercentile(sortedDurations, 95),
        p99Ms: calculatePercentile(sortedDurations, 99),
        durationHistogram: buildDurationHistogram(sortedDurations) as unknown as Prisma.InputJsonValue,
        activeConnections: metrics.activeConnections,
        connectedPlayers: metrics.connectedPlayers,
        eventLoopLagMs: metrics.eventLoopLagMs,
        memoryUsageMb: metrics.memoryUsageMb,
      };
    });
}

async function cleanupOldSnapshots(now = Date.now()): Promise<void> {
  const cleanupIntervalMs = 24 * 60 * 60 * 1000;

  if (now - lastRetentionCleanupAt < cleanupIntervalMs) {
    return;
  }

  const retentionMs = API_LATENCY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  await prisma.apiLatencySnapshot.deleteMany({
    where: {
      bucketStart: {
        lt: new Date(now - retentionMs),
      },
    },
  });

  lastRetentionCleanupAt = now;
}

function getBucketStart(now = Date.now()): Date {
  const bucketSizeMs = API_LATENCY_BUCKET_SIZE_SECONDS * 1000;

  return new Date(Math.floor(now / bucketSizeMs) * bucketSizeMs);
}

function getSampleBucketKey(action: string, method: string, route: string): string {
  return `${action}|${method}|${route}`;
}

function isApiRouteFamily(route: string, baseRoute: string): boolean {
  return route === baseRoute || route.startsWith(`${baseRoute}/`);
}

function isApiIdSegment(segment: string): boolean {
  if (segment.length === 0 || segment === ':id') {
    return false;
  }

  return (
    UUID_SEGMENT_PATTERN.test(segment) ||
    NUMERIC_SEGMENT_PATTERN.test(segment) ||
    ID_LIKE_SEGMENT_PATTERN.test(segment)
  );
}
