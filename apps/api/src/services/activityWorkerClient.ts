import path from 'path';
import { Worker, type WorkerOptions } from 'worker_threads';
import { AppError } from '../middleware/errorHandler';
import type { AuthenticatedRouteServiceRequest, RouteServiceResponse } from '../utils/routeServiceResponse';
import { WorkerPool } from './workerPool';
import { startExploration } from './exploration/startRouteService';
import { travelToZone } from './zoneRoutesService';
import { getActivityWorkerConfig } from './activityWorkerConfig';

export type ActivityWorkerJob =
  | { type: 'exploration.start'; input: AuthenticatedRouteServiceRequest }
  | { type: 'zones.travel'; input: AuthenticatedRouteServiceRequest };

type ActivityWorkerResponse = RouteServiceResponse;

interface ActivityWorkerPoolLike {
  run(payload: ActivityWorkerJob): Promise<ActivityWorkerResponse>;
  close(): Promise<void> | void;
}

let activityWorkerPool: ActivityWorkerPoolLike | null = null;

interface ActivityWorkerEntry {
  filename: string;
  options: WorkerOptions;
}

function resolveActivityWorkerEntry(
  runtimeFilename = __filename,
  runtimeDirname = __dirname,
): ActivityWorkerEntry {
  const isTypeScriptRuntime = runtimeFilename.endsWith('.ts');
  const extension = isTypeScriptRuntime ? '.ts' : '.js';
  const workerPath = path.resolve(runtimeDirname, '..', 'workers', `activityWorker${extension}`);

  if (!isTypeScriptRuntime) {
    return { filename: workerPath, options: {} };
  }

  return {
    filename: `require('tsx/cjs'); require(${JSON.stringify(workerPath)});`,
    options: { eval: true },
  };
}

function createActivityWorkerPool(): ActivityWorkerPoolLike {
  const config = getActivityWorkerConfig();
  return new WorkerPool<ActivityWorkerJob, ActivityWorkerResponse>({
    name: 'activity',
    size: config.workerCount,
    queueLimit: config.queueLimit,
    queueTimeoutMs: config.queueTimeoutMs,
    createWorker: () => {
      const entry = resolveActivityWorkerEntry();
      return new Worker(entry.filename, entry.options);
    },
  });
}

function getPool(): ActivityWorkerPoolLike {
  activityWorkerPool ??= createActivityWorkerPool();
  return activityWorkerPool;
}

export async function runActivityInline(job: ActivityWorkerJob): Promise<RouteServiceResponse> {
  switch (job.type) {
    case 'exploration.start':
      return startExploration(job.input);
    case 'zones.travel':
      return travelToZone(job.input);
  }
}

export async function runActivityWithWorker(job: ActivityWorkerJob): Promise<RouteServiceResponse> {
  const config = getActivityWorkerConfig();
  if (!config.enabled) {
    return runActivityInline(job);
  }

  try {
    return await getPool().run(job);
  } catch (err) {
    if (err && typeof err === 'object') {
      const code = 'code' in err ? (err as { code?: string }).code : undefined;
      const statusCode = 'statusCode' in err ? (err as { statusCode?: number }).statusCode : undefined;
      const expose = 'expose' in err ? (err as { expose?: boolean }).expose : false;
      const message = err instanceof Error ? err.message : 'Activity worker failed';

      if (code === 'WORKER_QUEUE_FULL' || code === 'WORKER_QUEUE_TIMEOUT') {
        throw new AppError(503, 'Activity processing is busy. Try again in a moment.', 'ACTIVITY_BUSY');
      }
      if (typeof statusCode === 'number' && expose) {
        throw new AppError(statusCode, message, code);
      }
    }
    throw err;
  }
}

export async function closeActivityWorkerPool(): Promise<void> {
  await activityWorkerPool?.close();
  activityWorkerPool = null;
}

export function _setActivityWorkerPoolForTest(pool: ActivityWorkerPoolLike | null): void {
  activityWorkerPool = pool;
}

export function _resolveActivityWorkerEntryForTest(
  runtimeFilename: string,
  runtimeDirname: string,
): ActivityWorkerEntry {
  return resolveActivityWorkerEntry(runtimeFilename, runtimeDirname);
}
