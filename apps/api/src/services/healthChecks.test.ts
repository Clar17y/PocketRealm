import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));
vi.mock('../redis', () => ({
  redis: { ping: vi.fn() },
}));

import { prisma } from '@pocketrealm/database';
import { redis } from '../redis';
import { checkDatabase, checkRedis, getSocketIoStats, PROBE_TIMEOUT_MS } from './healthChecks';

describe('healthChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkDatabase', () => {
    it('returns "ok" when SELECT 1 succeeds', async () => {
      (prisma.$queryRaw as any).mockResolvedValueOnce([{ one: 1 }]);
      await expect(checkDatabase()).resolves.toBe('ok');
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
});
