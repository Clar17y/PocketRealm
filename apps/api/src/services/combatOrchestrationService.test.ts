import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────
vi.mock('./xpService', () => ({
  grantSkillXp: vi.fn(),
}));
vi.mock('./lootService', () => ({
  rollAndGrantLootWithCapacity: vi.fn(),
}));
vi.mock('../utils/routeHelpers.js', () => ({
  recordBestiaryKill: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./guildService', () => ({
  addGuildXp: vi.fn().mockResolvedValue({ level: 1, xp: 0n, leveledUp: false }),
  getPlayerGuildId: vi.fn(),
}));
vi.mock('./progressService', () => ({
  trackProgress: vi.fn().mockResolvedValue([]),
}));
vi.mock('./guildUpgradeService', () => ({
  getPlayerGuildModifiers: vi.fn(),
}));
vi.mock('./combatLogMapper', () => ({
  mapTemplateCombatLog: vi.fn((log: unknown[]) => log),
}));

import {
  splitAndGrantXp,
  buildPlayerTemplateCombatant,
  applyGuildCombatModifiers,
  buildCombatLogResult,
  processCombatVictoryRewards,
} from './combatOrchestrationService';
import { grantSkillXp } from './xpService';
import { rollAndGrantLootWithCapacity } from './lootService';
import { recordBestiaryKill } from '../utils/routeHelpers.js';
import { getPlayerGuildId, addGuildXp } from './guildService';
import { trackProgress } from './progressService';
import { mapTemplateCombatLog } from './combatLogMapper';
import type { CombatantStats } from '@pocketrealm/shared';

const mockGrantSkillXp = grantSkillXp as ReturnType<typeof vi.fn>;
const mockRollAndGrantLoot = rollAndGrantLootWithCapacity as ReturnType<typeof vi.fn>;
const mockRecordBestiaryKill = recordBestiaryKill as ReturnType<typeof vi.fn>;
const mockGetPlayerGuildId = getPlayerGuildId as ReturnType<typeof vi.fn>;
const mockAddGuildXp = addGuildXp as ReturnType<typeof vi.fn>;
const mockTrackProgress = trackProgress as ReturnType<typeof vi.fn>;
const mockMapTemplateCombatLog = mapTemplateCombatLog as ReturnType<typeof vi.fn>;

// ── Test helpers ─────────────────────────────────────────────────────

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

function makeStats(overrides?: Partial<CombatantStats>): CombatantStats {
  return {
    hp: 100, maxHp: 100,
    attack: 10, accuracy: 5,
    defence: 8, magicDefence: 6,
    dodge: 2, evasion: 3,
    damageMin: 5, damageMax: 15,
    speed: 10, damageType: 'physical',
    ...overrides,
  };
}

const NO_DAMAGE = undefined;
const NO_RESOURCES = undefined;
const NO_BOOST = undefined;

