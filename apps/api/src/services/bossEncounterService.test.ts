import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./systemMessageService', () => ({
  emitSystemMessage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./turnBankService', () => ({
  spendPlayerTurnsTx: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./equipmentService', () => ({
  getEquipmentStats: vi.fn().mockResolvedValue({
    attack: 10, rangedPower: 0, magicPower: 0, armor: 10,
    magicDefence: 5, health: 50, dodge: 5, accuracy: 5,
    critChance: 0.05, critDamage: 1.5, speed: 5,
  }),
}));
vi.mock('./attributesService', () => ({
  getPlayerProgressionState: vi.fn().mockResolvedValue({
    attributes: { vitality: 5, strength: 5, dexterity: 5, intelligence: 5, luck: 5, evasion: 5 },
  }),
}));
vi.mock('./combatStatsService', () => ({
  getMainHandAttackSkill: vi.fn().mockResolvedValue('melee'),
  getSkillLevel: vi.fn().mockResolvedValue(10),
}));
vi.mock('./hpService', () => ({
  getHpState: vi.fn().mockResolvedValue({ currentHp: 100, maxHp: 100, isRecovering: false }),
  setHp: vi.fn().mockResolvedValue(undefined),
  enterRecoveringState: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./bossLootService', () => ({
  distributeBossLoot: vi.fn().mockResolvedValue({}),
}));
vi.mock('./combatTemplateService', () => ({
  getActiveTemplate: vi.fn().mockResolvedValue([{ actionId: 'normal_attack' }]),
}));
vi.mock('@adventure/game-engine', () => ({
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
  checkAndResolveDueBossRounds,
  getActiveBossEncounters,
  getBossHistory,
} from './bossEncounterService';

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

describe('bossEncounterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createBossEncounter', () => {
    it('creates an encounter with correct data', async () => {
      const row = makeEncounterRow();
      mockPrisma.bossEncounter.create.mockResolvedValue(row);

      const result = await createBossEncounter('evt-1', 'mob-1', 1000);

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
      expect(result.id).toBe('enc-1');
      expect(result.status).toBe('waiting');
      expect(result.currentHp).toBe(1000);
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

      await expect(signUpForBossRound('enc-1', 'p1', 100, 100, 50))
        .rejects.toThrow('Boss encounter not found');
    });

    it('throws if encounter is defeated', async () => {
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(
        makeEncounterRow({ status: 'defeated' }),
      );

      await expect(signUpForBossRound('enc-1', 'p1', 100, 100, 50))
        .rejects.toThrow('Boss encounter is already over');
    });

    it('throws if encounter is expired', async () => {
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(
        makeEncounterRow({ status: 'expired' }),
      );

      await expect(signUpForBossRound('enc-1', 'p1', 100, 100, 50))
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

      const result = await signUpForBossRound('enc-1', 'p1', 100, 100, 50);

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

      const result = await signUpForBossRound('enc-1', 'p1', 100, 100, 50);

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

      await signUpForBossRound('enc-1', 'p1', 100, 100, 50);

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

      await signUpForBossRound('enc-1', 'p1', 100, 100, 50);

      expect(mockPrisma.bossEncounter.update).not.toHaveBeenCalled();
    });

    it('passes autoSignUp flag through', async () => {
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(
        makeEncounterRow({ status: 'in_progress' }),
      );
      mockPrisma.bossParticipant.findUnique.mockResolvedValue(null);
      mockPrisma.bossParticipant.create.mockResolvedValue(
        makeParticipantRow({ autoSignUp: true }),
      );

      const result = await signUpForBossRound('enc-1', 'p1', 100, 100, 50, true);

      expect(result.autoSignUp).toBe(true);
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
      expect(result!.encounter.id).toBe('enc-1');
      expect(result!.participants).toHaveLength(2);
      expect(result!.participants[0].playerId).toBe('p1');
      expect(result!.participants[1].playerId).toBe('p2');
    });

    it('orders participants by round then damage', async () => {
      mockPrisma.bossEncounter.findUnique.mockResolvedValue(makeEncounterRow());
      mockPrisma.bossParticipant.findMany.mockResolvedValue([]);

      await getBossEncounterStatus('enc-1');

      expect(mockPrisma.bossParticipant.findMany).toHaveBeenCalledWith({
        where: { encounterId: 'enc-1' },
        orderBy: [{ roundNumber: 'asc' }, { totalDamage: 'desc' }],
      });
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
  });
});
