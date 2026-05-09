import { useEffect, useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { PixelCard } from '@/components/PixelCard';
import {
  adminGetLatencyActions,
  adminGetLatencyReport,
  type LatencyMetric,
  type LatencyPeriod,
  type LatencyReport,
} from '@/lib/api';

const PERIODS: LatencyPeriod[] = ['1h', '6h', '24h', '7d', '30d'];
const METRICS: Array<{ key: LatencyMetric; label: string }> = [
  { key: 'p95Ms', label: 'P95' },
  { key: 'p99Ms', label: 'P99' },
  { key: 'p50Ms', label: 'P50' },
  { key: 'avgMs', label: 'Avg' },
];

function formatMs(value: number): string {
  return `${Math.round(value).toLocaleString()} ms`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function buildPath(
  points: Array<{ x: number; y: number }>,
): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
}

type LatencySeriesPoint = LatencyReport['series'][number];
type PercentileLatencyMetric = Extract<LatencyMetric, 'p50Ms' | 'p95Ms' | 'p99Ms'>;

function weightedAverage(total: number, requestCount: number): number {
  return requestCount === 0 ? 0 : total / requestCount;
}

function isPercentileMetric(metric: LatencyMetric): metric is PercentileLatencyMetric {
  return metric === 'p50Ms' || metric === 'p95Ms' || metric === 'p99Ms';
}

function aggregateSeriesByBucket(series: LatencySeriesPoint[], metric: LatencyMetric): LatencySeriesPoint[] {
  const buckets = new Map<string, {
    point: LatencySeriesPoint;
    avgMsTotal: number;
    p50MsTotal: number;
    p90MsTotal: number;
    p95MsTotal: number;
    p99MsTotal: number;
    errorRateTotal: number;
  }>();

  for (const point of series) {
    const existing = buckets.get(point.bucketStart);
    if (!existing) {
      buckets.set(point.bucketStart, {
        point: { ...point, action: 'All actions' },
        avgMsTotal: point.avgMs * point.requestCount,
        p50MsTotal: point.p50Ms * point.requestCount,
        p90MsTotal: point.p90Ms * point.requestCount,
        p95MsTotal: point.p95Ms * point.requestCount,
        p99MsTotal: point.p99Ms * point.requestCount,
        errorRateTotal: point.errorRate * point.requestCount,
      });
      continue;
    }

    existing.point.requestCount += point.requestCount;
    existing.point.connectedPlayers = Math.max(existing.point.connectedPlayers, point.connectedPlayers);
    existing.point.activeConnections = Math.max(existing.point.activeConnections, point.activeConnections);
    existing.point.eventLoopLagMs = Math.max(existing.point.eventLoopLagMs, point.eventLoopLagMs);
    existing.point.memoryUsageMb = Math.max(existing.point.memoryUsageMb, point.memoryUsageMb);
    if (isPercentileMetric(metric)) {
      existing.point[metric] = Math.max(existing.point[metric], point[metric]);
    }
    existing.avgMsTotal += point.avgMs * point.requestCount;
    existing.p50MsTotal += point.p50Ms * point.requestCount;
    existing.p90MsTotal += point.p90Ms * point.requestCount;
    existing.p95MsTotal += point.p95Ms * point.requestCount;
    existing.p99MsTotal += point.p99Ms * point.requestCount;
    existing.errorRateTotal += point.errorRate * point.requestCount;
  }

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket.point,
      avgMs: weightedAverage(bucket.avgMsTotal, bucket.point.requestCount),
      p50Ms: metric === 'p50Ms' ? bucket.point.p50Ms : weightedAverage(bucket.p50MsTotal, bucket.point.requestCount),
      p90Ms: weightedAverage(bucket.p90MsTotal, bucket.point.requestCount),
      p95Ms: metric === 'p95Ms' ? bucket.point.p95Ms : weightedAverage(bucket.p95MsTotal, bucket.point.requestCount),
      p99Ms: metric === 'p99Ms' ? bucket.point.p99Ms : weightedAverage(bucket.p99MsTotal, bucket.point.requestCount),
      errorRate: weightedAverage(bucket.errorRateTotal, bucket.point.requestCount),
    }))
    .sort((left, right) => left.bucketStart.localeCompare(right.bucketStart));
}