// =====================================================================
// splitAndGrantXp (existing tests preserved + new edge cases)
// =====================================================================

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

  it('grants XP to skill with only resource cost (no damage)', async () => {
    const results = await splitAndGrantXp('p1', 8, 'melee', { melee: 0, ranged: 0, magic: 0 }, { melee: 0, ranged: 0, magic: 60 }, NO_BOOST);
    expect(results).toHaveLength(1);
    expect(mockGrantSkillXp).toHaveBeenCalledWith('p1', 'magic', 8, undefined, undefined);
  });

  it('blends damage and resource cost for XP split', async () => {
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
    expect(magic).toBeGreaterThanOrEqual(1);
  });

  // ── New edge cases ──

  it('with 0 XP and single contributing skill still grants 0 XP', async () => {
    const results = await splitAndGrantXp('p1', 0, 'melee', { melee: 10, ranged: 0, magic: 0 }, NO_RESOURCES, NO_BOOST);
    // Single-skill path: calls grantSkillXp with 0 XP, still returns result
    expect(results).toHaveLength(1);
    expect(mockGrantSkillXp).toHaveBeenCalledWith('p1', 'melee', 0, undefined, undefined);
  });

  it('converts guildXpBoost of 0 to undefined (falsy)', async () => {
    await splitAndGrantXp('p1', 5, 'ranged', { melee: 0, ranged: 5, magic: 0 }, NO_RESOURCES, 0);
    // 0 is falsy → should become undefined
    expect(mockGrantSkillXp).toHaveBeenCalledWith('p1', 'ranged', 5, undefined, undefined);
  });

  it('uses ranged as fallback when no damage/resource tracking', async () => {
    await splitAndGrantXp('p1', 15, 'ranged', NO_DAMAGE, NO_RESOURCES, NO_BOOST);
    expect(mockGrantSkillXp).toHaveBeenCalledWith('p1', 'ranged', 15, undefined, undefined);
  });

  it('resource-only with multiple skills splits proportionally', async () => {
    // melee: 0 dmg + 40 * 0.5 = 20 contribution
    // ranged: 0 dmg + 20 * 0.5 = 10 contribution
    // total: 30 → melee gets 2/3, ranged gets 1/3
    await splitAndGrantXp('p1', 30, 'melee',
      { melee: 0, ranged: 0, magic: 0 },
      { melee: 40, ranged: 20, magic: 0 },
      NO_BOOST,
    );
    const calls = mockGrantSkillXp.mock.calls;
    const melee = calls.find((c: unknown[]) => c[1] === 'melee')![2] as number;
    const ranged = calls.find((c: unknown[]) => c[1] === 'ranged')![2] as number;
    expect(melee).toBe(20);
    expect(ranged).toBe(10);
  });
});

// =====================================================================
// buildPlayerTemplateCombatant
// =====================================================================

