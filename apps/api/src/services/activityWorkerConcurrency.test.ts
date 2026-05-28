import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./activityWorkerConfig', () => ({
  getActivityWorkerConfig: vi.fn(() => ({
    enabled: true,
    mode: 'always',
    workerCount: 4,
    queueLimit: 16,
    queueTimeoutMs: 1_000,
  })),
}));

import { runActivityWithWorker, _setActivityWorkerPoolForTest } from './activityWorkerClient';

describe('activity worker concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits simultaneous supported activities without serial inline execution', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    _setActivityWorkerPoolForTest({
      run: vi.fn(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight -= 1;
        return { body: { ok: true } };
      }),
      close: vi.fn(),
    });

    await Promise.all(Array.from({ length: 12 }, (_, index) =>
      runActivityWithWorker({
        type: index % 2 === 0 ? 'exploration.start' : 'zones.travel',
        input: {
          body: { zoneId: `zone-${index}`, turns: 2500 },
          player: { playerId: `player-${index}`, username: `Player ${index}` } as never,
        },
      }),
    ));

    expect(maxInFlight).toBeGreaterThan(1);
  });
});
