import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./systemMessageService.js', () => ({
  emitSystemMessage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./turnBankService.js', () => ({
  spendPlayerTurnsTx: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./equipmentService.js', () => ({
  getEquipmentStats: vi.fn().mockResolvedValue({
    attack: 10, rangedPower: 0, magicPower: 0, armor: 10,
    magicDefence: 5, health: 50, dodge: 5, accuracy: 5,
    critChance: 0.05, critDamage: 1.5, speed: 5,
  }),
}));
vi.mock('./attributesService.js', () => ({
  getPlayerProgressionState: vi.fn().mockResolvedValue({
    attributes: { vitality: 5, strength: 5, dexterity: 5, intelligence: 5, luck: 5, evasion: 5 },
  }),
}));
vi.mock('./combatStatsService.js', () => ({
  getMainHandAttackSkill: vi.fn().mockResolvedValue('melee'),
  getSkillLevel: vi.fn().mockResolvedValue(10),
}));
vi.mock('./hpService.js', () => ({
  getHpState: vi.fn().mockResolvedValue({ currentHp: 100, maxHp: 100, isRecovering: false }),
  setHp: vi.fn().mockResolvedValue(undefined),
  enterRecoveringState: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./bossLootService.js', () => ({
  distributeBossLoot: vi.fn().mockResolvedValue({}),
}));
vi.mock('./combatTemplateService.js', () => ({
  getActiveTemplate: vi.fn().mockResolvedValue([{ actionId: 'normal_attack' }]),
}));
vi.mock('../utils/routeHelpers.js', () => ({
  trackAchievements: vi.fn().mockResolvedValue(undefined),
  calculateFleeWithGold: vi.fn().mockReturnValue({ outcome: 'escape', remainingHp: 1, goldLost: 0 }),
}));

vi.mock('@pocketrealm/game-engine', () => ({
  resolveBossRound: vi.fn().mockReturnValue({
    bossDefeated: false,
    allPlayersDead: false,
    bossHpAfter: 500,
    bossActionId: 'boss_physical_attack',
    bossTargetMode: 'single_target',
    bossTargetPlayerIds: ['p1'],
    participantResults: [{
      playerId: 'p1', actionId: 'normal_attack', wasExhausted: false,
      damageDealt: 100, healingDone: 0, damageTaken: 20, damageAbsorbed: 20,
      hpAfter: 80, staminaAfter: 90, manaAfter: 50, templateRoundAfter: 2,
      isDead: false, hit: true, isCritical: false,
    }],
    threatTableAfter: [{ playerId: 'p1', threat: 100, tauntRoundsRemaining: 0 }],
    bossActiveEffectsAfter: [],
  }),
  buildPlayerCombatStats: vi.fn().mockReturnValue({
    hp: 100, maxHp: 100, attack: 15, defence: 10, magicDefence: 5,
    accuracy: 60, dodge: 10, evasion: 0, speed: 5, damageMin: 5, damageMax: 15,
    critChance: 0.05, critDamage: 1.5, damageType: 'physical',
  }),
  calculateFleeResult: vi.fn().mockReturnValue({ outcome: 'escape', remainingHp: 1 }),
  calculateMaxStamina: vi.fn().mockReturnValue(100),
  calculateStaminaRegenPerRound: vi.fn().mockReturnValue(10),
  calculateMaxMana: vi.fn().mockReturnValue(50),
  calculateManaRegenPerRound: vi.fn().mockReturnValue(5),
  initThreatTable: vi.fn().mockReturnValue([{ playerId: 'p1', threat: 0, tauntRoundsRemaining: 0 }]),
}));

import { mockPrisma } from '../__test__/setup';
import {
  createBossEncounter,
  signUpForBossRound,
  getBossEncounterStatus,
  resolveBossRound,
  checkAndResolveDueBossRounds,
  getActiveBossEncounters,
  getBossHistory,
} from './bossEncounterService';
import { emitSystemMessage } from './systemMessageService';
import { setHp, enterRecoveringState } from './hpService';
import { distributeBossLoot } from './bossLootService';
import { logger } from '../logger';
import { trackAchievements, calculateFleeWithGold } from '../utils/routeHelpers.js';
import { resolveBossRound as resolveBossRoundEngine, initThreatTable } from '@pocketrealm/game-engine';

const defaultEngineResult = {
  bossDefeated: false,
  allPlayersDead: false,
  bossHpAfter: 500,
  bossActionId: 'boss_physical_attack',
  bossTargetMode: 'single_target',
  bossTargetPlayerIds: ['p1'],
  participantResults: [{
    playerId: 'p1', actionId: 'normal_attack', wasExhausted: false,
    damageDealt: 100, healingDone: 0, damageTaken: 20, damageAbsorbed: 20,
    hpAfter: 80, staminaAfter: 90, manaAfter: 50, templateRoundAfter: 2,
    isDead: false, hit: true, isCritical: false,
  }],
  threatTableAfter: [{ playerId: 'p1', threat: 100, tauntRoundsRemaining: 0 }],
  bossActiveEffectsAfter: [],
};

const makeEncounterRow = (overrides: Record<string, any> = {}) => ({
  id: 'enc-1',
  eventId: 'evt-1',
  mobTemplateId: 'mob-1',
  currentHp: 1000,
  maxHp: 1000,
  baseHp: 1000,
  bossEffects: [],
  roundNumber: 0,
  nextRoundAt: new Date('2026-02-20T12:00:00Z'),
  status: 'waiting',
  killedBy: null,
  roundSummaries: null,
  rewardsByPlayer: null,
  ...overrides,
});

const makeParticipantRow = (overrides: Record<string, any> = {}) => ({
  id: 'bp-1',
  encounterId: 'enc-1',
  playerId: 'p1',
  roundNumber: 1,
  turnsCommitted: 200,
  totalDamage: 0,
  totalHealing: 0,
  attacks: 0,
  hits: 0,
  crits: 0,
  autoSignUp: false,
  currentHp: 100,
  currentStamina: 100,
  currentMana: 50,
  threat: 0,
  damageAbsorbed: 0,
  templateRound: 1,
  status: 'alive',
  ...overrides,
});

const makeEncounterWithIncludes = (overrides: Record<string, any> = {}) => ({
  ...makeEncounterRow({ status: 'in_progress' }),
  event: {
    zoneId: 'zone-1',
    title: 'Boss Event',
    zone: { name: 'Dark Forest', difficulty: 3 },
  },
  mobTemplate: {
    id: 'mob-1', name: 'Stone Colossus', level: 10,
    defence: 20, magicDefence: 15, evasion: 5,
    damageMin: 10, damageMax: 25, accuracy: 60,
    hp: 1000, damageType: 'physical', bossAoeDmg: 50,
  },
  ...overrides,
});