describe('buildPlayerTemplateCombatant', () => {
  it('builds combatant with all fields populated', () => {
    const stats = makeStats();
    const template = [
      { id: 's1', sortOrder: 0, actionId: 'normal_attack' },
    ];

    const result = buildPlayerTemplateCombatant({
      playerId: 'player-1',
      username: 'TestHero',
      playerStats: stats,
      template,
      stamina: 50, maxStamina: 100, staminaRegenPerRound: 5,
      mana: 30, maxMana: 60, manaRegenPerRound: 3,
      unlockedActions: [],
    });

    expect(result.id).toBe('player-1');
    expect(result.name).toBe('TestHero');
    expect(result.stats).toBe(stats);
    expect(result.template).toBe(template);
    expect(result.stamina).toBe(50);
    expect(result.maxStamina).toBe(100);
    expect(result.staminaRegenPerRound).toBe(5);
    expect(result.mana).toBe(30);
    expect(result.maxMana).toBe(60);
    expect(result.manaRegenPerRound).toBe(3);
  });

  it('includes always-available actions even with empty unlockedActions', () => {
    const result = buildPlayerTemplateCombatant({
      playerId: 'p1',
      username: 'Test',
      playerStats: makeStats(),
      template: [],
      stamina: 0, maxStamina: 0, staminaRegenPerRound: 0,
      mana: 0, maxMana: 0, manaRegenPerRound: 0,
      unlockedActions: [],
    });

    // Always-available actions should be present
    expect(result.actionDefinitions).toHaveProperty('light_attack');
    expect(result.actionDefinitions).toHaveProperty('normal_attack');
    expect(result.actionDefinitions).toHaveProperty('heavy_attack');
    expect(result.actionDefinitions).toHaveProperty('defend');
    expect(result.actionDefinitions).toHaveProperty('counter');
    expect(result.actionDefinitions).toHaveProperty('ward');
    expect(result.actionDefinitions).toHaveProperty('use_hp_potion');
    expect(result.actionDefinitions).toHaveProperty('use_stamina_potion');
    expect(result.actionDefinitions).toHaveProperty('use_mana_potion');
  });

  it('does not include talent actions when not unlocked', () => {
    const result = buildPlayerTemplateCombatant({
      playerId: 'p1',
      username: 'Test',
      playerStats: makeStats(),
      template: [],
      stamina: 0, maxStamina: 0, staminaRegenPerRound: 0,
      mana: 0, maxMana: 0, manaRegenPerRound: 0,
      unlockedActions: [],
    });

    expect(result.actionDefinitions).not.toHaveProperty('power_strike');
    expect(result.actionDefinitions).not.toHaveProperty('cleave');
    expect(result.actionDefinitions).not.toHaveProperty('fire_bolt');
    expect(result.actionDefinitions).not.toHaveProperty('aimed_shot');
  });

  it('includes talent actions when they are in unlockedActions', () => {
    const result = buildPlayerTemplateCombatant({
      playerId: 'p1',
      username: 'Test',
      playerStats: makeStats(),
      template: [],
      stamina: 0, maxStamina: 0, staminaRegenPerRound: 0,
      mana: 0, maxMana: 0, manaRegenPerRound: 0,
      unlockedActions: ['power_strike', 'fire_bolt', 'aimed_shot'],
    });

    expect(result.actionDefinitions).toHaveProperty('power_strike');
    expect(result.actionDefinitions).toHaveProperty('fire_bolt');
    expect(result.actionDefinitions).toHaveProperty('aimed_shot');
    // Still has base actions
    expect(result.actionDefinitions).toHaveProperty('normal_attack');
    // Not unlocked → not present
    expect(result.actionDefinitions).not.toHaveProperty('cleave');
  });

  it('ignores unknown action IDs in unlockedActions (they have no definition)', () => {
    const result = buildPlayerTemplateCombatant({
      playerId: 'p1',
      username: 'Test',
      playerStats: makeStats(),
      template: [],
      stamina: 0, maxStamina: 0, staminaRegenPerRound: 0,
      mana: 0, maxMana: 0, manaRegenPerRound: 0,
      unlockedActions: ['nonexistent_action', 'another_fake'],
    });

    expect(result.actionDefinitions).not.toHaveProperty('nonexistent_action');
    expect(result.actionDefinitions).not.toHaveProperty('another_fake');
    // Base actions still present
    expect(result.actionDefinitions).toHaveProperty('normal_attack');
  });

  it('passes perActionScaling through to combatant', () => {
    const scaling = {
      skillLevels: { melee: 5, ranged: 3, magic: 1 },
      attributes: { strength: 10, dexterity: 8, intelligence: 6 },
      weaponPower: { attack: 15, rangedPower: 0, magicPower: 0 },
      equipmentAccuracy: 2,
      weaponRequiredSkill: 'melee' as const,
    };

    const result = buildPlayerTemplateCombatant({
      playerId: 'p1',
      username: 'Test',
      playerStats: makeStats(),
      template: [],
      stamina: 0, maxStamina: 0, staminaRegenPerRound: 0,
      mana: 0, maxMana: 0, manaRegenPerRound: 0,
      unlockedActions: [],
      perActionScaling: scaling,
    });

    expect(result.perActionScaling).toBe(scaling);
  });

  it('omits perActionScaling when not provided', () => {
    const result = buildPlayerTemplateCombatant({
      playerId: 'p1',
      username: 'Test',
      playerStats: makeStats(),
      template: [],
      stamina: 0, maxStamina: 0, staminaRegenPerRound: 0,
      mana: 0, maxMana: 0, manaRegenPerRound: 0,
      unlockedActions: [],
    });

    expect(result.perActionScaling).toBeUndefined();
  });

  it('includes multiple unlocked melee + ranged + magic talents', () => {
    const result = buildPlayerTemplateCombatant({
      playerId: 'p1',
      username: 'Test',
      playerStats: makeStats(),
      template: [],
      stamina: 0, maxStamina: 0, staminaRegenPerRound: 0,
      mana: 0, maxMana: 0, manaRegenPerRound: 0,
      unlockedActions: [
        'power_strike', 'cleave', 'battle_cry',       // melee
        'aimed_shot', 'crippling_shot',                // ranged
        'fire_bolt', 'minor_heal', 'frost_nova',       // magic
      ],
    });

    // All requested talents present
    expect(result.actionDefinitions).toHaveProperty('power_strike');
    expect(result.actionDefinitions).toHaveProperty('cleave');
    expect(result.actionDefinitions).toHaveProperty('battle_cry');
    expect(result.actionDefinitions).toHaveProperty('aimed_shot');
    expect(result.actionDefinitions).toHaveProperty('crippling_shot');
    expect(result.actionDefinitions).toHaveProperty('fire_bolt');
    expect(result.actionDefinitions).toHaveProperty('minor_heal');
    expect(result.actionDefinitions).toHaveProperty('frost_nova');
  });
});

