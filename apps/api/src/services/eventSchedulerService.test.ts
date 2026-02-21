import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@adventure/database', () => import('../__mocks__/database.js'));
vi.mock('./worldEventService', () => ({
  expireStaleEvents: vi.fn().mockResolvedValue([]),
  spawnWorldEvent: vi.fn().mockResolvedValue(null),
}));
vi.mock('./bossEncounterService', () => ({
  createBossEncounter: vi.fn().mockResolvedValue({}),
  checkAndResolveDueBossRounds: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./systemMessageService', () => ({
  emitSystemMessage: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@adventure/database';
import { checkAndSpawnEvents } from './eventSchedulerService';
import { expireStaleEvents } from './worldEventService';
import { checkAndResolveDueBossRounds } from './bossEncounterService';

const mockPrisma = prisma as unknown as Record<string, any>;

// Each test gets a time epoch far enough apart that the module-level lastRunAt
// from a previous test can never cause throttling.
const BASE = new Date('2099-01-01T00:00:00Z').getTime();
let epoch = 0;

describe('eventSchedulerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    epoch += 10_000_000; // each test is 10 000 s ahead of the previous one
    vi.setSystemTime(BASE + epoch);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkAndSpawnEvents', () => {
    it('throttles calls within MIN_INTERVAL_MS', async () => {
      mockPrisma.worldEvent.findFirst.mockResolvedValue({ id: 'recent' });
      await checkAndSpawnEvents(null);
      expect(expireStaleEvents).toHaveBeenCalledTimes(1);

      // Immediate second call — throttled
      await checkAndSpawnEvents(null);
      expect(expireStaleEvents).toHaveBeenCalledTimes(1);

      // Advance past 60 s throttle window
      vi.advanceTimersByTime(61_000);
      await checkAndSpawnEvents(null);
      expect(expireStaleEvents).toHaveBeenCalledTimes(2);
    });

    it('calls expireStaleEvents and checkAndResolveDueBossRounds', async () => {
      mockPrisma.worldEvent.findFirst.mockResolvedValue({ id: 'recent' });

      await checkAndSpawnEvents(null);

      expect(expireStaleEvents).toHaveBeenCalledOnce();
      expect(checkAndResolveDueBossRounds).toHaveBeenCalledWith(null);
    });

    it('skips spawning if a recent event exists (respawn cooldown)', async () => {
      mockPrisma.worldEvent.findFirst.mockResolvedValue({ id: 'recent-event' });

      await checkAndSpawnEvents(null);

      expect(expireStaleEvents).toHaveBeenCalledOnce();
      expect(checkAndResolveDueBossRounds).toHaveBeenCalledOnce();
      // worldEvent.count is only called inside trySpawnWorldWideEvent/trySpawnZoneEvent,
      // so if spawning is skipped, count should not be called
      expect(mockPrisma.worldEvent.count).not.toHaveBeenCalled();
    });

    it('does not spawn world events if cap reached (MAX_WORLD_EVENTS)', async () => {
      mockPrisma.worldEvent.findFirst.mockResolvedValue(null);
      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      // World-wide cap already reached
      mockPrisma.worldEvent.count.mockResolvedValue(1);

      await checkAndSpawnEvents(null);

      expect(mockPrisma.worldEvent.count).toHaveBeenCalledWith({
        where: { zoneId: null, status: 'active' },
      });
      // Cap hit — no player lookup or spawn attempt
      expect(mockPrisma.player.findMany).not.toHaveBeenCalled();

      vi.spyOn(Math, 'random').mockRestore();
    });

    it('does not spawn zone events if cap reached (MAX_ZONE_EVENTS)', async () => {
      mockPrisma.worldEvent.findFirst.mockResolvedValue(null);
      vi.spyOn(Math, 'random').mockReturnValue(0.9);
      // Zone cap already reached
      mockPrisma.worldEvent.count.mockResolvedValue(2);

      await checkAndSpawnEvents(null);

      expect(mockPrisma.worldEvent.count).toHaveBeenCalledWith({
        where: { zoneId: { not: null }, status: 'active' },
      });
      // Cap hit — no zone lookup
      expect(mockPrisma.zone.findMany).not.toHaveBeenCalled();

      vi.spyOn(Math, 'random').mockRestore();
    });
  });
});
