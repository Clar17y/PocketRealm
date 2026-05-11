import { monitorEventLoopDelay, type IntervalHistogram } from 'perf_hooks';
import type { Server as SocketServer } from 'socket.io';
import { prisma, Prisma } from '@pocketrealm/database';
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

interface ApiLatencySnapshotRow {
  bucketStart: Date;
  bucketSizeSeconds: number;
  action: string;
  method: string;
  route: string;
  requestCount: number;
  successCount: number;
  clientErrorCount: number;
  serverErrorCount: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p75Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  durationHistogram: Prisma.InputJsonValue;
  activeConnections: number;
  connectedPlayers: number;
  eventLoopLagMs: number;
  memoryUsageMb: number;
}

type MergeableApiLatencySnapshotRow = Pick<
  ApiLatencySnapshotRow,
  | 'requestCount'
  | 'successCount'
  | 'clientErrorCount'
  | 'serverErrorCount'
  | 'avgMs'
  | 'minMs'
  | 'maxMs'
  | 'activeConnections'
  | 'connectedPlayers'
  | 'eventLoopLagMs'
  | 'memoryUsageMb'
> & {
  durationHistogram: unknown;
};

interface ApiLatencyClassification {
  action: string;
  route: string;
}

interface ApiLatencyRouteDefinition {
  action: string;
  methods: ReadonlySet<string>;
  routes: ReadonlySet<string>;
}

export interface FlushResult {
  flushedRows: number;
}

export const API_LATENCY_BUCKET_SIZE_SECONDS = 60;
export const API_LATENCY_RETENTION_DAYS = 30;
const API_LATENCY_MAX_ACTION_LENGTH = 64;
const API_LATENCY_MAX_ROUTE_LENGTH = 160;
const API_LATENCY_WRITE_MAX_ATTEMPTS = 3;
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

const GET_METHODS = new Set(['GET']);
const POST_METHODS = new Set(['POST']);
const DELETE_METHODS = new Set(['DELETE']);

// Snapshot labels must stay finite so request paths cannot leak or create unbounded DB keys.
const API_LATENCY_ROUTE_DEFINITIONS: ApiLatencyRouteDefinition[] = [
  {
    action: 'exploration.start',
    methods: POST_METHODS,
    routes: new Set(['/api/v1/exploration/start']),
  },
  {
    action: 'exploration.estimate',
    methods: GET_METHODS,
    routes: new Set(['/api/v1/exploration/estimate']),
  },
  {
    action: 'zones.travel',
    methods: POST_METHODS,
    routes: new Set(['/api/v1/zones/travel']),
  },
  {
    action: 'equipment.change',
    methods: POST_METHODS,
    routes: new Set([
      '/api/v1/equipment/equip',
      '/api/v1/equipment/init',
      '/api/v1/equipment/unequip',
    ]),
  },
  {
    action: 'combat.start',
    methods: POST_METHODS,
    routes: new Set(['/api/v1/combat/start']),
  },
  {
    action: 'combat.site',
    methods: GET_METHODS,
    routes: new Set(['/api/v1/combat/sites']),
  },
  {
    action: 'combat.site',
    methods: POST_METHODS,
    routes: new Set([
      '/api/v1/combat/sites/abandon',
      '/api/v1/combat/sites/:id/abandon',
      '/api/v1/combat/sites/:id/auto-resolve',
      '/api/v1/combat/sites/:id/round',
      '/api/v1/combat/sites/:id/start-room',
    ]),
  },
  {
    action: 'pvp.action',
    methods: GET_METHODS,
    routes: new Set([
      '/api/v1/pvp/history',
      '/api/v1/pvp/history/:id',
      '/api/v1/pvp/ladder',
      '/api/v1/pvp/notifications',
      '/api/v1/pvp/notifications/count',
      '/api/v1/pvp/notifications/scouts',
      '/api/v1/pvp/notifications/scouts/count',
      '/api/v1/pvp/rating',
    ]),
  },
  {
    action: 'pvp.action',
    methods: POST_METHODS,
    routes: new Set([
      '/api/v1/pvp/challenge',
      '/api/v1/pvp/notifications/read',
      '/api/v1/pvp/notifications/scouts/read',
      '/api/v1/pvp/scout',
    ]),
  },
  {
    action: 'gathering.action',
    methods: GET_METHODS,
    routes: new Set(['/api/v1/gathering/nodes']),
  },
  {
    action: 'gathering.action',
    methods: POST_METHODS,
    routes: new Set(['/api/v1/gathering/mine']),
  },
  {
    action: 'crafting.action',
    methods: GET_METHODS,
    routes: new Set(['/api/v1/crafting/recipes']),
  },
  {
    action: 'crafting.action',
    methods: POST_METHODS,
    routes: new Set([
      '/api/v1/crafting/craft',
      '/api/v1/crafting/forge/reroll',
      '/api/v1/crafting/forge/upgrade',
      '/api/v1/crafting/salvage',
      '/api/v1/crafting/salvage/batch',
    ]),
  },
  {
    action: 'inventory.action',
    methods: GET_METHODS,
    routes: new Set([
      '/api/v1/inventory',
      '/api/v1/inventory/loot/:id',
      '/api/v1/inventory/stash',
    ]),
  },
  {
    action: 'inventory.action',
    methods: DELETE_METHODS,
    routes: new Set(['/api/v1/inventory/:id']),
  },
  {
    action: 'inventory.action',
    methods: POST_METHODS,
    routes: new Set([
      '/api/v1/inventory/loot/claim',
      '/api/v1/inventory/repair',
      '/api/v1/inventory/repair-equipped',
      '/api/v1/inventory/sell',
      '/api/v1/inventory/sell/bulk',
      '/api/v1/inventory/stash/deposit',
      '/api/v1/inventory/stash/deposit/batch',
      '/api/v1/inventory/stash/withdraw',
      '/api/v1/inventory/stash/withdraw/batch',
      '/api/v1/inventory/use',
    ]),
  },
];

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

