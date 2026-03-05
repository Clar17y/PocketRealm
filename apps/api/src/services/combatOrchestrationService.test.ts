import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./xpService', () => ({
  grantSkillXp: vi.fn(),
}));

import { splitAndGrantXp } from './combatOrchestrationService';
import { grantSkillXp } from './xpService';

const mockGrantSkillXp = grantSkillXp as ReturnType<typeof vi.fn>;

function fakeXpResult(skillType: string, rawXp: number) {
  return {
    skillType,
    xpResult: { xpGained: rawXp, xpAfterEfficiency: rawXp, efficiency: 1, leveledUp: false, newLevel: 1, atDailyCap: false },
    newTotalXp: rawXp,
    newDailyXpGained: rawXp,
    newLevel: 1,
    characterXpGain: 0,
    characterXpAfter: 0,
    characterLevelBefore: 1,
    characterLevelAfter: 1,
    attributePointsAfter: 0,
    characterLeveledUp: false,
    skillPointsGained: 0,
  };
}

const NO_DAMAGE = undefined;
const NO_RESOURCES = undefined;
const NO_BOOST = undefined;

describe('splitAndGrantXp', () => {
  beforeEach(() => {
    mockGrantSkillXp.mockReset();
    mockGrantSkillXp.mockImplementation((_pid: string, skill: string, rawXp: number) =>
      Promise.resolve(fakeXpResult(skill, rawXp)),
    );
  });

  it('grants all XP to fallback skill when no tracking data', async () => {
    const results = await splitAndGrantXp('p1', 10, 'melee', NO_DAMAGE, NO_RESOURCES, NO_BOOST);
    expect(results).toHaveLength(1);
    expect(mockGrantSkillXp).toHaveBeenCalledWith('p1', 'melee', 10, undefined, undefined);
  });

  it('grants all XP to fallback skill when total contribution is 0', async () => {
    const results = await splitAndGrantXp('p1', 10, 'magic', { melee: 0, ranged: 0, magic: 0 }, { melee: 0, ranged: 0, magic: 0 }, NO_BOOST);
    expect(results).toHaveLength(1);
    expect(mockGrantSkillXp).toHaveBeenCalledWith('p1', 'magic', 10, undefined, undefined);
  });

  it('grants all XP to single skill when only one type contributed', async () => {
    const results = await splitAndGrantXp('p1', 8, 'melee', { melee: 0, ranged: 0, magic: 20 }, NO_RESOURCES, NO_BOOST);
    expect(results).toHaveLength(1);
    expect(mockGrantSkillXp).toHaveBeenCalledWith('p1', 'magic', 8, undefined, undefined);
  });

  it('splits XP proportionally between two skills by damage', async () => {
    // melee: 9 dmg, magic: 5 dmg → total 14 → melee floor(8*9/14)=5+1rem, magic floor(8*5/14)=2
    const results = await splitAndGrantXp('p1', 8, 'melee', { melee: 9, ranged: 0, magic: 5 }, NO_RESOURCES, NO_BOOST);
    expect(results).toHaveLength(2);
    const calls = mockGrantSkillXp.mock.calls;
    expect(calls.find((c: unknown[]) => c[1] === 'melee')![2]).toBe(6);
    expect(calls.find((c: unknown[]) => c[1] === 'magic')![2]).toBe(2);
  });

  it('splits XP across three skills', async () => {
    const results = await splitAndGrantXp('p1', 20, 'melee', { melee: 10, ranged: 5, magic: 5 }, NO_RESOURCES, NO_BOOST);
    expect(results).toHaveLength(3);
    const calls = mockGrantSkillXp.mock.calls;
    expect(calls.find((c: unknown[]) => c[1] === 'melee')![2]).toBe(10);
    expect(calls.find((c: unknown[]) => c[1] === 'ranged')![2]).toBe(5);
    expect(calls.find((c: unknown[]) => c[1] === 'magic')![2]).toBe(5);
  });

  it('assigns remainder to highest-contribution skill', async () => {
    const results = await splitAndGrantXp('p1', 3, 'melee', { melee: 1, ranged: 0, magic: 1 }, NO_RESOURCES, NO_BOOST);
    expect(results).toHaveLength(2);
    const calls = mockGrantSkillXp.mock.calls;
    expect(calls.find((c: unknown[]) => c[1] === 'melee')![2]).toBe(2);
    expect(calls.find((c: unknown[]) => c[1] === 'magic')![2]).toBe(1);
  });

  it('handles 1 XP split across 3 skills', async () => {
    const results = await splitAndGrantXp('p1', 1, 'melee', { melee: 5, ranged: 3, magic: 2 }, NO_RESOURCES, NO_BOOST);
    expect(results).toHaveLength(1);
    expect(mockGrantSkillXp).toHaveBeenCalledWith('p1', 'melee', 1, undefined, undefined);
  });

  it('passes guild XP boost through', async () => {
    await splitAndGrantXp('p1', 10, 'melee', { melee: 10, ranged: 0, magic: 0 }, NO_RESOURCES, 0.1);
    expect(mockGrantSkillXp).toHaveBeenCalledWith('p1', 'melee', 10, undefined, 0.1);
  });

  it('total allocated XP always equals input', async () => {
    await splitAndGrantXp('p1', 7, 'melee', { melee: 3, ranged: 0, magic: 4 }, NO_RESOURCES, NO_BOOST);
    const totalAllocated = mockGrantSkillXp.mock.calls.reduce(
      (sum: number, call: unknown[]) => sum + (call[2] as number), 0,
    );
    expect(totalAllocated).toBe(7);
  });

  // --- Resource cost contribution tests ---

  it('grants XP to skill with only resource cost (no damage)', async () => {
    // Magic heals only — 0 damage, but 60 mana spent on magic actions
    // contribution = 0 + 60 * 0.5 = 30
    const results = await splitAndGrantXp('p1', 8, 'melee', { melee: 0, ranged: 0, magic: 0 }, { melee: 0, ranged: 0, magic: 60 }, NO_BOOST);
    expect(results).toHaveLength(1);
    expect(mockGrantSkillXp).toHaveBeenCalledWith('p1', 'magic', 8, undefined, undefined);
  });

  it('blends damage and resource cost for XP split', async () => {
    // melee: 20 dmg + 0 resources = 20 contribution
    // magic: 0 dmg + 40 resources * 0.5 = 20 contribution
    // Equal split: 5 each from 10 XP
    const results = await splitAndGrantXp('p1', 10, 'melee',
      { melee: 20, ranged: 0, magic: 0 },
      { melee: 0, ranged: 0, magic: 40 },
      NO_BOOST,
    );
    expect(results).toHaveLength(2);
    const calls = mockGrantSkillXp.mock.calls;
    expect(calls.find((c: unknown[]) => c[1] === 'melee')![2]).toBe(5);
    expect(calls.find((c: unknown[]) => c[1] === 'magic')![2]).toBe(5);
  });

  it('resource cost gives minor XP share alongside damage-dealing skill', async () => {
    // melee: 30 dmg + 25 stamina cost = 30 + 12.5 = 42.5
    // magic: 0 dmg + 20 mana cost = 0 + 10 = 10
    // total = 52.5 → melee: floor(8*42.5/52.5)=6, magic: floor(8*10/52.5)=1, remainder 1→melee
    const results = await splitAndGrantXp('p1', 8, 'melee',
      { melee: 30, ranged: 0, magic: 0 },
      { melee: 25, ranged: 0, magic: 20 },
      NO_BOOST,
    );
    expect(results).toHaveLength(2);
    const calls = mockGrantSkillXp.mock.calls;
    const melee = calls.find((c: unknown[]) => c[1] === 'melee')![2] as number;
    const magic = calls.find((c: unknown[]) => c[1] === 'magic')![2] as number;
    expect(melee + magic).toBe(8);
    expect(magic).toBeGreaterThanOrEqual(1); // magic gets at least 1 XP from resource cost
  });
});