// =====================================================================
// applyGuildCombatModifiers
// =====================================================================

describe('applyGuildCombatModifiers', () => {
  it('does nothing when both modifiers are 0', () => {
    const stats = makeStats({ damageMin: 10, damageMax: 20, defence: 8, magicDefence: 6 });
    applyGuildCombatModifiers(stats, { combatDamage: 0, defenseBoost: 0 });
    expect(stats.damageMin).toBe(10);
    expect(stats.damageMax).toBe(20);
    expect(stats.defence).toBe(8);
    expect(stats.magicDefence).toBe(6);
  });

  it('applies 10% combat damage boost', () => {
    const stats = makeStats({ damageMin: 10, damageMax: 20 });
    applyGuildCombatModifiers(stats, { combatDamage: 0.1, defenseBoost: 0 });
    expect(stats.damageMin).toBe(11); // round(10 * 1.1) = 11
    expect(stats.damageMax).toBe(22); // round(20 * 1.1) = 22
  });

  it('applies 5% defense boost to both defence and magicDefence', () => {
    const stats = makeStats({ defence: 100, magicDefence: 80 });
    applyGuildCombatModifiers(stats, { combatDamage: 0, defenseBoost: 0.05 });
    expect(stats.defence).toBe(105); // round(100 * 1.05) = 105
    expect(stats.magicDefence).toBe(84); // round(80 * 1.05) = 84
  });

  it('applies both damage and defense boosts simultaneously', () => {
    const stats = makeStats({ damageMin: 10, damageMax: 30, defence: 50, magicDefence: 40 });
    applyGuildCombatModifiers(stats, { combatDamage: 0.2, defenseBoost: 0.1 });
    expect(stats.damageMin).toBe(12); // round(10 * 1.2) = 12
    expect(stats.damageMax).toBe(36); // round(30 * 1.2) = 36
    expect(stats.defence).toBe(55);   // round(50 * 1.1) = 55
    expect(stats.magicDefence).toBe(44); // round(40 * 1.1) = 44
  });

  it('rounds fractional values correctly', () => {
    const stats = makeStats({ damageMin: 7, damageMax: 13, defence: 7, magicDefence: 3 });
    applyGuildCombatModifiers(stats, { combatDamage: 0.15, defenseBoost: 0.15 });
    // round(7 * 1.15) = round(8.05) = 8
    expect(stats.damageMin).toBe(8);
    // round(13 * 1.15) = round(14.95) = 15
    expect(stats.damageMax).toBe(15);
    // round(7 * 1.15) = round(8.05) = 8
    expect(stats.defence).toBe(8);
    // round(3 * 1.15) = round(3.45) = 3
    expect(stats.magicDefence).toBe(3);
  });

  it('mutates the stats object in-place', () => {
    const stats = makeStats({ damageMin: 5, damageMax: 10 });
    const originalRef = stats;
    applyGuildCombatModifiers(stats, { combatDamage: 0.5, defenseBoost: 0 });
    expect(stats).toBe(originalRef); // same object reference
    expect(stats.damageMin).toBe(8); // round(5 * 1.5) = 8
  });

  it('handles very large modifier values', () => {
    const stats = makeStats({ damageMin: 100, damageMax: 200 });
    applyGuildCombatModifiers(stats, { combatDamage: 1.0, defenseBoost: 0 });
    // 100% boost = 2x damage
    expect(stats.damageMin).toBe(200);
    expect(stats.damageMax).toBe(400);
  });

  it('handles 0 base stats with modifiers', () => {
    const stats = makeStats({ damageMin: 0, damageMax: 0, defence: 0, magicDefence: 0 });
    applyGuildCombatModifiers(stats, { combatDamage: 0.5, defenseBoost: 0.5 });
    expect(stats.damageMin).toBe(0);
    expect(stats.damageMax).toBe(0);
    expect(stats.defence).toBe(0);
    expect(stats.magicDefence).toBe(0);
  });

  it('does not modify other stat fields', () => {
    const stats = makeStats({ hp: 100, maxHp: 100, attack: 50, accuracy: 20, dodge: 10, evasion: 15, speed: 12 });
    applyGuildCombatModifiers(stats, { combatDamage: 0.5, defenseBoost: 0.5 });
    expect(stats.hp).toBe(100);
    expect(stats.maxHp).toBe(100);
    expect(stats.attack).toBe(50);
    expect(stats.accuracy).toBe(20);
    expect(stats.dodge).toBe(10);
    expect(stats.evasion).toBe(15);
    expect(stats.speed).toBe(12);
  });
});

