import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEncounterMobId, type EncounterMobSlot, type ExpeditionRoundLog } from '@pocketrealm/shared';

const databaseMocks = vi.hoisted(() => ({
  prisma: {
    encounterSite: {
      update: vi.fn(),
    },
    mobFamily: {
      findUnique: vi.fn(),
    },
    mobTemplate: {
      findMany: vi.fn(),
    },
  },
}));

const worldEventMocks = vi.hoisted(() => ({
  getActiveEventsForZone: vi.fn(),
  getActiveWorldWideEvents: vi.fn(),
  computeZoneModifiers: vi.fn(),
}));

vi.mock('@pocketrealm/database', () => ({ prisma: databaseMocks.prisma, Prisma: {} }));
vi.mock('./worldEventService', () => worldEventMocks);

import {
  countEncounterSiteHits,
  loadRoomMobsAsRaidState,
} from './encounterSiteCombatCore';

beforeEach(() => {
  vi.resetAllMocks();
  databaseMocks.prisma.mobFamily.findUnique.mockResolvedValue({ name: 'Spiders' });
  databaseMocks.prisma.mobTemplate.findMany.mockResolvedValue([makeMobTemplateRow()]);
  worldEventMocks.getActiveEventsForZone.mockResolvedValue([]);
  worldEventMocks.getActiveWorldWideEvents.mockResolvedValue([]);
  worldEventMocks.computeZoneModifiers.mockReturnValue({
    mobHpMultiplier: 1,
    mobDamageMultiplier: 1,
  });
});

function makeMobTemplateRow(overrides: Partial<{
  id: string;
  name: string;
  zoneId: string;
  level: number;
  hp: number;
  accuracy: number;
  defence: number;
  magicDefence: number;
  evasion: number;
  damageMin: number;
  damageMax: number;
  damageType: 'physical' | 'magic';
  xpReward: number;
  encounterWeight: number;
  spellPattern: unknown[];
}> = {}) {
  return {
    id: 'web-spinner',
    name: 'Web Spinner',
    zoneId: 'zone-1',
    level: 3,
    hp: 100,
    accuracy: 10,
    defence: 8,
    magicDefence: 6,
    evasion: 4,
    damageMin: 5,
    damageMax: 9,
    damageType: 'physical' as const,
    xpReward: 20,
    encounterWeight: 1,
    spellPattern: [],
    ...overrides,
  };
}

function makeEncounterSlot(
  slot: number,
  role: EncounterMobSlot['role'],
  prefix: EncounterMobSlot['prefix'] = null,
): EncounterMobSlot {
  return {
    slot,
    mobTemplateId: 'web-spinner',
    role,
    prefix,
    status: 'alive',
    room: 1,
  };
}

function makeRoundLog(overrides: Partial<ExpeditionRoundLog['phases']> = {}): ExpeditionRoundLog {
  return {
    round: 1,
    roomIndex: 0,
    phases: {
      playerAttacks: [],
      defences: [],
      mobActions: [],
      healing: [],
      effectTicks: [],
      outcome: { mobsAlive: 0, mobsKilled: 0, playersAlive: 1, playersKnockedOut: 0, roomCleared: false, wipe: false },
      ...overrides,
    },
    telegraphs: [],
  };
}