describe('bossEncounterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default engine mock for each test (clearAllMocks only clears call history)
    vi.mocked(resolveBossRoundEngine).mockReturnValue(defaultEngineResult as any);
    vi.mocked(initThreatTable).mockReturnValue([{ playerId: 'p1', threat: 0, tauntRoundsRemaining: 0 }]);
    vi.mocked(calculateFleeWithGold).mockReturnValue({ outcome: 'escape', remainingHp: 1, goldLost: 0 } as any);
  });

  describe('createBossEncounter', () => {
    it('creates an encounter with correct data', async () => {
      mockPrisma.bossEncounter.create.mockResolvedValue(makeEncounterRow());

      await createBossEncounter('evt-1', 'mob-1', 1000);

      expect(mockPrisma.bossEncounter.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId: 'evt-1',
          mobTemplateId: 'mob-1',
          currentHp: 1000,
          maxHp: 1000,
          baseHp: 1000,
          roundNumber: 0,
          status: 'waiting',
        }),
      });
    });

    it('sets nextRoundAt based on BOSS_INITIAL_WAIT_MINUTES', async () => {
      mockPrisma.bossEncounter.create.mockResolvedValue(makeEncounterRow());

      await createBossEncounter('evt-1', 'mob-1', 1000);

      const createCall = mockPrisma.bossEncounter.create.mock.calls[0][0];
      expect(createCall.data.nextRoundAt).toBeInstanceOf(Date);
      // nextRoundAt should be in the future
      expect(createCall.data.nextRoundAt.getTime()).toBeGreaterThan(Date.now() - 1000);
    });
  });

  describe('signUpForBossRound', () => {
    it('throws if encounter not found', async () => {
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(null);

      await expect(signUpForBossRound('enc-1', 'p1', 100))
        .rejects.toThrow('Boss encounter not found');
    });

    it('throws if encounter is defeated', async () => {
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(
        makeEncounterRow({ status: 'defeated' }),
      );

      await expect(signUpForBossRound('enc-1', 'p1', 100))
        .rejects.toThrow('Boss encounter is already over');
    });

    it('throws if encounter is expired', async () => {
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(
        makeEncounterRow({ status: 'expired' }),
      );

      await expect(signUpForBossRound('enc-1', 'p1', 100))
        .rejects.toThrow('Boss encounter is already over');
    });

    it('creates a new participant with turn cost when not already signed up', async () => {
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(
        makeEncounterRow({ status: 'in_progress' }),
      );
      mockPrisma.bossParticipant.findUnique.mockResolvedValue(null);
      const participantRow = makeParticipantRow();
      mockPrisma.bossParticipant.create.mockResolvedValue(participantRow);
      mockPrisma.bossEncounter.update.mockResolvedValue({});

      const result = await signUpForBossRound('enc-1', 'p1', 100);

      expect(result.playerId).toBe('p1');
      expect(result.status).toBe('alive');
    });

    it('updates autoSignUp if player already signed up for this round', async () => {
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(
        makeEncounterRow({ status: 'in_progress' }),
      );
      mockPrisma.bossParticipant.findUnique.mockResolvedValue(
        makeParticipantRow(),
      );
      mockPrisma.bossParticipant.update.mockResolvedValue(
        makeParticipantRow({ autoSignUp: true }),
      );

      const result = await signUpForBossRound('enc-1', 'p1', 100);

      expect(mockPrisma.bossParticipant.update).toHaveBeenCalledWith({
        where: { id: 'bp-1' },
        data: { autoSignUp: false },
      });
      expect(result.autoSignUp).toBe(true);
      // Should NOT spend turns again
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('transitions waiting encounter to in_progress on first signup', async () => {
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(
        makeEncounterRow({ status: 'waiting' }),
      );
      mockPrisma.bossParticipant.findUnique.mockResolvedValue(null);
      mockPrisma.bossParticipant.create.mockResolvedValue(makeParticipantRow());
      mockPrisma.bossEncounter.update.mockResolvedValue({});

      await signUpForBossRound('enc-1', 'p1', 100);

      expect(mockPrisma.bossEncounter.update).toHaveBeenCalledWith({
        where: { id: 'enc-1' },
        data: { status: 'in_progress' },
      });
    });

    it('does not transition status when encounter is already in_progress', async () => {
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(
        makeEncounterRow({ status: 'in_progress' }),
      );
      mockPrisma.bossParticipant.findUnique.mockResolvedValue(null);
      mockPrisma.bossParticipant.create.mockResolvedValue(makeParticipantRow());

      await signUpForBossRound('enc-1', 'p1', 100);

      expect(mockPrisma.bossEncounter.update).not.toHaveBeenCalled();
    });

  });

  describe('getBossEncounterStatus', () => {
    it('returns null if encounter not found', async () => {
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(null);

      const result = await getBossEncounterStatus('enc-1');
      expect(result).toBeNull();
    });

    it('returns encounter and participants', async () => {
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(makeEncounterRow());
      mockPrisma.bossParticipant.findMany.mockResolvedValue([
        makeParticipantRow(),
        makeParticipantRow({ id: 'bp-2', playerId: 'p2' }),
      ]);

      const result = await getBossEncounterStatus('enc-1');

      expect(result).not.toBeNull();
      expect(result!.participants).toHaveLength(2);
    });
  });

  describe('resolveBossRound', () => {
    // --- Setup helpers ---
    function setupBasicRound(encounterOverrides: Record<string, any> = {}, signups = [makeParticipantRow()]) {
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(
        makeEncounterWithIncludes(encounterOverrides),
      );
      mockPrisma.bossParticipant.findMany.mockResolvedValue(signups);
      mockPrisma.bossEncounter.update.mockResolvedValue({});
      mockPrisma.bossEncounter.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.bossParticipant.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.$queryRaw.mockResolvedValue([]);
    }

    // --- Null returns ---

    it('returns null if encounter not found', async () => {
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(null);
      const result = await resolveBossRound('enc-1', null);
      expect(result).toBeNull();
    });

    it('returns null if encounter status is defeated', async () => {
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(
        makeEncounterWithIncludes({ status: 'defeated' }),
      );
      const result = await resolveBossRound('enc-1', null);
      expect(result).toBeNull();
    });

    it('returns null if encounter status is expired', async () => {
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(
        makeEncounterWithIncludes({ status: 'expired' }),
      );
      const result = await resolveBossRound('enc-1', null);
      expect(result).toBeNull();
    });

    it('returns null if no signups for the next round', async () => {
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(
        makeEncounterWithIncludes(),
      );
      mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
      const result = await resolveBossRound('enc-1', null);
      expect(result).toBeNull();
    });

    it('returns null if optimistic lock fails (updateMany count=0)', async () => {
      setupBasicRound();
      mockPrisma.bossEncounter.updateMany.mockResolvedValue({ count: 0 });

      const result = await resolveBossRound('enc-1', null);
      expect(result).toBeNull();
    });

    // --- HP scaling ---

    it('scales boss HP based on participant count and zone tier', async () => {
      // Zone difficulty=3 -> tierIndex=2 -> BOSS_HP_PER_PLAYER_BY_TIER[2]=600
      // 1 participant -> scaledMaxHp = 600 * 1 = 600
      setupBasicRound();

      await resolveBossRound('enc-1', null);

      // The HP scaling update call
      expect(mockPrisma.bossEncounter.update).toHaveBeenCalledWith({
        where: { id: 'enc-1' },
        data: expect.objectContaining({
          maxHp: 600,
          scaledAt: expect.any(Date),
        }),
      });
    });

    it('scales HP proportionally to current HP percentage', async () => {
      // encounter has currentHp=500, maxHp=1000 -> 50% HP
      // Zone difficulty=3, 1 player -> scaledMaxHp=600
      // scaledCurrentHp = round(600 * 0.5) = 300
      setupBasicRound({ currentHp: 500 });

      await resolveBossRound('enc-1', null);

      expect(mockPrisma.bossEncounter.update).toHaveBeenCalledWith({
        where: { id: 'enc-1' },
        data: expect.objectContaining({
          maxHp: 600,
          currentHp: 300,
        }),
      });
    });

    it('scales HP with multiple participants', async () => {
      // 2 participants at tier 3 (index 2): 600 * 2 = 1200
      const signups = [
        makeParticipantRow({ playerId: 'p1' }),
        makeParticipantRow({ id: 'bp-2', playerId: 'p2' }),
      ];
      vi.mocked(initThreatTable).mockReturnValue([
        { playerId: 'p1', threat: 0, tauntRoundsRemaining: 0 },
        { playerId: 'p2', threat: 0, tauntRoundsRemaining: 0 },
      ]);
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        participantResults: [
          { ...defaultEngineResult.participantResults[0], playerId: 'p1' },
          { ...defaultEngineResult.participantResults[0], playerId: 'p2' },
        ],
        threatTableAfter: [
          { playerId: 'p1', threat: 50, tauntRoundsRemaining: 0 },
          { playerId: 'p2', threat: 50, tauntRoundsRemaining: 0 },
        ],
      } as any);
      setupBasicRound({}, signups);

      await resolveBossRound('enc-1', null);

      expect(mockPrisma.bossEncounter.update).toHaveBeenCalledWith({
        where: { id: 'enc-1' },
        data: expect.objectContaining({ maxHp: 1200 }),
      });
    });

    it('clamps tierIndex to 0-4 for zones with difficulty > 5', async () => {
      setupBasicRound({
        event: { zoneId: 'z1', title: 'Boss', zone: { name: 'Hell', difficulty: 10 } },
      });

      await resolveBossRound('enc-1', null);

      // tierIndex = min(4, 10-1) = 4 -> BOSS_HP_PER_PLAYER_BY_TIER[4] = 1500
      expect(mockPrisma.bossEncounter.update).toHaveBeenCalledWith({
        where: { id: 'enc-1' },
        data: expect.objectContaining({ maxHp: 1500 }),
      });
    });

    it('defaults zone difficulty to 1 when zone is null', async () => {
      setupBasicRound({
        event: { zoneId: null, title: 'Boss', zone: null },
      });

      await resolveBossRound('enc-1', null);

      // tierIndex = max(0, min(4, 1-1)) = 0 -> BOSS_HP_PER_PLAYER_BY_TIER[0] = 150
      expect(mockPrisma.bossEncounter.update).toHaveBeenCalledWith({
        where: { id: 'enc-1' },
        data: expect.objectContaining({ maxHp: 150 }),
      });
    });

    it('sets hpPercent to 1 when encounter maxHp is 0', async () => {
      setupBasicRound({ maxHp: 0, currentHp: 0 });

      await resolveBossRound('enc-1', null);

      // hpPercent = 1 -> scaledCurrentHp = round(scaledMaxHp * 1) = scaledMaxHp
      const updateCall = mockPrisma.bossEncounter.update.mock.calls[0][0];
      expect(updateCall.data.currentHp).toBe(updateCall.data.maxHp);
    });

    // --- Engine invocation ---

    it('calls game engine with correctly built boss state and participants', async () => {
      setupBasicRound();

      await resolveBossRound('enc-1', null);

      expect(resolveBossRoundEngine).toHaveBeenCalledTimes(1);
      const input = vi.mocked(resolveBossRoundEngine).mock.calls[0][0];
      expect(input.boss.stats.defence).toBe(20);
      expect(input.boss.stats.magicDefence).toBe(15);
      expect(input.boss.stats.accuracy).toBe(60);
      expect(input.boss.roundNumber).toBe(1);
      expect(input.participants).toHaveLength(1);
      expect(input.participants[0].playerId).toBe('p1');
    });

    it('carries forward threat values from signups into threat table', async () => {
      setupBasicRound({}, [makeParticipantRow({ threat: 75 })]);

      await resolveBossRound('enc-1', null);

      const input = vi.mocked(resolveBossRoundEngine).mock.calls[0][0];
      // The threat table should have been mutated to carry forward 75
      const entry = input.threatTable.find((e: any) => e.playerId === 'p1');
      expect(entry?.threat).toBe(75);
    });

    it('uses fallback boss template when mob name not in BOSS_TEMPLATES', async () => {
      setupBasicRound({
        mobTemplate: {
          id: 'mob-1', name: 'Unknown Boss', level: 5,
          defence: 10, magicDefence: 10, evasion: 5,
          damageMin: 5, damageMax: 15, accuracy: 50,
          hp: 500, damageType: 'magic', bossAoeDmg: 30,
        },
      });

      await resolveBossRound('enc-1', null);

      const input = vi.mocked(resolveBossRoundEngine).mock.calls[0][0];
      // Fallback: single boss_physical_attack action
      expect(input.boss.template).toEqual([{ actionId: 'boss_physical_attack', targetMode: 'single_target' }]);
      expect(input.boss.stats.damageType).toBe('magic');
    });

    it('handles non-array bossEffects in encounter by defaulting to empty array', async () => {
      setupBasicRound({ bossEffects: 'invalid' });

      await resolveBossRound('enc-1', null);

      const input = vi.mocked(resolveBossRoundEngine).mock.calls[0][0];
      expect(input.boss.activeEffects).toEqual([]);
    });

    // --- Optimistic lock and persistence ---

    it('uses optimistic lock on roundNumber in updateMany', async () => {
      setupBasicRound({ roundNumber: 3 });

      await resolveBossRound('enc-1', null);

      expect(mockPrisma.bossEncounter.updateMany).toHaveBeenCalledWith({
        where: { id: 'enc-1', roundNumber: 3 },
        data: expect.objectContaining({
          roundNumber: 4,
          currentHp: 500,
          status: 'in_progress',
        }),
      });
    });

    it('persists per-participant results with correct increments', async () => {
      setupBasicRound();

      await resolveBossRound('enc-1', null);

      expect(mockPrisma.bossParticipant.updateMany).toHaveBeenCalledWith({
        where: { encounterId: 'enc-1', playerId: 'p1', roundNumber: 1 },
        data: expect.objectContaining({
          totalDamage: { increment: 100 },
          totalHealing: { increment: 0 },
          hits: { increment: 1 },
          crits: { increment: 0 },
          currentHp: 80,
          currentStamina: 90,
          currentMana: 50,
          threat: 100,
          damageAbsorbed: { increment: 20 },
          templateRound: 2,
          status: 'alive',
        }),
      });
    });

    it('sets participant status to knocked_out when isDead is true', async () => {
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        participantResults: [{
          ...defaultEngineResult.participantResults[0],
          isDead: true,
          hpAfter: 0,
        }],
      } as any);
      setupBasicRound();

      await resolveBossRound('enc-1', null);

      expect(mockPrisma.bossParticipant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'knocked_out' }),
        }),
      );
    });

    it('stores bossActiveEffectsAfter via JSON serialization', async () => {
      const effects = [{ effectId: 'weaken', duration: 2 }];
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        bossActiveEffectsAfter: effects,
      } as any);
      setupBasicRound();

      await resolveBossRound('enc-1', null);

      const updateCall = mockPrisma.bossEncounter.updateMany.mock.calls[0][0];
      expect(updateCall.data.bossEffects).toEqual(effects);
    });

    it('appends round summary to existing summaries', async () => {
      const existingSummaries = [{ round: 1, bossDamage: 50, totalPlayerDamage: 200, bossHpPercent: 80, playersAlive: 1, playersDead: 0 }];
      setupBasicRound({ roundNumber: 1, roundSummaries: existingSummaries });

      await resolveBossRound('enc-1', null);

      const updateCall = mockPrisma.bossEncounter.updateMany.mock.calls[0][0];
      const summaries = updateCall.data.roundSummaries;
      expect(summaries).toHaveLength(2);
      expect(summaries[0].round).toBe(1);
      expect(summaries[1].round).toBe(2);
    });

    it('calculates round summary fields correctly', async () => {
      setupBasicRound();

      await resolveBossRound('enc-1', null);

      const updateCall = mockPrisma.bossEncounter.updateMany.mock.calls[0][0];
      const summaries = updateCall.data.roundSummaries;
      expect(summaries[0]).toEqual({
        round: 1,
        bossDamage: 20, // damageTaken from participantResults
        totalPlayerDamage: 100,
        bossHpPercent: 83, // 500/600 * 100
        playersAlive: 1,
        playersDead: 0,
      });
    });

    // --- Boss rotation reveal ---

    it('reveals boss rotation to alive players via $queryRaw', async () => {
      setupBasicRound();

      await resolveBossRound('enc-1', null);

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it('does not reveal rotation when all players are dead', async () => {
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        allPlayersDead: true,
        participantResults: [{
          ...defaultEngineResult.participantResults[0],
          isDead: true,
          hpAfter: 0,
        }],
      } as any);
      setupBasicRound();

      await resolveBossRound('enc-1', null);

      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    // --- In-progress round (no defeat, no wipe) ---

    it('emits zone system message with HP percentage for in-progress round', async () => {
      const io = {} as any;
      setupBasicRound();

      await resolveBossRound('enc-1', io);

      expect(emitSystemMessage).toHaveBeenCalledWith(
        io, 'zone', 'zone:zone-1',
        expect.stringContaining('83% HP remaining'),
      );
    });

    it('returns bossDefeated false and roundResult for normal round', async () => {
      setupBasicRound();

      const result = await resolveBossRound('enc-1', null);

      expect(result).not.toBeNull();
      expect(result!.bossDefeated).toBe(false);
      expect(result!.roundResult).toBe(defaultEngineResult);
    });

    // --- Auto-signup ---

    it('creates auto-signup for next round with carried-forward resources', async () => {
      const signups = [makeParticipantRow({ autoSignUp: true })];
      setupBasicRound({}, signups);
      mockPrisma.bossParticipant.create.mockResolvedValue(makeParticipantRow({ roundNumber: 2 }));

      await resolveBossRound('enc-1', null);

      expect(mockPrisma.bossParticipant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          encounterId: 'enc-1',
          playerId: 'p1',
          roundNumber: 2,
          currentHp: 80,
          currentStamina: 90,
          currentMana: 50,
          autoSignUp: true,
          status: 'alive',
        }),
      });
    });

    it('skips auto-signup for dead players', async () => {
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        participantResults: [{
          ...defaultEngineResult.participantResults[0],
          isDead: true,
          hpAfter: 0,
        }],
      } as any);
      const signups = [makeParticipantRow({ autoSignUp: true })];
      setupBasicRound({}, signups);

      await resolveBossRound('enc-1', null);

      // No bossParticipant.create should be called for auto-signup
      expect(mockPrisma.bossParticipant.create).not.toHaveBeenCalled();
    });

    it('does not auto-signup when boss is defeated', async () => {
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        bossDefeated: true,
        bossHpAfter: 0,
      } as any);
      const signups = [makeParticipantRow({ autoSignUp: true })];
      setupBasicRound({}, signups);
      // Mocks for defeat flow
      mockPrisma.worldEvent.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.player.findUnique.mockResolvedValue({ username: 'Hero' });
      mockPrisma.player.findMany.mockResolvedValue([]);

      await resolveBossRound('enc-1', null);

      // No auto-signup create
      expect(mockPrisma.bossParticipant.create).not.toHaveBeenCalled();
    });

    it('silently skips auto-signup when player has insufficient turns', async () => {
      const { AppError } = await import('../middleware/errorHandler.js');
      const { spendPlayerTurnsTx } = await import('./turnBankService.js');
      vi.mocked(spendPlayerTurnsTx).mockRejectedValueOnce(
        new AppError(400, 'Insufficient turns', 'INSUFFICIENT_TURNS'),
      );

      const signups = [makeParticipantRow({ autoSignUp: true })];
      setupBasicRound({}, signups);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Should not throw
      const result = await resolveBossRound('enc-1', null);
      expect(result).not.toBeNull();
      // INSUFFICIENT_TURNS is expected — should NOT log an error
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('logs unexpected errors in boss auto-signup', async () => {
      const { spendPlayerTurnsTx } = await import('./turnBankService.js');
      vi.mocked(spendPlayerTurnsTx).mockRejectedValueOnce(new Error('DB connection lost'));

      const signups = [makeParticipantRow({ autoSignUp: true })];
      setupBasicRound({}, signups);

      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);

      // Should not throw — but should log the unexpected error
      const result = await resolveBossRound('enc-1', null);
      expect(result).not.toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ playerId: 'p1' }),
        'Boss auto-signup failed unexpectedly',
      );
      errorSpy.mockRestore();
    });

    it('does not auto-signup when autoSignUp is false', async () => {
      const signups = [makeParticipantRow({ autoSignUp: false })];
      setupBasicRound({}, signups);

      await resolveBossRound('enc-1', null);

      expect(mockPrisma.bossParticipant.create).not.toHaveBeenCalled();
    });

    // --- Raid wipe ---

    it('handles raid wipe: processes flee for all participants', async () => {
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        allPlayersDead: true,
        participantResults: [{
          ...defaultEngineResult.participantResults[0],
          isDead: true,
          hpAfter: 0,
        }],
      } as any);
      setupBasicRound();

      const result = await resolveBossRound('enc-1', null);

      expect(calculateFleeWithGold).toHaveBeenCalledWith('p1', expect.objectContaining({
        mobLevel: 10,
      }));
      expect(result!.bossDefeated).toBe(false);
    });

    it('calls setHp on escape outcome during wipe', async () => {
      vi.mocked(calculateFleeWithGold).mockReturnValue({ outcome: 'escape', remainingHp: 5, goldLost: 0 } as any);
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        allPlayersDead: true,
        participantResults: [{
          ...defaultEngineResult.participantResults[0],
          isDead: true,
          hpAfter: 0,
        }],
      } as any);
      setupBasicRound();

      await resolveBossRound('enc-1', null);

      expect(setHp).toHaveBeenCalledWith('p1', 5);
      expect(enterRecoveringState).not.toHaveBeenCalled();
    });

    it('calls enterRecoveringState on knockout outcome during wipe', async () => {
      vi.mocked(calculateFleeWithGold).mockReturnValue({ outcome: 'knockout', remainingHp: 0, goldLost: 0 } as any);
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        allPlayersDead: true,
        participantResults: [{
          ...defaultEngineResult.participantResults[0],
          isDead: true,
          hpAfter: 0,
        }],
      } as any);
      setupBasicRound();

      await resolveBossRound('enc-1', null);

      expect(enterRecoveringState).toHaveBeenCalledWith('p1', 100);
      expect(trackAchievements).toHaveBeenCalledWith('p1', { totalDeaths: 1 });
    });

    it('resets encounter to waiting status on raid wipe', async () => {
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        allPlayersDead: true,
        participantResults: [{
          ...defaultEngineResult.participantResults[0],
          isDead: true,
          hpAfter: 0,
        }],
      } as any);
      setupBasicRound();

      await resolveBossRound('enc-1', null);

      // Second update call should reset to waiting
      const updateCalls = mockPrisma.bossEncounter.update.mock.calls;
      const wipeUpdate = updateCalls.find((c: any) => c[0].data.status === 'waiting');
      expect(wipeUpdate).toBeTruthy();
      expect(wipeUpdate![0].data.scaledAt).toBeNull();
    });

    it('emits world and zone system messages on raid wipe', async () => {
      const io = {} as any;
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        allPlayersDead: true,
        participantResults: [{
          ...defaultEngineResult.participantResults[0],
          isDead: true,
          hpAfter: 0,
        }],
      } as any);
      setupBasicRound();

      await resolveBossRound('enc-1', io);

      expect(emitSystemMessage).toHaveBeenCalledWith(
        io, 'world', 'world',
        expect.stringContaining('wiped'),
      );
      expect(emitSystemMessage).toHaveBeenCalledWith(
        io, 'zone', 'zone:zone-1',
        expect.stringContaining('wiped'),
      );
    });

    it('uses "unknown" zone name in wipe message when zone is null', async () => {
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        allPlayersDead: true,
        participantResults: [{
          ...defaultEngineResult.participantResults[0],
          isDead: true,
          hpAfter: 0,
        }],
      } as any);
      setupBasicRound({
        event: { zoneId: null, title: 'Boss', zone: null },
      });

      await resolveBossRound('enc-1', null);

      expect(emitSystemMessage).toHaveBeenCalledWith(
        null, 'world', 'world',
        expect.stringContaining('unknown'),
      );
    });

    it('skips zone message on wipe when zoneId is null', async () => {
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        allPlayersDead: true,
        participantResults: [{
          ...defaultEngineResult.participantResults[0],
          isDead: true,
          hpAfter: 0,
        }],
      } as any);
      setupBasicRound({
        event: { zoneId: null, title: 'Boss', zone: null },
      });

      await resolveBossRound('enc-1', null);

      // Only one system message (world), not zone
      expect(emitSystemMessage).toHaveBeenCalledTimes(1);
      expect(emitSystemMessage).toHaveBeenCalledWith(null, 'world', 'world', expect.any(String));
    });

    // --- Boss defeated ---

    it('sets encounter status to defeated and resolves killedBy', async () => {
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        bossDefeated: true,
        bossHpAfter: 0,
        participantResults: [{
          ...defaultEngineResult.participantResults[0],
          damageDealt: 200,
        }],
      } as any);
      setupBasicRound();
      // All participants query for killedBy
      mockPrisma.bossParticipant.findMany
        .mockResolvedValueOnce([makeParticipantRow()]) // signups
        .mockResolvedValueOnce([
          makeParticipantRow({ totalDamage: 50 }),
        ]); // allParticipantsForKill
      mockPrisma.worldEvent.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.player.findUnique.mockResolvedValue({ username: 'Hero' });
      mockPrisma.player.findMany.mockResolvedValue([]);

      const result = await resolveBossRound('enc-1', null);

      expect(result!.bossDefeated).toBe(true);
      expect(mockPrisma.bossEncounter.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'defeated',
            killedBy: 'p1',
          }),
        }),
      );
    });

    it('distributes loot on boss defeat', async () => {
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        bossDefeated: true,
        bossHpAfter: 0,
      } as any);
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(
        makeEncounterWithIncludes(),
      );
      mockPrisma.bossEncounter.update.mockResolvedValue({});
      mockPrisma.bossEncounter.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.bossParticipant.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.$queryRaw.mockResolvedValue([]);
      // findMany calls: 1) signups, 2) allParticipantsForKill, 3) allParticipants for loot
      mockPrisma.bossParticipant.findMany
        .mockResolvedValueOnce([makeParticipantRow()]) // signups
        .mockResolvedValueOnce([makeParticipantRow({ totalDamage: 100 })]) // allParticipantsForKill
        .mockResolvedValueOnce([makeParticipantRow({ totalDamage: 100 })]); // allParticipants for loot
      mockPrisma.worldEvent.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.player.findUnique.mockResolvedValue({ username: 'Hero' });
      mockPrisma.player.findMany.mockResolvedValue([]);

      await resolveBossRound('enc-1', null);

      expect(distributeBossLoot).toHaveBeenCalledWith(
        'mob-1',
        10, // mob level
        expect.arrayContaining([
          expect.objectContaining({ playerId: 'p1' }),
        ]),
        3, // zoneTier (zone difficulty = 3)
      );
    });

    it('marks world event as completed on boss defeat', async () => {
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        bossDefeated: true,
        bossHpAfter: 0,
      } as any);
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(makeEncounterWithIncludes());
      mockPrisma.bossEncounter.update.mockResolvedValue({});
      mockPrisma.bossEncounter.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.bossParticipant.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.bossParticipant.findMany
        .mockResolvedValueOnce([makeParticipantRow()])
        .mockResolvedValueOnce([makeParticipantRow({ totalDamage: 100 })])
        .mockResolvedValueOnce([makeParticipantRow({ totalDamage: 100 })]);
      mockPrisma.worldEvent.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.player.findUnique.mockResolvedValue({ username: 'Hero' });
      mockPrisma.player.findMany.mockResolvedValue([]);

      await resolveBossRound('enc-1', null);

      expect(mockPrisma.worldEvent.updateMany).toHaveBeenCalledWith({
        where: { id: 'evt-1', status: 'active' },
        data: { status: 'completed' },
      });
    });

    it('emits world and zone defeat messages with killer name', async () => {
      const io = {} as any;
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        bossDefeated: true,
        bossHpAfter: 0,
      } as any);
      setupBasicRound();
      mockPrisma.bossParticipant.findMany
        .mockResolvedValueOnce([makeParticipantRow()])
        .mockResolvedValueOnce([makeParticipantRow({ totalDamage: 100 })]);
      mockPrisma.worldEvent.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.player.findUnique.mockResolvedValue({ username: 'Hero' });
      mockPrisma.player.findMany.mockResolvedValue([]);

      await resolveBossRound('enc-1', io);

      expect(emitSystemMessage).toHaveBeenCalledWith(
        io, 'world', 'world',
        expect.stringContaining('Hero dealt the final blow'),
      );
      expect(emitSystemMessage).toHaveBeenCalledWith(
        io, 'zone', 'zone:zone-1',
        expect.stringContaining('has been slain'),
      );
    });

    it('falls back to "unknown" killer when resolveUsername returns null', async () => {
      const io = {} as any;
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        bossDefeated: true,
        bossHpAfter: 0,
      } as any);
      setupBasicRound();
      mockPrisma.bossParticipant.findMany
        .mockResolvedValueOnce([makeParticipantRow()])
        .mockResolvedValueOnce([makeParticipantRow({ totalDamage: 100 })]);
      mockPrisma.worldEvent.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.player.findUnique.mockResolvedValue(null);
      mockPrisma.player.findMany.mockResolvedValue([]);

      await resolveBossRound('enc-1', io);

      expect(emitSystemMessage).toHaveBeenCalledWith(
        io, 'world', 'world',
        expect.stringContaining('unknown dealt the final blow'),
      );
    });

    it('saves rewardsByPlayer to encounter on defeat', async () => {
      const rewards = { p1: { xp: 100, gold: 50, items: [] } };
      vi.mocked(distributeBossLoot).mockResolvedValue(rewards as any);
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        bossDefeated: true,
        bossHpAfter: 0,
      } as any);
      setupBasicRound();
      mockPrisma.bossParticipant.findMany
        .mockResolvedValueOnce([makeParticipantRow()])
        .mockResolvedValueOnce([makeParticipantRow({ totalDamage: 100 })]);
      mockPrisma.worldEvent.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.player.findUnique.mockResolvedValue({ username: 'Hero' });
      mockPrisma.player.findMany.mockResolvedValue([]);

      await resolveBossRound('enc-1', null);

      // Find the update call that sets rewardsByPlayer (not the scaling one)
      const rewardUpdate = mockPrisma.bossEncounter.update.mock.calls.find(
        (c: any) => c[0].data.rewardsByPlayer !== undefined,
      );
      expect(rewardUpdate).toBeTruthy();
      expect(rewardUpdate![0].data.rewardsByPlayer).toEqual(rewards);
    });

    it('determines killedBy from cumulative damage across all rounds', async () => {
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        bossDefeated: true,
        bossHpAfter: 0,
        participantResults: [
          { ...defaultEngineResult.participantResults[0], playerId: 'p1', damageDealt: 50 },
        ],
      } as any);
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(makeEncounterWithIncludes());
      mockPrisma.bossEncounter.update.mockResolvedValue({});
      mockPrisma.bossEncounter.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.bossParticipant.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.$queryRaw.mockResolvedValue([]);
      // findMany calls: 1) signups, 2) allParticipantsForKill, 3) allParticipants for loot
      mockPrisma.bossParticipant.findMany
        .mockResolvedValueOnce([makeParticipantRow()]) // signups
        .mockResolvedValueOnce([
          makeParticipantRow({ playerId: 'p1', totalDamage: 100 }),
          makeParticipantRow({ playerId: 'p2', totalDamage: 200 }),
        ]) // allParticipantsForKill
        .mockResolvedValueOnce([
          makeParticipantRow({ playerId: 'p1', totalDamage: 100 }),
          makeParticipantRow({ playerId: 'p2', totalDamage: 200 }),
        ]); // allParticipants for loot
      mockPrisma.worldEvent.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.player.findUnique.mockResolvedValue({ username: 'BigDps' });
      mockPrisma.player.findMany.mockResolvedValue([]);

      await resolveBossRound('enc-1', null);

      // p2 has 200 cumulative vs p1's 100+50=150
      expect(mockPrisma.bossEncounter.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ killedBy: 'p2' }),
        }),
      );
    });

    it('aggregates contributor stats across multiple participation records', async () => {
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        bossDefeated: true,
        bossHpAfter: 0,
      } as any);
      const participationRows = [
        makeParticipantRow({ totalDamage: 50, totalHealing: 10, damageAbsorbed: 5, status: 'alive' }),
        makeParticipantRow({ id: 'bp-2', roundNumber: 2, totalDamage: 60, totalHealing: 20, damageAbsorbed: 15, status: 'knocked_out' }),
      ];
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(makeEncounterWithIncludes());
      mockPrisma.bossEncounter.update.mockResolvedValue({});
      mockPrisma.bossEncounter.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.bossParticipant.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.$queryRaw.mockResolvedValue([]);
      // findMany calls: 1) signups, 2) allParticipantsForKill, 3) allParticipants for loot
      mockPrisma.bossParticipant.findMany
        .mockResolvedValueOnce([makeParticipantRow()])
        .mockResolvedValueOnce(participationRows) // allParticipantsForKill
        .mockResolvedValueOnce(participationRows); // allParticipants for loot
      mockPrisma.worldEvent.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.player.findUnique.mockResolvedValue({ username: 'Hero' });
      mockPrisma.player.findMany.mockResolvedValue([]);

      await resolveBossRound('enc-1', null);

      expect(distributeBossLoot).toHaveBeenCalledWith(
        'mob-1', 10,
        expect.arrayContaining([
          expect.objectContaining({
            playerId: 'p1',
            totalDamage: 110,
            totalHealing: 30,
            damageAbsorbed: 20,
            roundsSurvived: 1, // only alive rounds count
          }),
        ]),
        expect.any(Number),
      );
    });

    it('skips zone defeat message when zoneId is null', async () => {
      const io = {} as any;
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        bossDefeated: true,
        bossHpAfter: 0,
      } as any);
      setupBasicRound({
        event: { zoneId: null, title: 'Boss', zone: null },
      });
      mockPrisma.bossParticipant.findMany
        .mockResolvedValueOnce([makeParticipantRow()])
        .mockResolvedValueOnce([makeParticipantRow({ totalDamage: 100 })]);
      mockPrisma.worldEvent.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.player.findUnique.mockResolvedValue({ username: 'Hero' });
      mockPrisma.player.findMany.mockResolvedValue([]);

      await resolveBossRound('enc-1', io);

      // Only world message, no zone message
      expect(emitSystemMessage).toHaveBeenCalledTimes(1);
      expect(emitSystemMessage).toHaveBeenCalledWith(io, 'world', 'world', expect.any(String));
    });

    // --- Participant resource building ---

    it('carries forward stamina and mana from signup row', async () => {
      const signups = [makeParticipantRow({ currentHp: 75, currentStamina: 60, currentMana: 30, templateRound: 3 })];
      setupBasicRound({}, signups);

      await resolveBossRound('enc-1', null);

      const input = vi.mocked(resolveBossRoundEngine).mock.calls[0][0];
      expect(input.participants[0].hp).toBe(75);
      expect(input.participants[0].stamina).toBe(60);
      expect(input.participants[0].mana).toBe(30);
      expect(input.participants[0].templateRound).toBe(3);
    });

    // --- Attack count tracking ---

    it('increments attacks for damageDealt > 0', async () => {
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        participantResults: [{
          ...defaultEngineResult.participantResults[0],
          damageDealt: 50,
          hit: true,
        }],
      } as any);
      setupBasicRound();

      await resolveBossRound('enc-1', null);

      expect(mockPrisma.bossParticipant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attacks: { increment: 1 },
          }),
        }),
      );
    });

    it('increments attacks for a miss (hit=false, non-defend action)', async () => {
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        participantResults: [{
          ...defaultEngineResult.participantResults[0],
          damageDealt: 0,
          hit: false,
          actionId: 'normal_attack',
        }],
      } as any);
      setupBasicRound();

      await resolveBossRound('enc-1', null);

      expect(mockPrisma.bossParticipant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attacks: { increment: 1 },
          }),
        }),
      );
    });

    it('does not increment attacks for defend action with no damage', async () => {
      vi.mocked(resolveBossRoundEngine).mockReturnValue({
        ...defaultEngineResult,
        participantResults: [{
          ...defaultEngineResult.participantResults[0],
          damageDealt: 0,
          hit: false,
          actionId: 'defend',
        }],
      } as any);
      setupBasicRound();

      await resolveBossRound('enc-1', null);

      expect(mockPrisma.bossParticipant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attacks: { increment: 0 },
          }),
        }),
      );
    });
  });

  describe('checkAndResolveDueBossRounds', () => {
    it('queries for in_progress encounters past their nextRoundAt', async () => {
      mockPrisma.bossEncounter.findMany.mockResolvedValue([]);

      await checkAndResolveDueBossRounds(null);

      expect(mockPrisma.bossEncounter.findMany).toHaveBeenCalledWith({
        where: {
          status: 'in_progress',
          nextRoundAt: { lte: expect.any(Date) },
        },
        select: { id: true },
      });
    });

    it('does nothing when no encounters are due', async () => {
      mockPrisma.bossEncounter.findMany.mockResolvedValue([]);

      await checkAndResolveDueBossRounds(null);

      // findMany called once for the due check, no further calls
      expect(mockPrisma.bossEncounter.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('getActiveBossEncounters', () => {
    it('returns active encounters ordered by nextRoundAt', async () => {
      const rows = [
        makeEncounterRow({ id: 'enc-1', status: 'waiting' }),
        makeEncounterRow({ id: 'enc-2', status: 'in_progress' }),
      ];
      mockPrisma.bossEncounter.findMany.mockResolvedValue(rows);

      const result = await getActiveBossEncounters();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('enc-1');
      expect(result[1].id).toBe('enc-2');
    });

    it('queries for waiting, in_progress, and recently defeated encounters', async () => {
      mockPrisma.bossEncounter.findMany.mockResolvedValue([]);

      await getActiveBossEncounters();

      expect(mockPrisma.bossEncounter.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { status: { in: ['waiting', 'in_progress'] } },
            { status: 'defeated', nextRoundAt: { gt: expect.any(Date) } },
          ],
        },
        orderBy: { nextRoundAt: 'asc' },
      });
    });

    it('returns empty array when no active encounters exist', async () => {
      mockPrisma.bossEncounter.findMany.mockResolvedValue([]);

      const result = await getActiveBossEncounters();
      expect(result).toEqual([]);
    });
  });

  describe('getBossHistory', () => {
    it('returns empty entries when player has no participation', async () => {
      mockPrisma.bossParticipant.findMany.mockResolvedValue([]);

      const result = await getBossHistory('p1', 1, 10);

      expect(result.entries).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns paginated history with player stats', async () => {
      mockPrisma.bossParticipant.findMany
        // First call: distinct encounter IDs
        .mockResolvedValueOnce([{ encounterId: 'enc-1' }])
        // Second call: player participation rows
        .mockResolvedValueOnce([
          makeParticipantRow({ totalDamage: 150, attacks: 3, hits: 2, crits: 1 }),
        ]);

      mockPrisma.bossEncounter.findMany.mockResolvedValue([
        makeEncounterRow({
          killedBy: 'p1',
          status: 'defeated',
          event: { zone: { name: 'Dark Forest' } },
          mobTemplate: { name: 'Dragon', level: 10 },
        }),
      ]);

      mockPrisma.player.findMany.mockResolvedValue([
        { id: 'p1', username: 'Hero' },
      ]);

      const result = await getBossHistory('p1', 1, 10);

      expect(result.total).toBe(1);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].mobName).toBe('Dragon');
      expect(result.entries[0].mobLevel).toBe(10);
      expect(result.entries[0].zoneName).toBe('Dark Forest');
      expect(result.entries[0].killedByUsername).toBe('Hero');
      expect(result.entries[0].playerStats.totalDamage).toBe(150);
      expect(result.entries[0].playerStats.attacks).toBe(3);
      expect(result.entries[0].playerStats.hits).toBe(2);
      expect(result.entries[0].playerStats.crits).toBe(1);
      expect(result.entries[0].playerStats.roundsParticipated).toBe(1);
    });

    it('aggregates stats across multiple rounds', async () => {
      mockPrisma.bossParticipant.findMany
        .mockResolvedValueOnce([{ encounterId: 'enc-1' }])
        .mockResolvedValueOnce([
          makeParticipantRow({ roundNumber: 1, totalDamage: 100, attacks: 2, hits: 1, crits: 0 }),
          makeParticipantRow({ id: 'bp-2', roundNumber: 2, totalDamage: 200, attacks: 3, hits: 3, crits: 1 }),
        ]);

      mockPrisma.bossEncounter.findMany.mockResolvedValue([
        makeEncounterRow({
          killedBy: null,
          status: 'defeated',
          event: { zone: { name: 'Cave' } },
          mobTemplate: { name: 'Golem', level: 5 },
        }),
      ]);

      mockPrisma.player.findMany.mockResolvedValue([]);

      const result = await getBossHistory('p1', 1, 10);

      const stats = result.entries[0].playerStats;
      expect(stats.totalDamage).toBe(300);
      expect(stats.attacks).toBe(5);
      expect(stats.hits).toBe(4);
      expect(stats.crits).toBe(1);
      expect(stats.roundsParticipated).toBe(2);
    });

    it('paginates correctly', async () => {
      mockPrisma.bossParticipant.findMany
        .mockResolvedValueOnce([
          { encounterId: 'enc-1' },
          { encounterId: 'enc-2' },
          { encounterId: 'enc-3' },
        ])
        .mockResolvedValueOnce([
          makeParticipantRow({ encounterId: 'enc-2' }),
        ]);

      mockPrisma.bossEncounter.findMany.mockResolvedValue([
        makeEncounterRow({
          id: 'enc-2',
          status: 'defeated',
          killedBy: null,
          event: { zone: { name: 'Swamp' } },
          mobTemplate: { name: 'Troll', level: 3 },
        }),
      ]);

      mockPrisma.player.findMany.mockResolvedValue([]);

      // Page 2 with pageSize 1 should return only enc-2
      const result = await getBossHistory('p1', 2, 1);

      expect(result.total).toBe(3);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].encounter.id).toBe('enc-2');
    });

    it('returns null killedByUsername when killedBy is null', async () => {
      mockPrisma.bossParticipant.findMany
        .mockResolvedValueOnce([{ encounterId: 'enc-1' }])
        .mockResolvedValueOnce([makeParticipantRow()]);

      mockPrisma.bossEncounter.findMany.mockResolvedValue([
        makeEncounterRow({
          killedBy: null,
          status: 'in_progress',
          event: { zone: { name: 'Forest' } },
          mobTemplate: { name: 'Wolf', level: 2 },
        }),
      ]);

      const result = await getBossHistory('p1', 1, 10);
      expect(result.entries[0].killedByUsername).toBeNull();
    });

    it('uses "Unknown" zone when zone is null', async () => {
      mockPrisma.bossParticipant.findMany
        .mockResolvedValueOnce([{ encounterId: 'enc-1' }])
        .mockResolvedValueOnce([makeParticipantRow()]);

      mockPrisma.bossEncounter.findMany.mockResolvedValue([
        makeEncounterRow({
          killedBy: null,
          status: 'defeated',
          event: { zone: null },
          mobTemplate: { name: 'Ghost', level: 1 },
        }),
      ]);

      mockPrisma.player.findMany.mockResolvedValue([]);

      const result = await getBossHistory('p1', 1, 10);
      expect(result.entries[0].zoneName).toBe('Unknown');
    });

    it('defaults mob level to 1 when null', async () => {
      mockPrisma.bossParticipant.findMany
        .mockResolvedValueOnce([{ encounterId: 'enc-1' }])
        .mockResolvedValueOnce([makeParticipantRow()]);

      mockPrisma.bossEncounter.findMany.mockResolvedValue([
        makeEncounterRow({
          killedBy: null,
          status: 'defeated',
          event: { zone: { name: 'Cave' } },
          mobTemplate: { name: 'Slime', level: null },
        }),
      ]);

      mockPrisma.player.findMany.mockResolvedValue([]);

      const result = await getBossHistory('p1', 1, 10);
      expect(result.entries[0].mobLevel).toBe(1);
    });

    it('defaults player stats when no participation for encounter', async () => {
      mockPrisma.bossParticipant.findMany
        .mockResolvedValueOnce([{ encounterId: 'enc-1' }])
        .mockResolvedValueOnce([]); // No participation rows for this encounter

      mockPrisma.bossEncounter.findMany.mockResolvedValue([
        makeEncounterRow({
          killedBy: null,
          status: 'defeated',
          event: { zone: { name: 'Mountain' } },
          mobTemplate: { name: 'Dragon', level: 10 },
        }),
      ]);

      mockPrisma.player.findMany.mockResolvedValue([]);

      const result = await getBossHistory('p1', 1, 10);
      expect(result.entries[0].playerStats).toEqual({
        totalDamage: 0,
        totalHealing: 0,
        attacks: 0,
        hits: 0,
        crits: 0,
        roundsParticipated: 0,
      });
    });

    it('skips killedBy username lookup when no encounters have killedBy', async () => {
      mockPrisma.bossParticipant.findMany
        .mockResolvedValueOnce([{ encounterId: 'enc-1' }])
        .mockResolvedValueOnce([makeParticipantRow()]);

      mockPrisma.bossEncounter.findMany.mockResolvedValue([
        makeEncounterRow({
          killedBy: null,
          status: 'in_progress',
          event: { zone: { name: 'Valley' } },
          mobTemplate: { name: 'Bear', level: 4 },
        }),
      ]);

      await getBossHistory('p1', 1, 10);

      // player.findMany should NOT be called when no killedBy IDs
      expect(mockPrisma.player.findMany).not.toHaveBeenCalled();
    });
  });

  // --- Mapper edge cases ---

  describe('toBossEncounterData (via createBossEncounter)', () => {
    it('converts nextRoundAt Date to ISO string', async () => {
      const date = new Date('2026-03-01T10:00:00Z');
      mockPrisma.bossEncounter.create.mockResolvedValue(
        makeEncounterRow({ nextRoundAt: date }),
      );

      const result = await createBossEncounter('evt-1', 'mob-1', 1000);
      expect(result.nextRoundAt).toBe('2026-03-01T10:00:00.000Z');
    });

    it('returns null nextRoundAt when Date is null', async () => {
      mockPrisma.bossEncounter.create.mockResolvedValue(
        makeEncounterRow({ nextRoundAt: null }),
      );

      const result = await createBossEncounter('evt-1', 'mob-1', 1000);
      expect(result.nextRoundAt).toBeNull();
    });

    it('handles non-array bossEffects as empty array', async () => {
      mockPrisma.bossEncounter.create.mockResolvedValue(
        makeEncounterRow({ bossEffects: 'invalid' }),
      );

      const result = await createBossEncounter('evt-1', 'mob-1', 1000);
      expect(result.bossEffects).toEqual([]);
    });

    it('preserves array bossEffects', async () => {
      const effects = [{ name: 'Weaken', stat: 'defence', modifier: -5, roundsRemaining: 2 }];
      mockPrisma.bossEncounter.create.mockResolvedValue(
        makeEncounterRow({ bossEffects: effects }),
      );

      const result = await createBossEncounter('evt-1', 'mob-1', 1000);
      expect(result.bossEffects).toEqual(effects);
    });

    it('parses array roundSummaries correctly', async () => {
      const summaries = [{ round: 1, bossDamage: 50, totalPlayerDamage: 200, bossHpPercent: 80, playersAlive: 1, playersDead: 0 }];
      mockPrisma.bossEncounter.create.mockResolvedValue(
        makeEncounterRow({ roundSummaries: summaries }),
      );

      const result = await createBossEncounter('evt-1', 'mob-1', 1000);
      expect(result.roundSummaries).toEqual(summaries);
    });

    it('returns null roundSummaries for non-array values', async () => {
      mockPrisma.bossEncounter.create.mockResolvedValue(
        makeEncounterRow({ roundSummaries: 'invalid' }),
      );

      const result = await createBossEncounter('evt-1', 'mob-1', 1000);
      expect(result.roundSummaries).toBeNull();
    });

    it('parses rewardsByPlayer object correctly', async () => {
      const rewards = { p1: { loot: [{ itemTemplateId: 'item-1', quantity: 1 }] } };
      mockPrisma.bossEncounter.create.mockResolvedValue(
        makeEncounterRow({ rewardsByPlayer: rewards }),
      );

      const result = await createBossEncounter('evt-1', 'mob-1', 1000);
      expect(result.rewardsByPlayer).toEqual(rewards);
    });

    it('returns null rewardsByPlayer for non-object values', async () => {
      mockPrisma.bossEncounter.create.mockResolvedValue(
        makeEncounterRow({ rewardsByPlayer: 'invalid' }),
      );

      const result = await createBossEncounter('evt-1', 'mob-1', 1000);
      expect(result.rewardsByPlayer).toBeNull();
    });

    it('returns null rewardsByPlayer for array values', async () => {
      mockPrisma.bossEncounter.create.mockResolvedValue(
        makeEncounterRow({ rewardsByPlayer: [1, 2, 3] }),
      );

      const result = await createBossEncounter('evt-1', 'mob-1', 1000);
      expect(result.rewardsByPlayer).toBeNull();
    });
  });
});