// =====================================================================
// buildCombatLogResult
// =====================================================================

describe('buildCombatLogResult', () => {
  beforeEach(() => {
    mockMapTemplateCombatLog.mockClear();
    mockMapTemplateCombatLog.mockImplementation((log: unknown[]) => log.map(e => ({ ...e as object, mapped: true })));
  });

  it('builds complete log result with all fields', () => {
    const logEntries = [{ actor: 'combatantA', combatantAAction: 'normal_attack' }];
    const result = buildCombatLogResult({
      zoneId: 'z1',
      zoneName: 'Dark Forest',
      mob: { id: 'mob1', name: 'Wolf', mobPrefix: 'fierce', mobDisplayName: 'Fierce Wolf' },
      source: 'encounter_site',
      encounterSiteId: 'site1',
      attackSkill: 'melee',
      combatResult: {
        outcome: 'victory',
        combatantAMaxHp: 100,
        combatantBMaxHp: 50,
        log: logEntries,
      },
      rewards: {
        xp: 25,
        baseXp: 20,
        loot: [{ name: 'Wolf Fang', qty: 1 }],
        durabilityLost: [],
        skillXpGrants: [],
      },
      eventModifiers: [{ type: 'damage_up', value: 0.1 }],
    }) as Record<string, unknown>;

    expect(result.zoneId).toBe('z1');
    expect(result.zoneName).toBe('Dark Forest');
    expect(result.mobTemplateId).toBe('mob1');
    expect(result.mobName).toBe('Wolf');
    expect(result.mobPrefix).toBe('fierce');
    expect(result.mobDisplayName).toBe('Fierce Wolf');
    expect(result.source).toBe('encounter_site');
    expect(result.encounterSiteId).toBe('site1');
    expect(result.attackSkill).toBe('melee');
    expect(result.outcome).toBe('victory');
    expect(result.playerMaxHp).toBe(100);
    expect(result.mobMaxHp).toBe(50);
    expect(result.eventModifiers).toEqual([{ type: 'damage_up', value: 0.1 }]);
  });

  it('calls mapTemplateCombatLog on the combat log', () => {
    const rawLog = [
      { actor: 'combatantA', combatantAAction: 'heavy_attack' },
      { actor: 'combatantB', combatantBAction: 'defend' },
    ];

    const result = buildCombatLogResult({
      zoneId: 'z1', zoneName: 'Zone',
      mob: { id: 'm1', name: 'Mob', mobPrefix: null, mobDisplayName: null },
      source: 'combat', encounterSiteId: null, attackSkill: 'melee',
      combatResult: { outcome: 'victory', combatantAMaxHp: 100, combatantBMaxHp: 50, log: rawLog },
      rewards: { xp: 10, baseXp: 10, loot: [], durabilityLost: [], skillXpGrants: [] },
      eventModifiers: [],
    }) as Record<string, unknown>;

    expect(mockMapTemplateCombatLog).toHaveBeenCalledOnce();
    expect(mockMapTemplateCombatLog).toHaveBeenCalledWith(rawLog);
    // Verify mapped entries have the transformation applied by our mock
    const log = result.log as Array<Record<string, unknown>>;
    expect(log[0]).toHaveProperty('mapped', true);
  });

  it('includes potionsConsumed when provided', () => {
    const potions = [{ potionId: 'hp_potion', quantity: 2 }];
    const result = buildCombatLogResult({
      zoneId: 'z1', zoneName: 'Zone',
      mob: { id: 'm1', name: 'Mob', mobPrefix: null, mobDisplayName: null },
      source: 'combat', encounterSiteId: null, attackSkill: 'magic',
      combatResult: { outcome: 'defeat', combatantAMaxHp: 100, combatantBMaxHp: 200, log: [] },
      rewards: { xp: 0, baseXp: 0, loot: [], durabilityLost: [], skillXpGrants: [] },
      eventModifiers: [],
      potionsConsumed: potions,
    }) as Record<string, unknown>;

    expect(result.potionsConsumed).toEqual(potions);
  });

  it('omits potionsConsumed when not provided', () => {
    const result = buildCombatLogResult({
      zoneId: 'z1', zoneName: 'Zone',
      mob: { id: 'm1', name: 'Mob', mobPrefix: null, mobDisplayName: null },
      source: 'combat', encounterSiteId: null, attackSkill: 'ranged',
      combatResult: { outcome: 'victory', combatantAMaxHp: 100, combatantBMaxHp: 50, log: [] },
      rewards: { xp: 0, baseXp: 0, loot: [], durabilityLost: [], skillXpGrants: [] },
      eventModifiers: [],
    }) as Record<string, unknown>;

    expect(result).not.toHaveProperty('potionsConsumed');
  });

  it('handles null mob prefix and display name', () => {
    const result = buildCombatLogResult({
      zoneId: 'z1', zoneName: 'Zone',
      mob: { id: 'm1', name: 'Rat', mobPrefix: null, mobDisplayName: null },
      source: 'ambush', encounterSiteId: null, attackSkill: 'melee',
      combatResult: { outcome: 'victory', combatantAMaxHp: 50, combatantBMaxHp: 20, log: [] },
      rewards: { xp: 5, baseXp: 5, loot: [], durabilityLost: [], skillXpGrants: [] },
      eventModifiers: [],
    }) as Record<string, unknown>;

    expect(result.mobPrefix).toBeNull();
    expect(result.mobDisplayName).toBeNull();
  });

  it('includes rewards object with all fields', () => {
    const rewards = {
      xp: 100,
      baseXp: 80,
      loot: [{ name: 'Iron Sword', qty: 1 }],
      durabilityLost: [{ slot: 'main_hand', lost: 2 }],
      skillXpGrants: [{ skill: 'melee', xp: 50 }],
    };

    const result = buildCombatLogResult({
      zoneId: 'z1', zoneName: 'Zone',
      mob: { id: 'm1', name: 'Mob', mobPrefix: null, mobDisplayName: null },
      source: 'combat', encounterSiteId: null, attackSkill: 'melee',
      combatResult: { outcome: 'victory', combatantAMaxHp: 100, combatantBMaxHp: 50, log: [] },
      rewards,
      eventModifiers: [],
    }) as Record<string, unknown>;

    expect(result.rewards).toEqual(rewards);
  });

  it('handles empty event modifiers', () => {
    const result = buildCombatLogResult({
      zoneId: 'z1', zoneName: 'Zone',
      mob: { id: 'm1', name: 'Mob', mobPrefix: null, mobDisplayName: null },
      source: 'combat', encounterSiteId: null, attackSkill: 'melee',
      combatResult: { outcome: 'victory', combatantAMaxHp: 100, combatantBMaxHp: 50, log: [] },
      rewards: { xp: 0, baseXp: 0, loot: [], durabilityLost: [], skillXpGrants: [] },
      eventModifiers: [],
    }) as Record<string, unknown>;

    expect(result.eventModifiers).toEqual([]);
  });
});

