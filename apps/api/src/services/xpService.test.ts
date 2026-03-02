import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SKILL_POINT_CONSTANTS } from '@adventure/shared';
import { mockPrisma } from '../__test__/setup';
import { grantSkillXp } from './xpService';
const now = new Date('2025-06-01T12:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('grantSkillXp', () => {
  it('throws when skill not found', async () => {
    mockPrisma.playerSkill.findUnique.mockResolvedValue(null);
    mockPrisma.player.findUnique.mockResolvedValue({
      characterXp: BigInt(0),
      characterLevel: 1,
      attributePoints: 0,
    });

    await expect(grantSkillXp('p1', 'melee', 100, now)).rejects.toThrow('Skill not found');
  });

  it('throws when player not found', async () => {
    mockPrisma.playerSkill.findUnique.mockResolvedValue({
      xp: BigInt(0),
      level: 1,
      dailyXpGained: 0,
      lastXpResetAt: now,
    });
    mockPrisma.player.findUnique.mockResolvedValue(null);

    await expect(grantSkillXp('p1', 'melee', 100, now)).rejects.toThrow('Player not found');
  });

  it('grants XP and returns result', async () => {
    mockPrisma.playerSkill.findUnique.mockResolvedValue({
      xp: BigInt(0),
      level: 1,
      dailyXpGained: 0,
      lastXpResetAt: now,
    });
    mockPrisma.player.findUnique.mockResolvedValue({
      characterXp: BigInt(0),
      characterLevel: 1,
      attributePoints: 0,
    });
    mockPrisma.playerSkill.update.mockResolvedValue({});
    mockPrisma.player.update.mockResolvedValue({});

    const result = await grantSkillXp('p1', 'melee', 50, now);
    expect(result.skillType).toBe('melee');
    expect(result.xpResult).toBeDefined();
    expect(result.newTotalXp).toBeGreaterThanOrEqual(0);
    expect(result.characterXpGain).toBeGreaterThanOrEqual(0);
    expect(result.skillPointsGained).toBe(0);
  });

  it('handles BigInt characterXp correctly', async () => {
    mockPrisma.playerSkill.findUnique.mockResolvedValue({
      xp: BigInt(500),
      level: 3,
      dailyXpGained: 100,
      lastXpResetAt: now,
    });
    mockPrisma.player.findUnique.mockResolvedValue({
      characterXp: BigInt(1000),
      characterLevel: 2,
      attributePoints: 0,
    });
    mockPrisma.playerSkill.update.mockResolvedValue({});
    mockPrisma.player.update.mockResolvedValue({});

    const result = await grantSkillXp('p1', 'melee', 100, now);
    expect(typeof result.characterXpAfter).toBe('number');
    expect(result.characterLevelBefore).toBe(2);
    expect(result.skillPointsGained).toBe(0);
  });

  it('returns skillPointsGained=0 when no level-up occurs', async () => {
    mockPrisma.playerSkill.findUnique.mockResolvedValue({
      xp: BigInt(0),
      level: 1,
      dailyXpGained: 0,
      lastXpResetAt: now,
    });
    mockPrisma.player.findUnique.mockResolvedValue({
      characterXp: BigInt(0),
      characterLevel: 1,
      attributePoints: 0,
    });
    mockPrisma.playerSkill.update.mockResolvedValue({});
    mockPrisma.player.update.mockResolvedValue({});

    const result = await grantSkillXp('p1', 'melee', 10, now);
    expect(result.skillPointsGained).toBe(0);
    expect(result.newLevel).toBe(1);
  });

  it('returns skillPointsGained equal to POINTS_PER_LEVEL when skill levels up', async () => {
    // Level 2 requires 282 XP (floor(100 * 2^1.5)), so 300 raw XP triggers level-up
    mockPrisma.playerSkill.findUnique.mockResolvedValue({
      xp: BigInt(0),
      level: 1,
      dailyXpGained: 0,
      lastXpResetAt: now,
    });
    mockPrisma.player.findUnique.mockResolvedValue({
      characterXp: BigInt(0),
      characterLevel: 1,
      attributePoints: 0,
    });
    mockPrisma.playerSkill.update.mockResolvedValue({});
    mockPrisma.player.update.mockResolvedValue({});

    const result = await grantSkillXp('p1', 'melee', 300, now);
    expect(result.newLevel).toBe(2);
    expect(result.skillPointsGained).toBe(SKILL_POINT_CONSTANTS.POINTS_PER_LEVEL);
  });
});
