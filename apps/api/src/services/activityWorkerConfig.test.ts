import { afterEach, describe, expect, it } from 'vitest';
import { getActivityWorkerConfig } from './activityWorkerConfig';

const OLD_ENV = process.env;

describe('getActivityWorkerConfig', () => {
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('disables workers in test when mode is auto', () => {
    process.env = { ...OLD_ENV, NODE_ENV: 'test', ACTIVITY_WORKER_MODE: 'auto' };

    expect(getActivityWorkerConfig()).toMatchObject({
      enabled: false,
      mode: 'auto',
    });
  });

  it('enables workers when mode is always and clamps count and queue', () => {
    process.env = {
      ...OLD_ENV,
      NODE_ENV: 'test',
      ACTIVITY_WORKER_MODE: 'always',
      ACTIVITY_WORKER_COUNT: '99',
      ACTIVITY_WORKER_QUEUE_LIMIT: '0',
    };

    const config = getActivityWorkerConfig();

    expect(config.enabled).toBe(true);
    expect(config.workerCount).toBeGreaterThanOrEqual(1);
    expect(config.workerCount).toBeLessThanOrEqual(8);
    expect(config.queueLimit).toBe(1);
  });

  it('accepts the old exploration worker env names as fallbacks', () => {
    process.env = {
      ...OLD_ENV,
      NODE_ENV: 'production',
      EXPLORATION_WORKER_MODE: 'always',
      EXPLORATION_WORKER_COUNT: '2',
      EXPLORATION_WORKER_QUEUE_LIMIT: '3',
    };

    expect(getActivityWorkerConfig()).toMatchObject({
      enabled: true,
      workerCount: 2,
      queueLimit: 3,
    });
  });
});
