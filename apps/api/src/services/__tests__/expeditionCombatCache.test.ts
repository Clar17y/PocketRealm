import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
  },
}));

import {
  snapshotCombatData,
  getCombatSnapshot,
  clearRoomSnapshots,
  SNAPSHOT_TTL,
} from '../expeditionCombatCache';
import { redis } from '../../redis';

const fakeSnapshot = {
  equipmentStats: { attack: 5, armor: 3, health: 0, rangedPower: 0, magicPower: 0, accuracy: 0, magicDefence: 0, dodge: 0, luck: 0, critChance: 0, critDamage: 0, inventorySlots: 0 },
  attackSkill: 'melee' as const,
  attackLevel: 10,
  progression: { attributes: { strength: 5, dexterity: 5, intelligence: 5, vitality: 5, luck: 3, evasion: 2 } },
  guildMods: { combatDamage: 0.1, defenseBoost: 0.05 },
  perActionScaling: {
    skillLevels: { melee: 10, ranged: 1, magic: 1 },
    attributes: { strength: 5, dexterity: 5, intelligence: 5 },
    weaponPower: { attack: 5, rangedPower: 0, magicPower: 0 },
    equipmentAccuracy: 0,
    weaponRequiredSkill: 'melee' as const,
  },
  playerTemplate: [],
  unlockedActions: ['basic_attack'],
  potionPool: [],
  maxHp: 100,
  maxStamina: 50,
  staminaRegenPerRound: 5,
  maxMana: 30,
  manaRegenPerRound: 3,
};

describe('expeditionCombatCache', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('snapshotCombatData', () => {
    it('stores snapshot in Redis with correct key and TTL', async () => {
      vi.mocked(redis.set).mockResolvedValue('OK');
      await snapshotCombatData('exp-1', 2, 'player-1', fakeSnapshot);
      expect(redis.set).toHaveBeenCalledWith(
        'expedition:exp-1:room:2:player:player-1:combat',
        JSON.stringify(fakeSnapshot),
        'EX',
        SNAPSHOT_TTL,
      );
    });
  });

  describe('getCombatSnapshot', () => {
    it('returns parsed snapshot on hit', async () => {
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(fakeSnapshot));
      const result = await getCombatSnapshot('exp-1', 2, 'player-1');
      expect(result).toEqual(fakeSnapshot);
    });

    it('returns null on miss', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      const result = await getCombatSnapshot('exp-1', 2, 'player-1');
      expect(result).toBeNull();
    });

    it('returns null on Redis error', async () => {
      vi.mocked(redis.get).mockRejectedValue(new Error('down'));
      const result = await getCombatSnapshot('exp-1', 2, 'player-1');
      expect(result).toBeNull();
    });
  });

  describe('clearRoomSnapshots', () => {
    it('deletes all keys matching the room pattern', async () => {
      vi.mocked(redis.keys).mockResolvedValue([
        'expedition:exp-1:room:2:player:p1:combat',
        'expedition:exp-1:room:2:player:p2:combat',
      ]);
      vi.mocked(redis.del).mockResolvedValue(2);
      await clearRoomSnapshots('exp-1', 2);
      expect(redis.keys).toHaveBeenCalledWith('expedition:exp-1:room:2:player:*:combat');
      expect(redis.del).toHaveBeenCalledWith(
        'expedition:exp-1:room:2:player:p1:combat',
        'expedition:exp-1:room:2:player:p2:combat',
      );
    });

    it('no-ops when no keys found', async () => {
      vi.mocked(redis.keys).mockResolvedValue([]);
      await clearRoomSnapshots('exp-1', 2);
      expect(redis.del).not.toHaveBeenCalled();
    });
  });
});
