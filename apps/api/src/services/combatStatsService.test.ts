import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@adventure/database', () => import('../__mocks__/database.js'));

import { prisma } from '@adventure/database';
import {
  attackSkillFromRequiredSkill,
  getMainHandAttackSkill,
  getSkillLevel,
} from './combatStatsService';

const mockPrisma = prisma as unknown as Record<string, any>;

describe('combatStatsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('attackSkillFromRequiredSkill', () => {
    it('returns melee for "melee"', () => {
      expect(attackSkillFromRequiredSkill('melee')).toBe('melee');
    });

    it('returns ranged for "ranged"', () => {
      expect(attackSkillFromRequiredSkill('ranged')).toBe('ranged');
    });

    it('returns magic for "magic"', () => {
      expect(attackSkillFromRequiredSkill('magic')).toBe('magic');
    });

    it('returns null for non-attack skills', () => {
      expect(attackSkillFromRequiredSkill('mining')).toBeNull();
      expect(attackSkillFromRequiredSkill('weaponsmithing')).toBeNull();
    });

    it('returns null for null/undefined', () => {
      expect(attackSkillFromRequiredSkill(null as any)).toBeNull();
      expect(attackSkillFromRequiredSkill(undefined as any)).toBeNull();
    });
  });

  describe('getMainHandAttackSkill', () => {
    it('returns attack skill from equipped main hand weapon', async () => {
      mockPrisma.playerEquipment.findUnique.mockResolvedValue({
        item: { template: { requiredSkill: 'ranged' } },
      });

      const result = await getMainHandAttackSkill('player-1');
      expect(result).toBe('ranged');
    });

    it('returns null when no main hand equipped', async () => {
      mockPrisma.playerEquipment.findUnique.mockResolvedValue(null);

      const result = await getMainHandAttackSkill('player-1');
      expect(result).toBeNull();
    });

    it('returns null when weapon has non-attack requiredSkill', async () => {
      mockPrisma.playerEquipment.findUnique.mockResolvedValue({
        item: { template: { requiredSkill: 'mining' } },
      });

      const result = await getMainHandAttackSkill('player-1');
      expect(result).toBeNull();
    });
  });

  describe('getSkillLevel', () => {
    it('returns skill level from DB', async () => {
      mockPrisma.playerSkill.findUnique.mockResolvedValue({ level: 42 });

      const result = await getSkillLevel('player-1', 'melee');
      expect(result).toBe(42);
    });

    it('returns 1 when skill not found', async () => {
      mockPrisma.playerSkill.findUnique.mockResolvedValue(null);

      const result = await getSkillLevel('player-1', 'melee');
      expect(result).toBe(1);
    });
  });
});