function MiniLatencyChart({ report, metric, action }: { report: LatencyReport; metric: LatencyMetric; action?: string }) {
  const showsSlowestActionEnvelope = !action && isPercentileMetric(metric);
  const points = useMemo(
    () => (action ? report.series : aggregateSeriesByBucket(report.series, metric)).filter((point) => point.requestCount > 0),
    [action, metric, report.series],
  );

  if (points.length === 0) {
    return <div className="text-sm text-[var(--rpg-text-secondary)]">No graph data.</div>;
  }

  const width = 640;
  const height = 180;
  const padding = 24;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  const maxLatency = Math.max(...points.map((point) => point[metric]), 1);
  const maxPlayers = Math.max(...points.map((point) => point.connectedPlayers), 1);
  const xFor = (index: number) => padding + (points.length === 1 ? plotWidth / 2 : index * (plotWidth / (points.length - 1)));

  const latencyPoints = points.map((point, index) => ({
    x: xFor(index),
    y: height - padding - (point[metric] / maxLatency) * plotHeight,
  }));
  const playerPoints = points.map((point, index) => ({
    x: xFor(index),
    y: height - padding - (point.connectedPlayers / maxPlayers) * plotHeight,
  }));
  const chartLabel = action
    ? `API latency trend, ${action}`
    : `API latency trend, ${showsSlowestActionEnvelope ? 'slowest action per bucket' : 'all actions aggregated by bucket'}`;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--rpg-text-secondary)]">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[var(--rpg-gold)]" aria-hidden="true" />
          Latency
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[var(--rpg-blue-light)]" aria-hidden="true" />
          Connected players
        </span>
        {!action && <span>{showsSlowestActionEnvelope ? 'Slowest action per bucket' : 'All actions aggregated by bucket'}</span>}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" role="img" aria-label={chartLabel}>
        <rect x="0" y="0" width={width} height={height} rx="6" className="fill-[var(--rpg-surface-dark)]" />
        <path d={buildPath(playerPoints)} fill="none" stroke="var(--rpg-blue-light)" strokeWidth="2" opacity="0.7" />
        <path d={buildPath(latencyPoints)} fill="none" stroke="var(--rpg-gold)" strokeWidth="3" />
        {latencyPoints.map((point, index) => (
          <circle key={`${points[index].bucketStart}-${points[index].action}`} cx={point.x} cy={point.y} r="3" fill="var(--rpg-gold)" />
        ))}
      </svg>
    </div>
  );
}

export function LatencyAnalyticsSection() {
  const [period, setPeriod] = useState<LatencyPeriod>('1h');
  const [metric, setMetric] = useState<LatencyMetric>('p95Ms');
  const [action, setAction] = useState<string | undefined>(undefined);
  const [actions, setActions] = useState<string[]>([]);
  const [report, setReport] = useState<LatencyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;

    adminGetLatencyActions(period).then((res) => {
      if (stale) return;
      if (res.error) {
        setError(res.error.message);
        return;
      }
      if (res.data) {
        setActions(res.data.actions);
        setAction((current) => (current && !res.data.actions.includes(current) ? undefined : current));
      }
    });

    return () => {
      stale = true;
    };
  }, [period]);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    setError(null);
    setReport(null);

    adminGetLatencyReport(period, action).then((res) => {
      if (stale) return;
      if (res.error) {
        setError(res.error.message);
        setReport(null);
      } else if (res.data) {
        setReport(res.data);
      }
      setLoading(false);
    });

    return () => {
      stale = true;
    };
  }, [period, action]);

  const sortedActions = useMemo(
    () => [...(report?.actions ?? [])].sort((left, right) => right.p95Ms - left.p95Ms),
    [report],
  );

  return (
    <PixelCard>
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-[var(--rpg-gold)]" />
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)]">API Latency</h3>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {PERIODS.map((entry) => (
          <button
            key={entry}
            onClick={() => {
              setAction(undefined);
              setPeriod(entry);
            }}
            aria-pressed={period === entry}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
              period === entry
                ? 'border border-[var(--rpg-gold)]/40 bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)]'
                : 'text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
            }`}
          >
            {entry}
          </button>
        ))}
        <select
          aria-label="Latency action"
          value={action ?? ''}
          onChange={(event) => setAction(event.target.value || undefined)}
          className="min-w-40 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-2 py-1.5 text-sm text-[var(--rpg-text-primary)]"
        >
          <option value="">All actions</option>
          {actions.map((entry) => (
            <option key={entry} value={entry}>{entry}</option>
          ))}
        </select>
        <div className="flex gap-1" role="group" aria-label="Latency metric">
          {METRICS.map((entry) => (
            <button
              key={entry.key}
              onClick={() => setMetric(entry.key)}
              aria-pressed={metric === entry.key}
              className={`rounded px-2 py-1 text-xs font-semibold transition-colors ${
                metric === entry.key
                  ? 'bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)]'
                  : 'text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-sm text-[var(--rpg-text-secondary)]">Loading latency...</div>}
      {error && <div className="text-sm text-[var(--rpg-red)]">{error}</div>}
      {report && !loading && sortedActions.length === 0 && (
        <div className="text-sm text-[var(--rpg-text-secondary)]">No latency samples for this period.</div>
      )}
      {report && !loading && sortedActions.length > 0 && (
        <div className="space-y-3">
          <MiniLatencyChart report={report} metric={metric} action={action} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-xs text-[var(--rpg-text-secondary)]">
                  <th className="pb-1 text-left">Action</th>
                  <th className="pb-1 text-right">Req</th>
                  <th className="pb-1 text-right">P50</th>
                  <th className="pb-1 text-right">P95</th>
                  <th className="pb-1 text-right">P99</th>
                  <th className="pb-1 text-right">Errors</th>
                </tr>
              </thead>
              <tbody>
                {sortedActions.map((row) => (
                  <tr key={row.action} className="even:bg-[var(--rpg-surface-light)]/30">
                    <td className="max-w-72 truncate py-0.5 pr-3 text-[var(--rpg-text-primary)]" title={row.action}>{row.action}</td>
                    <td className="text-right text-[var(--rpg-text-primary)]">{row.requestCount.toLocaleString()}</td>
                    <td className="text-right text-[var(--rpg-text-primary)]">{formatMs(row.p50Ms)}</td>
                    <td className="text-right text-[var(--rpg-text-primary)]">{formatMs(row.p95Ms)}</td>
                    <td className="text-right text-[var(--rpg-text-primary)]">{formatMs(row.p99Ms)}</td>
                    <td className="text-right text-[var(--rpg-text-primary)]">{formatPercent(row.errorRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PixelCard>
  );
}
