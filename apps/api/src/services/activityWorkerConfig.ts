import os from 'os';

export type ActivityWorkerMode = 'off' | 'auto' | 'always';

export interface ActivityWorkerConfig {
  enabled: boolean;
  mode: ActivityWorkerMode;
  workerCount: number;
  queueLimit: number;
  queueTimeoutMs: number;
}

function envValue(env: NodeJS.ProcessEnv, primary: string, fallback: string): string | undefined {
  return env[primary] ?? env[fallback];
}

function parseMode(value: string | undefined): ActivityWorkerMode {
  if (value === 'off' || value === 'auto' || value === 'always') return value;
  return 'auto';
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : fallback;
}

function defaultWorkerCount(): number {
  const available = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length;

  return Math.min(4, Math.max(1, available - 1));
}

export function getActivityWorkerConfig(env: NodeJS.ProcessEnv = process.env): ActivityWorkerConfig {
  const mode = parseMode(envValue(env, 'ACTIVITY_WORKER_MODE', 'EXPLORATION_WORKER_MODE'));
  const configuredCount = parsePositiveInt(
    envValue(env, 'ACTIVITY_WORKER_COUNT', 'EXPLORATION_WORKER_COUNT'),
    defaultWorkerCount(),
  );
  const workerCount = Math.min(8, configuredCount);
  const queueLimit = parsePositiveInt(
    envValue(env, 'ACTIVITY_WORKER_QUEUE_LIMIT', 'EXPLORATION_WORKER_QUEUE_LIMIT'),
    64,
  );
  const queueTimeoutMs = parsePositiveInt(
    envValue(env, 'ACTIVITY_WORKER_QUEUE_TIMEOUT_MS', 'EXPLORATION_WORKER_QUEUE_TIMEOUT_MS'),
    2_000,
  );

  return {
    enabled: mode === 'always' || (mode === 'auto' && env.NODE_ENV !== 'test'),
    mode,
    workerCount,
    queueLimit,
    queueTimeoutMs,
  };
}
