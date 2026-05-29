import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./exploration/startRouteService', () => ({
  startExploration: vi.fn().mockResolvedValue({ body: { exploration: true } }),
}));

vi.mock('./zoneRoutesService', () => ({
  travelToZone: vi.fn().mockResolvedValue({ body: { travel: true } }),
}));

vi.mock('./activityWorkerConfig', () => ({
  getActivityWorkerConfig: vi.fn(),
}));

import { AppError } from '../middleware/errorHandler';
import { startExploration } from './exploration/startRouteService';
import { travelToZone } from './zoneRoutesService';
import { getActivityWorkerConfig } from './activityWorkerConfig';
import {
  runActivityWithWorker,
  _resolveActivityWorkerEntryForTest,
  _setActivityWorkerPoolForTest,
} from './activityWorkerClient';

describe('runActivityWithWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _setActivityWorkerPoolForTest(null);
  });

  it('runs supported activities inline when workers are disabled', async () => {
    vi.mocked(getActivityWorkerConfig).mockReturnValue({
      enabled: false,
      mode: 'off',
      workerCount: 1,
      queueLimit: 1,
      queueTimeoutMs: 100,
    });

    const input = { body: {}, player: { playerId: 'p1', username: 'A' } as never };

    await expect(runActivityWithWorker({ type: 'exploration.start', input }))
      .resolves.toEqual({ body: { exploration: true } });
    await expect(runActivityWithWorker({ type: 'zones.travel', input }))
      .resolves.toEqual({ body: { travel: true } });
    expect(startExploration).toHaveBeenCalledTimes(1);
    expect(travelToZone).toHaveBeenCalledTimes(1);
  });

  it('submits exploration and travel to the shared worker pool when enabled', async () => {
    vi.mocked(getActivityWorkerConfig).mockReturnValue({
      enabled: true,
      mode: 'always',
      workerCount: 1,
      queueLimit: 2,
      queueTimeoutMs: 100,
    });
    const run = vi.fn()
      .mockResolvedValueOnce({ body: { workerExploration: true } })
      .mockResolvedValueOnce({ body: { workerTravel: true } });
    _setActivityWorkerPoolForTest({ run, close: vi.fn() });

    const input = { body: {}, player: { playerId: 'p1', username: 'A' } as never };

    await expect(runActivityWithWorker({ type: 'exploration.start', input }))
      .resolves.toEqual({ body: { workerExploration: true } });
    await expect(runActivityWithWorker({ type: 'zones.travel', input }))
      .resolves.toEqual({ body: { workerTravel: true } });
    expect(run).toHaveBeenNthCalledWith(1, { type: 'exploration.start', input });
    expect(run).toHaveBeenNthCalledWith(2, { type: 'zones.travel', input });
  });

  it('maps worker saturation to an activity busy AppError', async () => {
    vi.mocked(getActivityWorkerConfig).mockReturnValue({
      enabled: true,
      mode: 'always',
      workerCount: 1,
      queueLimit: 1,
      queueTimeoutMs: 100,
    });
    _setActivityWorkerPoolForTest({
      run: vi.fn().mockRejectedValue(Object.assign(new Error('full'), { code: 'WORKER_QUEUE_FULL' })),
      close: vi.fn(),
    });

    await expect(runActivityWithWorker({
      type: 'zones.travel',
      input: { body: {}, player: { playerId: 'p1', username: 'A' } as never },
    })).rejects.toEqual(new AppError(503, 'Activity processing is busy. Try again in a moment.', 'ACTIVITY_BUSY'));
  });

  it('reconstructs AppError responses from worker failures', async () => {
    vi.mocked(getActivityWorkerConfig).mockReturnValue({
      enabled: true,
      mode: 'always',
      workerCount: 1,
      queueLimit: 1,
      queueTimeoutMs: 100,
    });
    _setActivityWorkerPoolForTest({
      run: vi.fn().mockRejectedValue(Object.assign(
        new Error('Cannot travel while recovering'),
        { code: 'IS_RECOVERING', statusCode: 400, expose: true },
      )),
      close: vi.fn(),
    });

    await expect(runActivityWithWorker({
      type: 'zones.travel',
      input: { body: {}, player: { playerId: 'p1', username: 'A' } as never },
    })).rejects.toEqual(new AppError(400, 'Cannot travel while recovering', 'IS_RECOVERING'));
  });

  it('does not expose unexpected worker failure messages as AppErrors', async () => {
    vi.mocked(getActivityWorkerConfig).mockReturnValue({
      enabled: true,
      mode: 'always',
      workerCount: 1,
      queueLimit: 1,
      queueTimeoutMs: 100,
    });
    _setActivityWorkerPoolForTest({
      run: vi.fn().mockRejectedValue(Object.assign(
        new Error('database connection string leaked'),
        { code: 'WORKER_JOB_FAILED', statusCode: 500, expose: false },
      )),
      close: vi.fn(),
    });

    try {
      await runActivityWithWorker({
        type: 'zones.travel',
        input: { body: {}, player: { playerId: 'p1', username: 'A' } as never },
      });
      throw new Error('Expected runActivityWithWorker to throw');
    } catch (err) {
      expect(err).not.toBeInstanceOf(AppError);
      expect(err).toMatchObject({
        message: 'database connection string leaked',
        code: 'WORKER_JOB_FAILED',
        statusCode: 500,
      });
    }
  });
});

describe('activity worker entry resolution', () => {
  it('loads the TypeScript source worker through a tsx bootstrap in dev', () => {
    const sourceDir = path.resolve('apps/api/src/services');
    const entry = _resolveActivityWorkerEntryForTest(
      path.join(sourceDir, 'activityWorkerClient.ts'),
      sourceDir,
    );

    expect(entry.filename).toContain("require('tsx/cjs')");
    expect(entry.filename).toContain('activityWorker.ts');
    expect(entry.options).toEqual({ eval: true });
  });

  it('loads the compiled JavaScript worker directly in production builds', () => {
    const distDir = path.resolve('apps/api/dist/services');
    const entry = _resolveActivityWorkerEntryForTest(
      path.join(distDir, 'activityWorkerClient.js'),
      distDir,
    );

    expect(entry.filename).toMatch(/activityWorker\.js$/);
    expect(entry.filename).not.toContain('tsx/cjs');
    expect(entry.options).toEqual({});
  });
});