describe('countEncounterSiteHits', () => {
  it('returns zero for empty rounds', () => {
    const result = countEncounterSiteHits([]);
    expect(result.playerHitsLanded).toBe(0);
    expect(result.mobHitsLanded).toBe(0);
  });

  it('counts player attack hits', () => {
    const log = makeRoundLog({
      playerAttacks: [
        { entryType: 'attack', playerId: 'p1', username: 'u', actionId: 'a', actionLabel: 'A', targetMobId: 'm1', targetMobName: 'M', hitChance: 0.5, hitRollValue: 0.1, attackerHitScore: 10, defenderAvoidScore: 1, hit: true, crit: false, damageRoll: 5, totalDamage: 5, staminaCost: 0, manaCost: 0 },
        { entryType: 'attack', playerId: 'p1', username: 'u', actionId: 'a', actionLabel: 'A', targetMobId: 'm1', targetMobName: 'M', hitChance: 0.5, hitRollValue: 0.9, attackerHitScore: 10, defenderAvoidScore: 1, hit: false, crit: false, staminaCost: 0, manaCost: 0 },
      ],
    });
    const result = countEncounterSiteHits([log]);
    expect(result.playerHitsLanded).toBe(1);
  });

  it('counts splash cascade hits', () => {
    const log = makeRoundLog({
      playerAttacks: [
        {
          entryType: 'attack', playerId: 'p1', username: 'u', actionId: 'a', actionLabel: 'A',
          targetMobId: 'm1', targetMobName: 'M', hitChance: 0.5, hitRollValue: 0.1,
          attackerHitScore: 10, defenderAvoidScore: 1, hit: true, crit: false,
          damageRoll: 5, totalDamage: 5, staminaCost: 0, manaCost: 0,
          splashCascade: [
            { targetMobName: 'M2', hitChance: 0.5, hitRollValue: 0.1, attackerHitScore: 10, defenderAvoidScore: 1, hit: true, crit: false, damageRoll: 5, totalDamage: 5 },
            { targetMobName: 'M3', hitChance: 0.5, hitRollValue: 0.9, attackerHitScore: 10, defenderAvoidScore: 1, hit: false, crit: false },
          ],
        },
      ],
    });
    const result = countEncounterSiteHits([log]);
    // 1 primary hit + 1 splash hit (second splash missed)
    expect(result.playerHitsLanded).toBe(2);
  });

  it('counts mob hits (non-dodged targets with damage)', () => {
    const log = makeRoundLog({
      mobActions: [
        {
          mobId: 'm1', mobName: 'M', actionId: 'a', actionLabel: 'A', targetMode: 'single_target', wasTelegraphed: false,
          targets: [
            { playerId: 'p1', username: 'u', damageTaken: 5, blocked: false, dodged: false, knockedOut: false },
            { playerId: 'p1', username: 'u', damageTaken: 0, blocked: false, dodged: true, knockedOut: false },
          ],
        },
        {
          mobId: 'm2', mobName: 'M2', actionId: 'a', actionLabel: 'A', targetMode: 'single_target', wasTelegraphed: false,
          targets: [
            { playerId: 'p1', username: 'u', damageTaken: 3, blocked: false, dodged: false, knockedOut: false },
          ],
        },
      ],
    });
    const result = countEncounterSiteHits([log]);
    // 2 non-dodged hits with damage, 1 dodged
    expect(result.mobHitsLanded).toBe(2);
  });

  it('ignores exhausted and defensive player actions', () => {
    const log = makeRoundLog({
      playerAttacks: [
        { entryType: 'exhausted', playerId: 'p1', username: 'u', intendedActionId: 'a', intendedActionLabel: 'A', fallbackActionId: 'b', fallbackActionLabel: 'B', reason: 'stamina' },
        { entryType: 'defensive', playerId: 'p1', username: 'u', actionId: 'defend', actionLabel: 'Defend' },
      ] as ExpeditionRoundLog['phases']['playerAttacks'],
    });
    const result = countEncounterSiteHits([log]);
    expect(result.playerHitsLanded).toBe(0);
  });

  it('accumulates across multiple rounds', () => {
    const round1 = makeRoundLog({
      playerAttacks: [
        { entryType: 'attack', playerId: 'p1', username: 'u', actionId: 'a', actionLabel: 'A', targetMobId: 'm1', targetMobName: 'M', hitChance: 0.5, hitRollValue: 0.1, attackerHitScore: 10, defenderAvoidScore: 1, hit: true, crit: false, damageRoll: 5, totalDamage: 5, staminaCost: 0, manaCost: 0 },
      ],
      mobActions: [
        { mobId: 'm1', mobName: 'M', actionId: 'a', actionLabel: 'A', targetMode: 'single_target', wasTelegraphed: false, targets: [{ playerId: 'p1', username: 'u', damageTaken: 3, blocked: false, dodged: false, knockedOut: false }] },
      ],
    });
    const round2 = makeRoundLog({
      playerAttacks: [
        { entryType: 'attack', playerId: 'p1', username: 'u', actionId: 'a', actionLabel: 'A', targetMobId: 'm1', targetMobName: 'M', hitChance: 0.5, hitRollValue: 0.1, attackerHitScore: 10, defenderAvoidScore: 1, hit: true, crit: false, damageRoll: 8, totalDamage: 8, staminaCost: 0, manaCost: 0 },
      ],
      mobActions: [
        { mobId: 'm1', mobName: 'M', actionId: 'a', actionLabel: 'A', targetMode: 'single_target', wasTelegraphed: false, targets: [{ playerId: 'p1', username: 'u', damageTaken: 0, blocked: false, dodged: true, knockedOut: false }] },
      ],
    });
    const result = countEncounterSiteHits([round1, round2]);
    expect(result.playerHitsLanded).toBe(2);
    expect(result.mobHitsLanded).toBe(1); // round 2 mob dodged
  });
});

describe('loadRoomMobsAsRaidState', () => {
  it('applies role modifiers per slot when the same template is trash and elite', async () => {
    const result = await loadRoomMobsAsRaidState(
      [
        makeEncounterSlot(0, 'trash'),
        makeEncounterSlot(1, 'elite'),
      ],
      'zone-1',
      'family-1',
    );

    const trash = result.mobs.find(mob => mob.id === makeEncounterMobId(0));
    const elite = result.mobs.find(mob => mob.id === makeEncounterMobId(1));

    expect(trash).toBeDefined();
    expect(elite).toBeDefined();
    expect(elite!.maxHp).toBeGreaterThan(trash!.maxHp);
    expect(elite!.stats.damageMin).toBeGreaterThan(trash!.stats.damageMin);
    expect(elite!.actionTemplate.map(action => action.actionId)).toEqual([
      'boss_root',
      'boss_physical_attack',
      'elite_venom_strike',
      'boss_physical_attack',
    ]);
    expect(elite!.actionTemplate.map(action => action.targetMode)).toEqual([
      'single_target',
      'single_target',
      'single_target',
      'single_target',
    ]);
    expect(result.mobXpByEncounterMobId[makeEncounterMobId(1)]).toBeGreaterThan(
      result.mobXpByEncounterMobId[makeEncounterMobId(0)]!,
    );
  });

  it('stacks prefixes before role modifiers and keeps XP per encounter mob', async () => {
    const result = await loadRoomMobsAsRaidState(
      [
        makeEncounterSlot(0, 'elite'),
        makeEncounterSlot(1, 'elite', 'gigantic'),
      ],
      'zone-1',
      'family-1',
    );

    const plainElite = result.mobs.find(mob => mob.id === makeEncounterMobId(0));
    const giganticElite = result.mobs.find(mob => mob.id === makeEncounterMobId(1));

    expect(plainElite).toBeDefined();
    expect(giganticElite).toBeDefined();
    expect(giganticElite!.name).toBe('Gigantic Web Spinner');
    expect(giganticElite!.maxHp).toBeGreaterThan(plainElite!.maxHp);
    expect(result.mobXpByEncounterMobId[makeEncounterMobId(1)]).toBeGreaterThan(
      result.mobXpByEncounterMobId[makeEncounterMobId(0)]!,
    );
  });
});