function getApiLatencyClassification(method: string, route: string): ApiLatencyClassification | null {
  const upperMethod = method.toUpperCase();
  const definition = API_LATENCY_ROUTE_DEFINITIONS.find(
    (routeDefinition) => (
      routeDefinition.methods.has(upperMethod) &&
      routeDefinition.routes.has(route)
    ),
  );

  return definition ? { action: definition.action, route } : null;
}

function getRecordableApiLatencyClassification(method: string, route: string): ApiLatencyClassification | null {
  const upperMethod = method.toUpperCase();

  if (upperMethod === 'OPTIONS') {
    return null;
  }

  if (route === '/health' || route === '/health/live' || route === '/health/ready') {
    return null;
  }

  if (route.startsWith('/api/v1/admin/analytics/latency')) {
    return null;
  }

  const classification = getApiLatencyClassification(upperMethod, route);

  if (
    !classification ||
    classification.action.length > API_LATENCY_MAX_ACTION_LENGTH ||
    classification.route.length > API_LATENCY_MAX_ROUTE_LENGTH
  ) {
    return null;
  }

  return classification;
}

export function classifyApiAction(method: string, route: string): string {
  const upperMethod = method.toUpperCase();
  const classification = getApiLatencyClassification(upperMethod, route);

  if (classification) {
    return classification.action;
  }

  return `${upperMethod} ${route}`;
}

export function shouldRecordApiLatency(method: string, route: string): boolean {
  return getRecordableApiLatencyClassification(method, normalizeApiRoute(route)) !== null;
}

