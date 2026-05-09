import { performance } from 'perf_hooks';
import type { NextFunction, Request, Response } from 'express';
import {
  normalizeApiRoute,
  recordApiLatencySample,
  shouldRecordApiLatency,
} from '../services/apiLatencyMetricsService';

export function apiLatencyRecorder(req: Request, res: Response, next: NextFunction): void {
  const start = performance.now();
  let recorded = false;

  const record = () => {
    if (recorded) return;
    recorded = true;

    const route = normalizeApiRoute(req.originalUrl || req.path);

    if (!shouldRecordApiLatency(req.method, route)) {
      return;
    }

    recordApiLatencySample({
      method: req.method,
      route,
      statusCode: res.statusCode,
      durationMs: performance.now() - start,
    });
  };

  res.on('finish', record);
  res.on('close', record);

  next();
}
