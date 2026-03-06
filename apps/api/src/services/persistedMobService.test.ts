import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/game-engine', () => ({
  calculatePersistedMobHp: vi.fn(),
}));

import { mockPrisma } from '../__test__/setup';
import { calculatePersistedMobHp } from '@pocketrealm/game-engine';
import {
  persistMobHp,
  checkPersistedMobReencounter,
  removePersistedMob,
  cleanupFullyHealedMobs,
} from './persistedMobService';
const mockCalcHp = calculatePersistedMobHp as ReturnType<typeof vi.fn>;

describe('persistedMobService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('persistMobHp', () => {
    it('creates a new persisted mob when none exists', async () => {
      mockPrisma.persistedMob.findFirst.mockResolvedValue(null);
      mockPrisma.persistedMob.create.mockResolvedValue({});

      await persistMobHp('player-1', 'mob-1', 'zone-1', 50, 100);

      expect(mockPrisma.persistedMob.create).toHaveBeenCalledWith({
        data: {
          playerId: 'player-1',
          mobTemplateId: 'mob-1',
          zoneId: 'zone-1',
          currentHp: 50,
          maxHp: 100,
        },
      });
    });

    it('updates existing persisted mob', async () => {
      mockPrisma.persistedMob.findFirst.mockResolvedValue({ id: 'pm-1' });
      mockPrisma.persistedMob.update.mockResolvedValue({});

      await persistMobHp('player-1', 'mob-1', 'zone-1', 30, 100);

      expect(mockPrisma.persistedMob.update).toHaveBeenCalledWith({
        where: { id: 'pm-1' },
        data: expect.objectContaining({ currentHp: 30, maxHp: 100 }),
      });
    });
  });

  describe('checkPersistedMobReencounter', () => {
    it('returns null when no persisted mob exists', async () => {
      mockPrisma.persistedMob.findFirst.mockResolvedValue(null);

      const result = await checkPersistedMobReencounter('p-1', 'z-1', 'm-1');
      expect(result).toBeNull();
    });

    it('returns null when reencounter roll fails', async () => {
      mockPrisma.persistedMob.findFirst.mockResolvedValue({
        id: 'pm-1',
        playerId: 'p-1',
        mobTemplateId: 'm-1',
        zoneId: 'z-1',
        currentHp: 50,
        maxHp: 100,
        damagedAt: new Date(),
      });

      // Math.random() > 0.3 means roll fails
      vi.spyOn(Math, 'random').mockReturnValue(0.9);

      const result = await checkPersistedMobReencounter('p-1', 'z-1', 'm-1');
      expect(result).toBeNull();

      vi.spyOn(Math, 'random').mockRestore();
    });

    it('returns mob data when reencounter succeeds and mob not fully healed', async () => {
      const damagedAt = new Date();
      mockPrisma.persistedMob.findFirst.mockResolvedValue({
        id: 'pm-1',
        playerId: 'p-1',
        mobTemplateId: 'm-1',
        zoneId: 'z-1',
        currentHp: 50,
        maxHp: 100,
        damagedAt,
      });

      vi.spyOn(Math, 'random').mockReturnValue(0.1); // passes 0.3 threshold
      mockCalcHp.mockReturnValue(75); // not fully healed

      const result = await checkPersistedMobReencounter('p-1', 'z-1', 'm-1');
      expect(result).not.toBeNull();
      expect(result!.currentHp).toBe(75);
      expect(result!.id).toBe('pm-1');

      vi.spyOn(Math, 'random').mockRestore();
    });

    it('deletes and returns null when mob is fully healed', async () => {
      mockPrisma.persistedMob.findFirst.mockResolvedValue({
        id: 'pm-1',
        playerId: 'p-1',
        mobTemplateId: 'm-1',
        zoneId: 'z-1',
        currentHp: 50,
        maxHp: 100,
        damagedAt: new Date(),
      });

      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      mockCalcHp.mockReturnValue(100); // fully healed

      const result = await checkPersistedMobReencounter('p-1', 'z-1', 'm-1');
      expect(result).toBeNull();
      expect(mockPrisma.persistedMob.delete).toHaveBeenCalledWith({
        where: { id: 'pm-1' },
      });

      vi.spyOn(Math, 'random').mockRestore();
    });
  });

  describe('removePersistedMob', () => {
    it('deletes by id', async () => {
      mockPrisma.persistedMob.deleteMany.mockResolvedValue({ count: 1 });

      await removePersistedMob('pm-1');

      expect(mockPrisma.persistedMob.deleteMany).toHaveBeenCalledWith({
        where: { id: 'pm-1' },
      });
    });
  });

  describe('cleanupFullyHealedMobs', () => {
    it('deletes mobs older than max age and returns count', async () => {
      mockPrisma.persistedMob.deleteMany.mockResolvedValue({ count: 5 });

      const count = await cleanupFullyHealedMobs();
      expect(count).toBe(5);
      expect(mockPrisma.persistedMob.deleteMany).toHaveBeenCalledWith({
        where: { damagedAt: { lte: expect.any(Date) } },
      });
    });
  });
});
