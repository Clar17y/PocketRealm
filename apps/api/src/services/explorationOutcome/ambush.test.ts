import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../../__mocks__/database.js'));
vi.mock('@pocketrealm/game-engine', () => ({
  applyMobEventModifiers: vi.fn((mob: Record<string, unknown>) => mob),
  applyMobPrefix: vi.fn((mob: Record<string, unknown>, prefix: string | null) => ({
    ...mob,
    mobPrefix: prefix,
    mobDisplayName: prefix ? `${prefix} ${mob.name}` : mob.name,
  })),
  buildPlayerCombatStats: vi.fn(() => ({ damageMin: 1, damageMax: 3, defence: 1 })),
  filterAndWeightMobsByTier: vi.fn((mobs: unknown[]) => mobs),
  mobToTemplateCombatant: vi.fn(() => ({ id: 'mob-1' })),
  rollNormalExplorationMobRole: vi.fn(() => 'trash'),
  rollMobPrefix: vi.fn(() => null),
  runTemplateCombat: vi.fn(() => ({
    outcome: 'victory',
    combatantAHpRemaining: 97,
    combatantAMaxHp: 100,
    combatantBMaxHp: 12,
    combatantBHpRemaining: 0,
    combatantAStaminaRemaining: 91,
    combatantAManaRemaining: 42,
    log: [],
    potionsConsumed: [],
    damageByScalingStat: { melee: 10, ranged: 0, magic: 0 },
    resourceCostByScalingStat: { melee: 3, ranged: 0, magic: 0 },
  })),
  selectTierWithBleedthrough: vi.fn((tier: number) => tier),
}));
vi.mock('../buffService', () => ({
  applyCombatBuffs: vi.fn(),
  buildCombatBuffBadges: vi.fn(() => []),
  consumeBuffChargesPerMob: vi.fn(),
}));
vi.mock('../chatActivityService', () => ({
  broadcastRareLootActivity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../combatOrchestrationService', () => ({
  buildCombatLogResult: vi.fn(() => ({})),
  buildPlayerTemplateCombatant: vi.fn(() => ({ id: 'player-1' })),
  processCombatVictoryRewards: vi.fn().mockResolvedValue({
    loot: [],
    overflow: [],
    pendingLootSessionId: null,
    newItemIds: [],
    updatedItemIds: [],
    xpGrants: [{ boostedXpAfterEfficiency: 6 }],
    questProgress: [],
  }),
}));
vi.mock('../combatLogMapper', () => ({
  mapTemplateCombatLog: vi.fn((log: unknown) => log),
}));
vi.mock('../durabilityService', () => ({
  degradeEquippedDurability: vi.fn().mockResolvedValue([]),
  resolveExplorationDurabilityMultiplier: vi.fn().mockReturnValue(1),
}));
vi.mock('../lootService', () => ({
  enrichLootWithNames: vi.fn().mockResolvedValue([]),
}));
vi.mock('../hpService', () => ({
  enterRecoveringState: vi.fn(),
  setHp: vi.fn(),
}));
vi.mock('../persistedMobService', () => ({
  persistMobHp: vi.fn(),
}));
vi.mock('../zoneDiscoveryService', () => ({
  respawnToHomeTown: vi.fn(),
}));
vi.mock('../worldEventService', () => ({
  computeZoneModifiers: vi.fn(() => ({
    mobDamageMultiplier: 1,
    mobHpMultiplier: 1,
    mobSpawnRateMultiplier: 1,
    resourceDropRateMultiplier: 1,
    resourceYieldMultiplier: 1,
  })),
  filterEventModifiers: vi.fn(() => []),
}));
vi.mock('../../utils/routeHelpers.js', () => ({
  buildPveCombatOptions: vi.fn(() => ({ combatMode: 'pve_open_world' })),
  calculateFleeWithGold: vi.fn(),
  serializeXpGrant: vi.fn((grant: unknown) => grant),
  toMobTemplate: vi.fn((raw: Record<string, unknown>) => ({
    ...raw,
    spellPattern: [],
    dropChanceMultiplier: raw.dropChanceMultiplier ?? 1,
  })),
}));

import { mockPrisma } from '../../__test__/setup';
import { mobToTemplateCombatant, rollNormalExplorationMobRole } from '@pocketrealm/game-engine';
import { setHp } from '../hpService';
import { consumeBuffChargesPerMob } from '../buffService';
import { processCombatVictoryRewards } from '../combatOrchestrationService';
import { processAmbushOutcome } from './ambush';
import type { ExplorationOutcomeContext } from './types';

const MOB = {
  id: 'mob-1',
  name: 'Forest Rat',
  zoneId: 'zone-1',
  level: 1,
  hp: 12,
  accuracy: 8,
  defence: 2,
  magicDefence: 1,
  evasion: 3,
  damageMin: 1,
  damageMax: 4,
  xpReward: 6,
  encounterWeight: 100,
  explorationTier: 1,
  dropChanceMultiplier: 1,
};

