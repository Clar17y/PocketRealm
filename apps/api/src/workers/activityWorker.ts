import { parentPort } from 'worker_threads';
import { ZodError } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { runActivityInline, type ActivityWorkerJob } from '../services/activityWorkerClient';
import type { WorkerPoolMessage, WorkerPoolResult } from '../services/workerPool';
import type { RouteServiceResponse } from '../utils/routeServiceResponse';

function serializeError(err: unknown): WorkerPoolResult<RouteServiceResponse>['error'] {
  if (err instanceof AppError) {
    return {
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
      stack: err.stack,
      expose: true,
    };
  }

  if (err instanceof ZodError) {
    return {
      message: err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      stack: err.stack,
      expose: true,
    };
  }

  if (err instanceof Error) {
    return { message: err.message, statusCode: 500, stack: err.stack, expose: false };
  }

  return { message: 'Activity worker failed', statusCode: 500, expose: false };
}

if (!parentPort) {
  throw new Error('activityWorker must run inside a worker thread');
}

const port = parentPort;

port.on('message', async (message: WorkerPoolMessage<ActivityWorkerJob>) => {
  try {
    const response = await runActivityInline(message.payload);
    port.postMessage({ id: message.id, ok: true, response });
  } catch (err) {
    port.postMessage({ id: message.id, ok: false, error: serializeError(err) });
  }
});
