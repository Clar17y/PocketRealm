import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));
vi.mock('../redis', () => ({
  redis: { ping: vi.fn() },
}));

import { prisma } from '@pocketrealm/database';
import { redis } from '../redis';
import {
  checkDatabase,
  checkRedis,
  getSocketIoStats,
  isShuttingDown,
  markShuttingDown,
  resetShutdownState,
  resetProbeInflight,
  PROBE_TIMEOUT_MS,
} from './healthChecks';

describe('healthChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetShutdownState();
    resetProbeInflight();
  });

  describe('checkDatabase', () => {
    it('returns "ok" when SELECT 1 succeeds', async () => {
      (prisma.$queryRaw as any).mockResolvedValueOnce([{ one: 1 }]);
      await expect(checkDatabase()).resolves.toBe('ok');
    });

    it('revalidates each successful database check', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([{ one: 1 }]);

      await expect(checkDatabase()).resolves.toBe('ok');
      await expect(checkDatabase()).resolves.toBe('ok');

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('returns "error" when Prisma throws', async () => {
      (prisma.$queryRaw as any).mockRejectedValueOnce(new Error('connection refused'));
      await expect(checkDatabase()).resolves.toBe('error');
    });
  });

  describe('checkRedis', () => {
    it('returns "ok" when ping returns PONG', async () => {
      (redis.ping as any).mockResolvedValueOnce('PONG');
      await expect(checkRedis()).resolves.toBe('ok');
    });

    it('revalidates each successful Redis check', async () => {
      (redis.ping as any).mockResolvedValue('PONG');

      await expect(checkRedis()).resolves.toBe('ok');
      await expect(checkRedis()).resolves.toBe('ok');

      expect(redis.ping).toHaveBeenCalledTimes(2);
    });

    it('returns "error" when ping rejects', async () => {
      (redis.ping as any).mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(checkRedis()).resolves.toBe('error');
    });

    it('returns "error" when ping resolves with unexpected value', async () => {
      (redis.ping as any).mockResolvedValueOnce('');
      await expect(checkRedis()).resolves.toBe('error');
    });
  });

  describe('probe timeout', () => {
    it('checkDatabase returns "error" if prisma hangs longer than PROBE_TIMEOUT_MS', async () => {
      vi.useFakeTimers();
      try {
        (prisma.$queryRaw as any).mockImplementationOnce(
          () => new Promise(() => { /* never resolves */ }),
        );
        const promise = checkDatabase();
        await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS + 1);
        await expect(promise).resolves.toBe('error');
      } finally {
        vi.useRealTimers();
      }
    });

    it('checkRedis returns "error" if ping hangs longer than PROBE_TIMEOUT_MS', async () => {
      vi.useFakeTimers();
      try {
        (redis.ping as any).mockImplementationOnce(
          () => new Promise(() => { /* never resolves */ }),
        );
        const promise = checkRedis();
        await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS + 1);
        await expect(promise).resolves.toBe('error');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('getSocketIoStats', () => {
    it('returns { connected: 0 } when io is null', () => {
      expect(getSocketIoStats(null)).toEqual({ connected: 0 });
    });

    it('returns connected count from io.sockets.sockets.size', () => {
      const io = { sockets: { sockets: { size: 42 } } } as any;
      expect(getSocketIoStats(io)).toEqual({ connected: 42 });
    });
  });

  describe('shutdown flag', () => {
    it('starts false and flips to true after markShuttingDown()', () => {
      expect(isShuttingDown()).toBe(false);
      markShuttingDown();
      expect(isShuttingDown()).toBe(true);
    });
  });

  describe('single-flight probe coalescing', () => {
    it('concurrent checkDatabase callers share a single underlying prisma call', async () => {
      let resolveQuery: ((value: unknown) => void) | undefined;
      (prisma.$queryRaw as any).mockImplementationOnce(
        () => new Promise((resolve) => { resolveQuery = resolve; }),
      );

      const first = checkDatabase();
      const second = checkDatabase();
      const third = checkDatabase();

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);

      resolveQuery?.([{ one: 1 }]);
      await expect(first).resolves.toBe('ok');
      await expect(second).resolves.toBe('ok');
      await expect(third).resolves.toBe('ok');
    });

    it('timed-out probe does not spawn a second prisma call while it is still hanging', async () => {
      vi.useFakeTimers();
      try {
        (prisma.$queryRaw as any).mockImplementation(
          () => new Promise(() => { /* never resolves */ }),
        );

        const first = checkDatabase();
        await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS + 1);
        await expect(first).resolves.toBe('error');

        // Second poll while the underlying call is still hanging: must NOT
        // spawn a new prisma.$queryRaw — that's the leak Codex P1 flagged.
        const second = checkDatabase();
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS + 1);
        await expect(second).resolves.toBe('error');
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