function buildContext(): ExplorationOutcomeContext {
  return {
    playerId: 'player-1',
    username: 'Explorer',
    zoneId: 'zone-1',
    zone: { id: 'zone-1', name: 'Forest Edge', difficulty: 1 },
    hpState: { currentHp: 100, maxHp: 100 },
    combatPrep: {
      attackSkill: 'melee',
      attackLevel: 1,
      guildMods: {
        combatDamage: 0,
        defenseBoost: 0,
        xpBoost: 0.12,
        travelCostReduction: 0,
        gatheringYield: 0,
        craftingCrit: 0,
        repairCostReduction: 0,
      },
      perActionScaling: {
        skillLevels: { melee: 1, ranged: 1, magic: 1 },
        attributes: { strength: 1, dexterity: 0, intelligence: 0 },
        weaponPower: { attack: 1, rangedPower: 0, magicPower: 0 },
        equipmentAccuracy: 0,
        weaponRequiredSkill: 'melee',
      },
      playerTemplate: [{ id: 'slot-1', sortOrder: 0, actionId: 'light_attack' }],
      potionPool: [],
      resources: {
        stamina: 100,
        maxStamina: 100,
        staminaRegenPerRound: 10,
        mana: 50,
        maxMana: 50,
        manaRegenPerRound: 5,
      },
      unlockedActions: [],
    },
    combatBuffs: { damageBoost: 0, defenceBoost: 0, durabilityShield: 0 },
    buffUsesLeft: { damage: 0, defence: 0, durability: 0 },
    progression: {
      characterXp: 0,
      characterLevel: 1,
      attributePoints: 0,
      attributes: { vitality: 1, strength: 1, dexterity: 1, intelligence: 1, luck: 1, evasion: 1 },
    },
    equipmentStats: {
      attack: 1,
      rangedPower: 0,
      magicPower: 0,
      accuracy: 1,
      armor: 1,
      magicDefence: 0,
      health: 0,
      dodge: 0,
      luck: 0,
      critChance: 0,
      critDamage: 1,
      inventorySlots: 0,
    },
    mobTemplates: [MOB],
    zoneFamilies: [],
    zoneTiers: null,
    selectedTier: 1,
    explorationProgress: { percent: 100, turnsExplored: 30000, turnsToExplore: 30000 },
    zoneModifiers: {
      mobDamageMultiplier: 1,
      mobHpMultiplier: 1,
      mobSpawnRateMultiplier: 1,
      resourceDropRateMultiplier: 1,
      resourceYieldMultiplier: 1,
    },
    spawnMods: { global: 1, byFamily: new Map() },
    mobToFamilyMap: new Map(),
    trackingFamilyId: null,
    prospectingResourceNodeId: null,
    prospectingSkillLevel: null,
    cachedZoneEvents: [],
    cachedWorldEvents: [],
    isTutorialExplore: false,
    resourceNodes: [],
    undiscoveredNeighbors: [],
    thresholdByToId: new Map(),
  };
}

describe('processAmbushOutcome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('leaves victory HP and empty buff state for the caller to persist once after exploration', async () => {
    const events: Parameters<typeof processAmbushOutcome>[0]['events'] = [];

    const result = await processAmbushOutcome({
      ctx: buildContext(),
      outcome: { turnOccurred: 12, type: 'ambush' },
      currentHp: 100,
      currentStamina: 100,
      currentMana: 50,
      buffUsesLeft: { damage: 0, defence: 0, durability: 0 },
      potionPool: [],
      events,
      pendingCombatLogs: [],
      allPotionsConsumed: [],
      ambushPendingLootSessionIds: [],
      allNewItemIds: [],
      allUpdatedItemIds: [],
      allQuestProgress: [],
    });

    expect(result.currentHp).toBe(97);
    expect(setHp).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(consumeBuffChargesPerMob).not.toHaveBeenCalled();
    expect(processCombatVictoryRewards).toHaveBeenCalledWith(
      expect.objectContaining({ guildXpBoost: 0.12 }),
    );
  });

  it('applies normal exploration elite role rolls before resolving ambush combat', async () => {
    vi.mocked(rollNormalExplorationMobRole).mockReturnValueOnce('elite');

    const events: Parameters<typeof processAmbushOutcome>[0]['events'] = [];

    await processAmbushOutcome({
      ctx: buildContext(),
      outcome: { turnOccurred: 12, type: 'ambush' },
      currentHp: 100,
      currentStamina: 100,
      currentMana: 50,
      buffUsesLeft: { damage: 0, defence: 0, durability: 0 },
      potionPool: [],
      events,
      pendingCombatLogs: [],
      allPotionsConsumed: [],
      ambushPendingLootSessionIds: [],
      allNewItemIds: [],
      allUpdatedItemIds: [],
      allQuestProgress: [],
    });

    expect(rollNormalExplorationMobRole).toHaveBeenCalledOnce();
    expect(mobToTemplateCombatant).toHaveBeenCalledWith(expect.objectContaining({
      hp: 19,
      damageMin: 1,
      damageMax: 5,
      xpReward: 8,
      mobDisplayName: 'Elite Forest Rat',
    }));
    expect(events[0]?.description).toContain('Elite Forest Rat');
  });
});
