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

describe('splitAndGrantXp', () => {
  beforeEach(() => {
    mockGrantSkillXp.mockReset();
    mockGrantSkillXp.mockImplementation((_pid: string, skill: string, rawXp: number) =>
      Promise.resolve(fakeXpResult(skill, rawXp)),
    );
  });

  it('grants all XP to fallback skill when no damageByScalingStat', async () => {
    const results = await splitAndGrantXp('p1', 10, 'melee', undefined, undefined);
    expect(results).toHaveLength(1);
    expect(mockGrantSkillXp).toHaveBeenCalledWith('p1', 'melee', 10, undefined, undefined);
  });

  it('grants all XP to fallback skill when total damage is 0', async () => {
    const results = await splitAndGrantXp('p1', 10, 'magic', { melee: 0, ranged: 0, magic: 0 }, undefined);
    expect(results).toHaveLength(1);
    expect(mockGrantSkillXp).toHaveBeenCalledWith('p1', 'magic', 10, undefined, undefined);
  });

  it('grants all XP to single skill when only one type dealt damage', async () => {
    const results = await splitAndGrantXp('p1', 8, 'melee', { melee: 0, ranged: 0, magic: 20 }, undefined);
    expect(results).toHaveLength(1);
    expect(mockGrantSkillXp).toHaveBeenCalledWith('p1', 'magic', 8, undefined, undefined);
  });

  it('splits XP proportionally between two skills', async () => {
    // melee: 9 dmg, magic: 5 dmg → total 14 → melee 5.14→5, magic 2.86→2, remainder 1→melee
    const results = await splitAndGrantXp('p1', 8, 'melee', { melee: 9, ranged: 0, magic: 5 }, undefined);
    expect(results).toHaveLength(2);
    const calls = mockGrantSkillXp.mock.calls;
    const meleeCall = calls.find((c: unknown[]) => c[1] === 'melee');
    const magicCall = calls.find((c: unknown[]) => c[1] === 'magic');
    expect(meleeCall![2]).toBe(6); // floor(8*9/14)=5 + 1 remainder
    expect(magicCall![2]).toBe(2); // floor(8*5/14)=2
  });

  it('splits XP across three skills', async () => {
    // melee: 10, ranged: 5, magic: 5 → total 20
    // melee: floor(20*10/20)=10, ranged: floor(20*5/20)=5, magic: floor(20*5/20)=5
    const results = await splitAndGrantXp('p1', 20, 'melee', { melee: 10, ranged: 5, magic: 5 }, undefined);
    expect(results).toHaveLength(3);
    const calls = mockGrantSkillXp.mock.calls;
    expect(calls.find((c: unknown[]) => c[1] === 'melee')![2]).toBe(10);
    expect(calls.find((c: unknown[]) => c[1] === 'ranged')![2]).toBe(5);
    expect(calls.find((c: unknown[]) => c[1] === 'magic')![2]).toBe(5);
  });

  it('assigns remainder to highest-damage skill', async () => {
    // melee: 1, magic: 1 → total 2 → each gets floor(3*1/2)=1, remainder 1→melee (tied, melee wins)
    const results = await splitAndGrantXp('p1', 3, 'melee', { melee: 1, ranged: 0, magic: 1 }, undefined);
    expect(results).toHaveLength(2);
    const calls = mockGrantSkillXp.mock.calls;
    expect(calls.find((c: unknown[]) => c[1] === 'melee')![2]).toBe(2); // 1 + remainder
    expect(calls.find((c: unknown[]) => c[1] === 'magic')![2]).toBe(1);
  });

  it('handles 1 XP split across 3 skills', async () => {
    // 1 XP total, 3 skills each dealt damage → floor(1*x/total)=0 for each, remainder 1→top skill
    const results = await splitAndGrantXp('p1', 1, 'melee', { melee: 5, ranged: 3, magic: 2 }, undefined);
    // Only melee gets 1 XP (others get 0 and are filtered out)
    expect(results).toHaveLength(1);
    expect(mockGrantSkillXp).toHaveBeenCalledWith('p1', 'melee', 1, undefined, undefined);
  });

  it('passes guild XP boost through', async () => {
    await splitAndGrantXp('p1', 10, 'melee', { melee: 10, ranged: 0, magic: 0 }, 0.1);
    expect(mockGrantSkillXp).toHaveBeenCalledWith('p1', 'melee', 10, undefined, 0.1);
  });

  it('total allocated XP always equals input', async () => {
    // Odd split: 7 XP, melee: 3, magic: 4 → melee floor(7*3/7)=3, magic floor(7*4/7)=4
    await splitAndGrantXp('p1', 7, 'melee', { melee: 3, ranged: 0, magic: 4 }, undefined);
    const totalAllocated = mockGrantSkillXp.mock.calls.reduce(
      (sum: number, call: unknown[]) => sum + (call[2] as number), 0,
    );
    expect(totalAllocated).toBe(7);
  });
});