export function recordApiLatencySample(input: ApiLatencySampleInput): void {
  try {
    const method = input.method.toUpperCase();
    const normalizedRoute = normalizeApiRoute(input.route);
    const classification = getRecordableApiLatencyClassification(method, normalizedRoute);

    if (!classification) {
      return;
    }

    const { action, route } = classification;
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
    flushedRows = await writeApiLatencySnapshotRows(rows);
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
): () => Promise<void> {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  let stopped = false;
  let activeFlush: Promise<FlushResult> | null = null;

  const runFlush = (): Promise<FlushResult> => {
    activeFlush = flushApiLatencySnapshots(getIo, histogram)
      .catch((err) => {
        logger.error({ err }, 'API latency snapshot flush failed');
        return { flushedRows: 0 };
      })
      .finally(() => {
        activeFlush = null;
      });

    return activeFlush;
  };

  const timer = setInterval(() => {
    if (activeFlush || !hasApiLatencySamples()) {
      return;
    }

    void runFlush();
  }, intervalMs);

  return async () => {
    if (stopped) {
      return;
    }

    stopped = true;
    clearInterval(timer);

    try {
      if (activeFlush) {
        await activeFlush;
      }

      if (hasApiLatencySamples()) {
        await runFlush();
      }
    } finally {
      histogram.disable();
    }
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
        avgMs: roundTo(totalDurationMs / requestCount, 2),
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

async function writeApiLatencySnapshotRows(rows: ApiLatencySnapshotRow[]): Promise<number> {
  for (const row of rows) {
    await writeApiLatencySnapshotRow(row);
  }

  return rows.length;
}

async function writeApiLatencySnapshotRow(row: ApiLatencySnapshotRow): Promise<void> {
  for (let attempt = 1; attempt <= API_LATENCY_WRITE_MAX_ATTEMPTS; attempt += 1) {
    try {
      await prisma.$transaction(async (tx) => {
        const existing = await tx.apiLatencySnapshot.findUnique({
          where: getApiLatencySnapshotWhereUnique(row),
        });

        if (!existing) {
          await tx.apiLatencySnapshot.create({ data: row });
          return;
        }

        await tx.apiLatencySnapshot.update({
          where: { id: existing.id },
          data: mergeApiLatencySnapshotRows(existing, row),
        });
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      return;
    } catch (err) {
      if (attempt === API_LATENCY_WRITE_MAX_ATTEMPTS || !isRetryablePrismaWriteError(err)) {
        throw err;
      }
    }
  }
}

function getApiLatencySnapshotWhereUnique(row: ApiLatencySnapshotRow): Prisma.ApiLatencySnapshotWhereUniqueInput {
  return {
    bucketStart_bucketSizeSeconds_action_method_route: {
      bucketStart: row.bucketStart,
      bucketSizeSeconds: row.bucketSizeSeconds,
      action: row.action,
      method: row.method,
      route: row.route,
    },
  };
}

function mergeApiLatencySnapshotRows(
  existing: MergeableApiLatencySnapshotRow,
  incoming: ApiLatencySnapshotRow,
): Prisma.ApiLatencySnapshotUpdateInput {
  const requestCount = existing.requestCount + incoming.requestCount;
  const mergedHistogram = mergeDurationHistograms(
    parseDurationHistogram(existing.durationHistogram) ?? buildDurationHistogram([]),
    parseDurationHistogram(incoming.durationHistogram) ?? buildDurationHistogram([]),
  );

  return {
    requestCount,
    successCount: existing.successCount + incoming.successCount,
    clientErrorCount: existing.clientErrorCount + incoming.clientErrorCount,
    serverErrorCount: existing.serverErrorCount + incoming.serverErrorCount,
    avgMs: weightedAverageLatency(existing, incoming, requestCount),
    minMs: Math.min(existing.minMs, incoming.minMs),
    maxMs: Math.max(existing.maxMs, incoming.maxMs),
    p50Ms: estimatePercentileFromHistogram(mergedHistogram, 50),
    p75Ms: estimatePercentileFromHistogram(mergedHistogram, 75),
    p90Ms: estimatePercentileFromHistogram(mergedHistogram, 90),
    p95Ms: estimatePercentileFromHistogram(mergedHistogram, 95),
    p99Ms: estimatePercentileFromHistogram(mergedHistogram, 99),
    durationHistogram: mergedHistogram as unknown as Prisma.InputJsonValue,
    activeConnections: Math.max(existing.activeConnections, incoming.activeConnections),
    connectedPlayers: Math.max(existing.connectedPlayers, incoming.connectedPlayers),
    eventLoopLagMs: Math.max(existing.eventLoopLagMs, incoming.eventLoopLagMs),
    memoryUsageMb: Math.max(existing.memoryUsageMb, incoming.memoryUsageMb),
  };
}

function weightedAverageLatency(
  existing: MergeableApiLatencySnapshotRow,
  incoming: ApiLatencySnapshotRow,
  requestCount: number,
): number {
  if (requestCount === 0) {
    return 0;
  }

  const totalLatencyMs = existing.avgMs * existing.requestCount + incoming.avgMs * incoming.requestCount;
  return roundTo(totalLatencyMs / requestCount, 2);
}

function mergeDurationHistograms(left: DurationHistogramJson, right: DurationHistogramJson): DurationHistogramJson {
  return {
    upperBoundsMs: [...DURATION_HISTOGRAM_UPPER_BOUNDS_MS],
    counts: left.counts.map((count, index) => count + (right.counts[index] ?? 0)),
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

  if (!hasCanonicalDurationHistogramUpperBounds(histogram.upperBoundsMs)) {
    return null;
  }

  if (
    histogram.counts.length !== DURATION_HISTOGRAM_UPPER_BOUNDS_MS.length ||
    !histogram.counts.every((count) => typeof count === 'number' && Number.isFinite(count) && count >= 0)
  ) {
    return null;
  }

  return {
    upperBoundsMs: [...DURATION_HISTOGRAM_UPPER_BOUNDS_MS],
    counts: [...histogram.counts],
  };
}

function hasCanonicalDurationHistogramUpperBounds(upperBoundsMs: unknown[]): boolean {
  return (
    upperBoundsMs.length === DURATION_HISTOGRAM_UPPER_BOUNDS_MS.length &&
    upperBoundsMs.every((upperBoundMs, index) => upperBoundMs === DURATION_HISTOGRAM_UPPER_BOUNDS_MS[index])
  );
}

function isRetryablePrismaWriteError(err: unknown): boolean {
  if (!err || typeof err !== 'object' || !('code' in err)) {
    return false;
  }

  const code = (err as { code: unknown }).code;
  return code === 'P2002' || code === 'P2034';
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

async function cleanupOldSnapshots(now = Date.now()): Promise<void> {
  const cleanupIntervalMs = 24 * 60 * 60 * 1000;

  if (now - lastRetentionCleanupAt < cleanupIntervalMs) {
    return;
  }

  const retentionMs = API_LATENCY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  lastRetentionCleanupAt = now;
  await prisma.apiLatencySnapshot.deleteMany({
    where: {
      bucketStart: {
        lt: new Date(now - retentionMs),
      },
    },
  });
}

function getBucketStart(now = Date.now()): Date {
  const bucketSizeMs = API_LATENCY_BUCKET_SIZE_SECONDS * 1000;

  return new Date(Math.floor(now / bucketSizeMs) * bucketSizeMs);
}

function getSampleBucketKey(action: string, method: string, route: string): string {
  return `${action}|${method}|${route}`;
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