// =====================================================================
// processCombatVictoryRewards
// =====================================================================

describe('processCombatVictoryRewards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGrantSkillXp.mockImplementation((_pid: string, skill: string, rawXp: number) =>
      Promise.resolve(fakeXpResult(skill, rawXp)),
    );
    mockRollAndGrantLoot.mockResolvedValue({
      drops: [],
      overflow: [],
      pendingLootSessionId: null,
    });
    mockGetPlayerGuildId.mockResolvedValue(null);
    mockTrackProgress.mockResolvedValue([]);
  });

  it('returns loot and xp grants from a basic victory', async () => {
    mockRollAndGrantLoot.mockResolvedValue({
      drops: [{ name: 'Bone', quantity: 2 }],
      overflow: [],
      pendingLootSessionId: null,
    });

    const result = await processCombatVictoryRewards({
      playerId: 'p1',
      mob: { id: 'mob1', level: 5, dropChanceMultiplier: 1, xpReward: 20, mobPrefix: null },
      attackSkill: 'melee',
    });

    expect(result.loot).toEqual([{ name: 'Bone', quantity: 2 }]);
    expect(result.xpGrants).toHaveLength(1);
    expect(result.xpGrants[0].skillType).toBe('melee');
    expect(result.pendingLootSessionId).toBeNull();
  });

  it('calls rollAndGrantLootWithCapacity with correct params', async () => {
    await processCombatVictoryRewards({
      playerId: 'p1',
      mob: { id: 'mob1', level: 10, dropChanceMultiplier: 1.5, xpReward: 50, mobPrefix: null },
      attackSkill: 'melee',
    });

    expect(mockRollAndGrantLoot).toHaveBeenCalledWith('p1', 'mob1', 10, 1.5);
  });

  it('clamps negative xpReward to 0', async () => {
    const result = await processCombatVictoryRewards({
      playerId: 'p1',
      mob: { id: 'mob1', level: 1, dropChanceMultiplier: 1, xpReward: -10, mobPrefix: null },
      attackSkill: 'melee',
    });

    // With 0 XP and fallback skill, it should still call grantSkillXp with 0
    // (which results in 0 XP split → either 1 call with 0 or empty array)
    expect(mockGrantSkillXp).toHaveBeenCalledWith('p1', 'melee', 0, undefined, undefined);
  });

  it('records bestiary kill by default', async () => {
    await processCombatVictoryRewards({
      playerId: 'p1',
      mob: { id: 'mob1', level: 5, dropChanceMultiplier: 1, xpReward: 10, mobPrefix: 'fierce' },
      attackSkill: 'melee',
    });

    expect(mockRecordBestiaryKill).toHaveBeenCalledWith('p1', 'mob1', 'fierce');
  });

  it('records bestiary kill when includeBestiary is true', async () => {
    await processCombatVictoryRewards({
      playerId: 'p1',
      mob: { id: 'mob1', level: 5, dropChanceMultiplier: 1, xpReward: 10, mobPrefix: null },
      attackSkill: 'melee',
      includeBestiary: true,
    });

    expect(mockRecordBestiaryKill).toHaveBeenCalledWith('p1', 'mob1', null);
  });

  it('skips bestiary recording when includeBestiary is false', async () => {
    await processCombatVictoryRewards({
      playerId: 'p1',
      mob: { id: 'mob1', level: 5, dropChanceMultiplier: 1, xpReward: 10, mobPrefix: null },
      attackSkill: 'melee',
      includeBestiary: false,
    });

    expect(mockRecordBestiaryKill).not.toHaveBeenCalled();
  });

  it('grants guild XP when player is in a guild', async () => {
    mockGetPlayerGuildId.mockResolvedValue('guild-1');

    await processCombatVictoryRewards({
      playerId: 'p1',
      mob: { id: 'mob1', level: 5, dropChanceMultiplier: 1, xpReward: 10, mobPrefix: null },
      attackSkill: 'melee',
    });

    expect(mockAddGuildXp).toHaveBeenCalledWith('guild-1', expect.any(Number));
  });

  it('does not grant guild XP when player has no guild', async () => {
    mockGetPlayerGuildId.mockResolvedValue(null);

    await processCombatVictoryRewards({
      playerId: 'p1',
      mob: { id: 'mob1', level: 5, dropChanceMultiplier: 1, xpReward: 10, mobPrefix: null },
      attackSkill: 'melee',
    });

    expect(mockAddGuildXp).not.toHaveBeenCalled();
  });

  it('tracks kill_count and kill_family quest progress', async () => {
    await processCombatVictoryRewards({
      playerId: 'p1',
      mob: { id: 'mob1', level: 5, dropChanceMultiplier: 1, xpReward: 10, mobPrefix: null },
      attackSkill: 'melee',
    });

    expect(mockTrackProgress).toHaveBeenCalledWith('p1', 'kill_count', 1);
    expect(mockTrackProgress).toHaveBeenCalledWith('p1', 'kill_family', 1);
  });

  it('tracks kill_prefix progress when mob has a prefix', async () => {
    await processCombatVictoryRewards({
      playerId: 'p1',
      mob: { id: 'mob1', level: 5, dropChanceMultiplier: 1, xpReward: 10, mobPrefix: 'savage' },
      attackSkill: 'melee',
    });

    expect(mockTrackProgress).toHaveBeenCalledWith('p1', 'kill_prefix', 1, { prefix: 'savage' });
  });

  it('does not track kill_prefix when mob has no prefix', async () => {
    await processCombatVictoryRewards({
      playerId: 'p1',
      mob: { id: 'mob1', level: 5, dropChanceMultiplier: 1, xpReward: 10, mobPrefix: null },
      attackSkill: 'melee',
    });

    // Should only call trackProgress twice: kill_count and kill_family
    const prefixCalls = mockTrackProgress.mock.calls.filter(
      (c: unknown[]) => c[1] === 'kill_prefix',
    );
    expect(prefixCalls).toHaveLength(0);
  });

  it('aggregates quest progress from all trackProgress calls', async () => {
    mockTrackProgress
      .mockResolvedValueOnce([{ questId: 'q1', type: 'kill_count', current: 5, target: 10 }])
      .mockResolvedValueOnce([{ questId: 'q2', type: 'kill_family', current: 3, target: 5 }])
      .mockResolvedValueOnce([]);

    const result = await processCombatVictoryRewards({
      playerId: 'p1',
      mob: { id: 'mob1', level: 5, dropChanceMultiplier: 1, xpReward: 10, mobPrefix: 'elite' },
      attackSkill: 'melee',
    });

    expect(result.questProgress).toHaveLength(2);
    expect(result.questProgress[0].questId).toBe('q1');
    expect(result.questProgress[1].questId).toBe('q2');
  });

  it('returns overflow items and pending loot session ID', async () => {
    mockRollAndGrantLoot.mockResolvedValue({
      drops: [{ name: 'Sword', quantity: 1 }],
      overflow: [{ templateName: 'Shield', rarity: 'rare', quantity: 1 }],
      pendingLootSessionId: 'session-123',
    });

    const result = await processCombatVictoryRewards({
      playerId: 'p1',
      mob: { id: 'mob1', level: 5, dropChanceMultiplier: 1, xpReward: 10, mobPrefix: null },
      attackSkill: 'melee',
    });

    expect(result.overflow).toEqual([{ templateName: 'Shield', rarity: 'rare', quantity: 1 }]);
    expect(result.pendingLootSessionId).toBe('session-123');
  });

  it('passes guildXpBoost to splitAndGrantXp', async () => {
    await processCombatVictoryRewards({
      playerId: 'p1',
      mob: { id: 'mob1', level: 5, dropChanceMultiplier: 1, xpReward: 50, mobPrefix: null },
      attackSkill: 'melee',
      guildXpBoost: 0.15,
    });

    // grantSkillXp should receive the boost as the last arg
    expect(mockGrantSkillXp).toHaveBeenCalledWith('p1', 'melee', 50, undefined, 0.15);
  });

  it('passes damage tracking data to XP split', async () => {
    const damageByScalingStat = { melee: 30, ranged: 0, magic: 10 };

    await processCombatVictoryRewards({
      playerId: 'p1',
      mob: { id: 'mob1', level: 5, dropChanceMultiplier: 1, xpReward: 40, mobPrefix: null },
      attackSkill: 'melee',
      damageByScalingStat,
    });

    // With melee: 30, magic: 10 → two skills get XP
    expect(mockGrantSkillXp).toHaveBeenCalledTimes(2);
  });

  it('handles 0 xpReward gracefully', async () => {
    const result = await processCombatVictoryRewards({
      playerId: 'p1',
      mob: { id: 'mob1', level: 1, dropChanceMultiplier: 1, xpReward: 0, mobPrefix: null },
      attackSkill: 'melee',
    });

    // 0 XP → still calls grantSkillXp with 0 (fallback path)
    expect(mockGrantSkillXp).toHaveBeenCalledWith('p1', 'melee', 0, undefined, undefined);
    expect(result.xpGrants).toHaveLength(1);
  });
});
