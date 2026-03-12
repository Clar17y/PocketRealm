import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./turnBankService', () => ({
  spendPlayerTurnsTx: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./guildService', () => ({
  addGuildLog: vi.fn().mockResolvedValue(undefined),
  getPlayerGuildId: vi.fn().mockResolvedValue(null),
  isActiveWithinWindow: vi.fn().mockReturnValue(true),
}));
vi.mock('./guildUpgradeService', () => ({
  getPlayerGuildModifiers: vi.fn().mockResolvedValue({
    combatDamage: 0,
    defenseBoost: 0,
    xpBoost: 0,
    gatheringYield: 0,
    craftingCrit: 0,
    treasuryTax: 0,
  }),
}));
vi.mock('./resourceService', () => ({
  getResourceState: vi.fn().mockResolvedValue({
    stamina: { current: 80, max: 100, regenPerSecond: 0.1, regenPerRound: 5 },
    mana: { current: 50, max: 60, regenPerSecond: 0.1, regenPerRound: 3 },
  }),
}));
vi.mock('./skillPointService', () => ({
  getSkillPoints: vi.fn().mockResolvedValue({
    totalPoints: 0,
    allocatedPoints: 0,
    availablePoints: 0,
    allocations: [],
    unlockedActions: [],
  }),
}));
vi.mock('./potionService', () => ({
  templateHasPotionActions: vi.fn().mockReturnValue(false),
  buildPotionPool: vi.fn().mockResolvedValue([]),
}));
vi.mock('./hpService', () => ({
  getHpState: vi.fn().mockResolvedValue({ currentHp: 100, maxHp: 100, isRecovering: false }),
}));
vi.mock('./lootService', () => ({
  rollAndGrantLoot: vi.fn().mockResolvedValue([]),
  enrichLootWithNames: vi.fn().mockResolvedValue([]),
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
  getSkillLevel: vi.fn().mockResolvedValue(10),
  getMainHandAttackSkill: vi.fn().mockResolvedValue('melee'),
  buildPerActionScaling: vi.fn().mockResolvedValue({}),
}));
vi.mock('./combatTemplateService', () => ({
  getActiveTemplate: vi.fn().mockResolvedValue([{ id: 'slot-0', sortOrder: 0, actionId: 'normal_attack' }]),
}));
vi.mock('@pocketrealm/game-engine', async () => {
  const actual = await vi.importActual<typeof import('@pocketrealm/game-engine')>('@pocketrealm/game-engine');
  return {
    ...actual,
    generateExpeditionRooms: vi.fn().mockReturnValue([
      { roomIndex: 0, roomType: 'trash', mobs: [{ id: 'mob-0-0', mobTemplateId: 'tmpl-1', hp: 100, maxHp: 100 }] },
      { roomIndex: 1, roomType: 'elite', mobs: [{ id: 'mob-1-0', mobTemplateId: 'tmpl-1', hp: 200, maxHp: 200 }] },
      { roomIndex: 2, roomType: 'final_boss', mobs: [{ id: 'mob-2-0', mobTemplateId: 'tmpl-1', hp: 500, maxHp: 500 }] },
    ]),
    resolveRaidRound: vi.fn().mockReturnValue({
      mobsAfter: [{ id: 'mob-0-0', hp: 50, maxHp: 100, activeEffects: [] }],
      participantResults: [{
        playerId: 'player-1',
        actionId: 'normal_attack',
        targetMobId: 'mob-0-0',
        wasExhausted: false,
        damageDealt: 50,
        healingDone: 0,
        damageTaken: 10,
        hpAfter: 90,
        staminaAfter: 75,
        manaAfter: 48,
        templateRoundAfter: 2,
        isDead: false,
        hit: true,
        isCritical: false,
        activeEffectsAfter: [],
        potionsConsumed: [],
      }],
      mobActionResults: [{
        mobId: 'mob-0-0',
        actionId: 'boss_physical_attack',
        targetMode: 'single_target',
        targetPlayerIds: ['player-1'],
        damageDealt: 10,
        healingDone: 0,
      }],
      threatTableAfter: [{ playerId: 'player-1', threat: 50, tauntRoundsRemaining: 0 }],
      roomCleared: false,
      allPlayersDead: false,
    }),
  };
});

import { mockPrisma } from '../__test__/setup';
import {
  launchExpedition,
  signUpForExpedition,
  getActiveExpedition,
  getExpeditionStatus,
  checkAndResolveExpeditionRounds,
  resolveExpeditionRound,
  autoResolveRoom,
  handleRoomCleared,
  handleWipe,
  completeExpedition,
  recoverFromKO,
} from './expeditionService';
import { spendPlayerTurnsTx } from './turnBankService';
import { getHpState } from './hpService';
import { resolveRaidRound } from '@pocketrealm/game-engine';

const GUILD_ID = 'guild-1';
const PLAYER_ID = 'player-1';
const EXPEDITION_ID = 'exp-1';

const makeGuildRow = (overrides: Record<string, unknown> = {}) => ({
  id: GUILD_ID,
  name: 'Test Guild',
  tag: 'TG',
  description: null,
  leaderId: PLAYER_ID,
  level: 10,
  xp: 0n,
  memberCount: 5,
  recruitmentMode: 'open',
  minLevelRequirement: 1,
  taxRate: 0,
  specialization: null,
  renown: 0,
  seasonalRenown: 0,
  treasuryTurns: 1_000_000,
  createdAt: new Date(),
  _count: { members: 5 },
  ...overrides,
});

const makeMembershipRow = (overrides: Record<string, unknown> = {}) => ({
  playerId: PLAYER_ID,
  guildId: GUILD_ID,
  role: 'officer',
  joinedAt: new Date(),
  totalTurnsContributed: 0,
  weeklyTurnsContributed: 0,
  lastActiveAt: new Date(),
  guild: makeGuildRow(),
  ...overrides,
});

const makeExpeditionRow = (overrides: Record<string, unknown> = {}) => ({
  id: EXPEDITION_ID,
  guildId: GUILD_ID,
  tier: 1,
  status: 'recruiting',
  currentRoom: 0,
  totalRooms: 3,
  roomDefinitions: [
    { roomIndex: 0, roomType: 'trash', mobs: [{ id: 'mob-0-0', mobTemplateId: 'tmpl-1', hp: 100, maxHp: 100 }] },
    { roomIndex: 1, roomType: 'elite', mobs: [{ id: 'mob-1-0', mobTemplateId: 'tmpl-1', hp: 200, maxHp: 200 }] },
    { roomIndex: 2, roomType: 'final_boss', mobs: [{ id: 'mob-2-0', mobTemplateId: 'tmpl-1', hp: 500, maxHp: 500 }] },
  ],
  roomStartSnapshot: null,
  roundNumber: 0,
  roundSummaries: null,
  nextRoundAt: new Date(Date.now() + 600_000),
  startedAt: new Date(),
  completedAt: null,
  launchedBy: PLAYER_ID,
  themeId: 'spider_nest',
  _count: { members: 0 },
  ...overrides,
});

const makeMobTemplate = (overrides: Record<string, unknown> = {}) => ({
  id: 'mob-tmpl-1',
  name: 'Goblin',
  level: 10,
  hp: 100,
  accuracy: 15,
  defence: 8,
  magicDefence: 5,
  evasion: 3,
  damageMin: 5,
  damageMax: 10,
  damageType: 'physical',
  ...overrides,
});

const makeMemberRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'mem-1',
  expeditionId: EXPEDITION_ID,
  playerId: PLAYER_ID,
  currentHp: 100,
  currentStamina: 80,
  currentMana: 50,
  maxHp: 125,
  maxStamina: 100,
  maxMana: 60,
  templateRound: 1,
  activeEffects: [],
  threatValue: 0,
  isKnockedOut: false,
  totalDamage: 0n,
  totalHealing: 0n,
  roomDamage: 0n,
  roomHealing: 0n,
  signedUpAt: new Date(),
  player: { username: 'TestPlayer' },
  ...overrides,
});

describe('expeditionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // launchExpedition
  // =========================================================================

  describe('launchExpedition', () => {
    it('creates expedition with recruiting status and deducts treasury', async () => {
      mockPrisma.guildMember.findUnique.mockResolvedValue(makeMembershipRow());
      mockPrisma.guildExpedition.findFirst.mockResolvedValue(null); // no active, no weekly, no 24h
      mockPrisma.mobTemplate.findMany.mockResolvedValue([makeMobTemplate()]);
      mockPrisma.guild.update.mockResolvedValue(makeGuildRow());
      mockPrisma.guildExpedition.create.mockResolvedValue(makeExpeditionRow());
      mockPrisma.guildLog.create.mockResolvedValue({});

      const result = await launchExpedition(PLAYER_ID, 1);

      expect(result.status).toBe('recruiting');
      expect(result.tier).toBe(1);
      expect(result.guildId).toBe(GUILD_ID);
      expect(result.launchedBy).toBe(PLAYER_ID);
      // Treasury deduction
      expect(mockPrisma.guild.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: GUILD_ID },
          data: { treasuryTurns: { decrement: 200_000 } },
        }),
      );
    });

    it('rejects non-officer role', async () => {
      mockPrisma.guildMember.findUnique.mockResolvedValue(
        makeMembershipRow({ role: 'member' }),
      );

      await expect(launchExpedition(PLAYER_ID, 1)).rejects.toThrow(
        'Only officers and leaders can launch expeditions',
      );
    });

    it('rejects insufficient treasury', async () => {
      mockPrisma.guildMember.findUnique.mockResolvedValue(
        makeMembershipRow({ guild: makeGuildRow({ treasuryTurns: 100 }) }),
      );
      mockPrisma.guildExpedition.findFirst.mockResolvedValue(null);

      await expect(launchExpedition(PLAYER_ID, 1)).rejects.toThrow(
        'Insufficient guild treasury',
      );
    });

    it('rejects when active expedition exists', async () => {
      mockPrisma.guildMember.findUnique.mockResolvedValue(makeMembershipRow());
      // First findFirst call → active expedition found
      mockPrisma.guildExpedition.findFirst.mockResolvedValueOnce(makeExpeditionRow());

      await expect(launchExpedition(PLAYER_ID, 1)).rejects.toThrow(
        'Guild already has an active expedition',
      );
    });

    it('rejects when weekly tier cooldown not met', async () => {
      mockPrisma.guildMember.findUnique.mockResolvedValue(makeMembershipRow());
      // No active expedition
      mockPrisma.guildExpedition.findFirst.mockResolvedValueOnce(null);
      // Weekly tier cooldown hit
      mockPrisma.guildExpedition.findFirst.mockResolvedValueOnce(
        makeExpeditionRow({ status: 'completed', completedAt: new Date() }),
      );

      await expect(launchExpedition(PLAYER_ID, 1)).rejects.toThrow(
        'Weekly cooldown for this tier has not expired',
      );
    });

    it('rejects invalid tier', async () => {
      await expect(launchExpedition(PLAYER_ID, 0)).rejects.toThrow(
        'Tier must be 1, 2, or 3',
      );
      await expect(launchExpedition(PLAYER_ID, 4)).rejects.toThrow(
        'Tier must be 1, 2, or 3',
      );
    });
  });

  // =========================================================================
  // signUpForExpedition
  // =========================================================================

  describe('signUpForExpedition', () => {
    it('creates member record and deducts turns', async () => {
      mockPrisma.guildExpedition.findUnique.mockResolvedValue(
        makeExpeditionRow(),
      );
      mockPrisma.guildMember.findUnique.mockResolvedValue({
        playerId: PLAYER_ID,
        guildId: GUILD_ID,
        role: 'member',
      });
      mockPrisma.player.findUnique.mockResolvedValue({
        characterLevel: 15,
        username: 'TestPlayer',
      });
      mockPrisma.guildExpeditionMember.findUnique.mockResolvedValue(null);
      mockPrisma.guildExpeditionMember.create.mockResolvedValue(makeMemberRow());

      const result = await signUpForExpedition(EXPEDITION_ID, PLAYER_ID);

      expect(result.playerId).toBe(PLAYER_ID);
      expect(result.username).toBe('TestPlayer');
      expect(mockPrisma.guildExpeditionMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            expeditionId: EXPEDITION_ID,
            playerId: PLAYER_ID,
          }),
        }),
      );
    });

    it('rejects wrong guild', async () => {
      mockPrisma.guildExpedition.findUnique.mockResolvedValue(makeExpeditionRow());
      mockPrisma.guildMember.findUnique.mockResolvedValue({
        playerId: PLAYER_ID,
        guildId: 'different-guild',
        role: 'member',
      });

      await expect(signUpForExpedition(EXPEDITION_ID, PLAYER_ID)).rejects.toThrow(
        'You are not in this guild',
      );
    });

    it('rejects level too low', async () => {
      mockPrisma.guildExpedition.findUnique.mockResolvedValue(makeExpeditionRow());
      mockPrisma.guildMember.findUnique.mockResolvedValue({
        playerId: PLAYER_ID,
        guildId: GUILD_ID,
        role: 'member',
      });
      mockPrisma.player.findUnique.mockResolvedValue({
        characterLevel: 5,
        username: 'TestPlayer',
      });

      await expect(signUpForExpedition(EXPEDITION_ID, PLAYER_ID)).rejects.toThrow(
        'Character level 10 required for tier 1',
      );
    });

    it('rejects already signed up', async () => {
      mockPrisma.guildExpedition.findUnique.mockResolvedValue(makeExpeditionRow());
      mockPrisma.guildMember.findUnique.mockResolvedValue({
        playerId: PLAYER_ID,
        guildId: GUILD_ID,
        role: 'member',
      });
      mockPrisma.player.findUnique.mockResolvedValue({
        characterLevel: 15,
        username: 'TestPlayer',
      });
      mockPrisma.guildExpeditionMember.findUnique.mockResolvedValue(makeMemberRow());

      await expect(signUpForExpedition(EXPEDITION_ID, PLAYER_ID)).rejects.toThrow(
        'Already signed up for this expedition',
      );
    });

    it('rejects expedition not recruiting', async () => {
      mockPrisma.guildExpedition.findUnique.mockResolvedValue(
        makeExpeditionRow({ status: 'in_progress' }),
      );

      await expect(signUpForExpedition(EXPEDITION_ID, PLAYER_ID)).rejects.toThrow(
        'Expedition is not recruiting',
      );
    });

    it('rejects recovering player', async () => {
      mockPrisma.guildExpedition.findUnique.mockResolvedValue(makeExpeditionRow());
      mockPrisma.guildMember.findUnique.mockResolvedValue({
        playerId: PLAYER_ID,
        guildId: GUILD_ID,
        role: 'member',
      });
      mockPrisma.player.findUnique.mockResolvedValue({
        characterLevel: 15,
        username: 'TestPlayer',
      });
      mockPrisma.guildExpeditionMember.findUnique.mockResolvedValue(null);
      vi.mocked(getHpState).mockResolvedValueOnce({
        currentHp: 0,
        maxHp: 100,
        isRecovering: true,
        recoveryCost: 500,
        regenPerSecond: 0.4,
        lastHpRegenAt: new Date().toISOString(),
      });

      await expect(signUpForExpedition(EXPEDITION_ID, PLAYER_ID)).rejects.toThrow(
        'Cannot sign up while recovering',
      );
    });
  });

  // =========================================================================
  // getActiveExpedition
  // =========================================================================

  describe('getActiveExpedition', () => {
    it('returns expedition data when active', async () => {
      mockPrisma.guildExpedition.findFirst.mockResolvedValue(makeExpeditionRow());

      const result = await getActiveExpedition(GUILD_ID);

      expect(result).not.toBeNull();
      expect(result!.guildId).toBe(GUILD_ID);
      expect(result!.status).toBe('recruiting');
    });

    it('returns null when no active expedition', async () => {
      mockPrisma.guildExpedition.findFirst.mockResolvedValue(null);

      const result = await getActiveExpedition(GUILD_ID);
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // getExpeditionStatus
  // =========================================================================

  describe('getExpeditionStatus', () => {
    it('returns expedition with members', async () => {
      mockPrisma.guildExpedition.findUnique.mockResolvedValue(makeExpeditionRow());
      mockPrisma.guildExpeditionMember.findMany.mockResolvedValue([makeMemberRow()]);

      const result = await getExpeditionStatus(EXPEDITION_ID);

      expect(result).not.toBeNull();
      expect(result!.expedition.id).toBe(EXPEDITION_ID);
      expect(result!.members).toHaveLength(1);
      expect(result!.members[0].playerId).toBe(PLAYER_ID);
    });

    it('returns null for nonexistent expedition', async () => {
      mockPrisma.guildExpedition.findUnique.mockResolvedValue(null);

      const result = await getExpeditionStatus('nonexistent');
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // checkAndResolveExpeditionRounds
  // =========================================================================

  describe('checkAndResolveExpeditionRounds', () => {
    it('transitions recruiting to in_progress when enough members', async () => {
      mockPrisma.guildExpedition.findMany.mockResolvedValue([
        makeExpeditionRow({
          status: 'recruiting',
          nextRoundAt: new Date(Date.now() - 1000),
          _count: { members: 5 },
        }),
      ]);
      // getMembers helper calls
      mockPrisma.guildExpeditionMember.findMany.mockResolvedValue([
        makeMemberRow(),
      ]);
      mockPrisma.guildExpedition.update.mockResolvedValue(makeExpeditionRow({ status: 'in_progress' }));
      mockPrisma.guildLog.create.mockResolvedValue({});

      await checkAndResolveExpeditionRounds(null);

      expect(mockPrisma.guildExpedition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: EXPEDITION_ID },
          data: expect.objectContaining({
            status: 'in_progress',
          }),
        }),
      );
    });

    it('fails recruiting expedition with too few members', async () => {
      mockPrisma.guildExpedition.findMany.mockResolvedValue([
        makeExpeditionRow({
          status: 'recruiting',
          nextRoundAt: new Date(Date.now() - 1000),
          _count: { members: 2 },
        }),
      ]);
      mockPrisma.guildExpedition.update.mockResolvedValue(makeExpeditionRow({ status: 'failed' }));
      mockPrisma.guildLog.create.mockResolvedValue({});

      await checkAndResolveExpeditionRounds(null);

      expect(mockPrisma.guildExpedition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: EXPEDITION_ID },
          data: expect.objectContaining({
            status: 'failed',
          }),
        }),
      );
    });
  });

  // =========================================================================
  // resolveExpeditionRound
  // =========================================================================

  describe('resolveExpeditionRound', () => {
    it('resolves a round and updates member HP', async () => {
      const fullRoomDefs = [
        {
          roomIndex: 0, roomType: 'trash',
          mobs: [{
            id: 'mob-0-0', mobTemplateId: 'tmpl-1', name: 'Goblin', prefix: null,
            hp: 100, maxHp: 100,
            stats: { hp: 100, maxHp: 100, attack: 10, accuracy: 10, defence: 5, magicDefence: 3, dodge: 2, evasion: 0, damageMin: 5, damageMax: 10, speed: 0, damageType: 'physical' },
            actionTemplate: [{ actionId: 'boss_physical_attack', targetMode: 'single_target' }],
            activeEffects: [],
          }],
        },
        { roomIndex: 1, roomType: 'elite', mobs: [] },
        { roomIndex: 2, roomType: 'final_boss', mobs: [] },
      ];

      mockPrisma.guildExpedition.findUnique.mockResolvedValue(
        makeExpeditionRow({
          status: 'in_progress',
          roundNumber: 0,
          roomDefinitions: fullRoomDefs,
          members: [makeMemberRow()],
        }),
      );
      mockPrisma.guildExpedition.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.guildExpeditionMember.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.guildExpedition.update.mockResolvedValue({});

      await resolveExpeditionRound(EXPEDITION_ID, null);

      expect(vi.mocked(resolveRaidRound)).toHaveBeenCalled();
      // Atomic optimistic-locked update (roundNumber + roundSummaries + roomDefinitions)
      expect(mockPrisma.guildExpedition.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: EXPEDITION_ID, roundNumber: 0 },
          data: expect.objectContaining({ roundNumber: 1 }),
        }),
      );
      // Member HP updated
      expect(mockPrisma.guildExpeditionMember.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { expeditionId: EXPEDITION_ID, playerId: PLAYER_ID },
          data: expect.objectContaining({
            currentHp: 90,
            currentStamina: 75,
            currentMana: 48,
          }),
        }),
      );
    });
  });

  // =========================================================================
  // handleRoomCleared
  // =========================================================================

  describe('handleRoomCleared', () => {
    it('awards tokens to all members', async () => {
      mockPrisma.guildExpedition.findUnique.mockResolvedValue(
        makeExpeditionRow({
          status: 'in_progress',
          currentRoom: 0,
          totalRooms: 3,
          members: [makeMemberRow()],
        }),
      );
      mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.guild.update.mockResolvedValue({});
      mockPrisma.guildExpeditionMember.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.guildExpeditionMember.findMany.mockResolvedValue([makeMemberRow()]);
      mockPrisma.guildExpeditionMember.update.mockResolvedValue(makeMemberRow());
      mockPrisma.guildExpedition.update.mockResolvedValue({});
      mockPrisma.guildLog.create.mockResolvedValue({});

      await handleRoomCleared(EXPEDITION_ID);

      // Tier 1 trash room tokens: 5 * 1 = 5 (batched via updateMany)
      expect(mockPrisma.player.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [PLAYER_ID] } },
          data: { expeditionTokens: { increment: 5 } },
        }),
      );
      // Guild XP per room
      expect(mockPrisma.guild.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: GUILD_ID },
          data: { xp: { increment: 25 } },
        }),
      );
    });
  });

  // =========================================================================
  // handleWipe
  // =========================================================================

  describe('handleWipe', () => {
    it('resets expedition to recruiting, deletes members, and regenerates rooms', async () => {
      mockPrisma.guildExpedition.findUnique.mockResolvedValue(
        makeExpeditionRow({
          status: 'in_progress',
          wipeCount: 0,
          expeditionAttemptLogs: [],
          members: [{ playerId: PLAYER_ID, totalDamage: 50n, totalHealing: 0n }],
        }),
      );
      mockPrisma.mobTemplate.findMany.mockResolvedValue([makeMobTemplate()]);
      mockPrisma.guildExpeditionMember.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.guildExpedition.update.mockResolvedValue({});
      mockPrisma.guildLog.create.mockResolvedValue({});

      await handleWipe(EXPEDITION_ID);

      // Members deleted for re-signup
      expect(mockPrisma.guildExpeditionMember.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { expeditionId: EXPEDITION_ID },
        }),
      );
      // Expedition reset to recruiting with incremented wipeCount
      expect(mockPrisma.guildExpedition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: EXPEDITION_ID },
          data: expect.objectContaining({
            wipeCount: 1,
            status: 'recruiting',
            currentRoom: 0,
            roundNumber: 0,
          }),
        }),
      );
    });
  });

  // =========================================================================
  // completeExpedition
  // =========================================================================

  describe('completeExpedition', () => {
    it('marks completed and awards bonus tokens', async () => {
      mockPrisma.guildExpedition.findUnique.mockResolvedValue(
        makeExpeditionRow({
          status: 'in_progress',
          members: [makeMemberRow()],
        }),
      );
      mockPrisma.guildExpedition.update.mockResolvedValue({});
      mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.guild.update.mockResolvedValue({});
      mockPrisma.guildLog.create.mockResolvedValue({});

      await completeExpedition(EXPEDITION_ID);

      // Status set to completed
      expect(mockPrisma.guildExpedition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: EXPEDITION_ID },
          data: expect.objectContaining({
            status: 'completed',
          }),
        }),
      );
      // Bonus tokens awarded: (5+8+20) * 1 (tier mult) * 1.0 (bonus mult) = 33 (batched via updateMany)
      expect(mockPrisma.player.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [PLAYER_ID] } },
          data: { expeditionTokens: { increment: 33 } },
        }),
      );
      // Guild XP completion bonus
      expect(mockPrisma.guild.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: GUILD_ID },
          data: { xp: { increment: 100 } },
        }),
      );
    });
  });

  // =========================================================================
  // recoverFromKO
  // =========================================================================

  describe('recoverFromKO', () => {
    it('recovers KO\'d player: deducts turns, restores HP to 30%, clears KO flag', async () => {
      mockPrisma.guildExpedition.findUnique.mockResolvedValue(
        makeExpeditionRow({ status: 'in_progress' }),
      );
      mockPrisma.guildExpeditionMember.findUnique.mockResolvedValue(
        makeMemberRow({ isKnockedOut: true, currentHp: 0 }),
      );
      const updatedMember = makeMemberRow({ isKnockedOut: false, currentHp: 37 });
      mockPrisma.guildExpeditionMember.update.mockResolvedValue(updatedMember);

      const result = await recoverFromKO(EXPEDITION_ID, PLAYER_ID);

      expect(result.isKnockedOut).toBe(false);
      // Turns deducted
      expect(spendPlayerTurnsTx).toHaveBeenCalledWith(
        expect.anything(), // tx
        PLAYER_ID,
        500, // KO_RECOVERY_TURN_COST
      );
      // HP restored to 30% of maxHp and KO flag cleared
      expect(mockPrisma.guildExpeditionMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { expeditionId_playerId: { expeditionId: EXPEDITION_ID, playerId: PLAYER_ID } },
          data: expect.objectContaining({
            isKnockedOut: false,
            currentHp: expect.any(Number),
          }),
        }),
      );
    });

    it('rejects recovery if not knocked out', async () => {
      mockPrisma.guildExpedition.findUnique.mockResolvedValue(
        makeExpeditionRow({ status: 'in_progress' }),
      );
      mockPrisma.guildExpeditionMember.findUnique.mockResolvedValue(
        makeMemberRow({ isKnockedOut: false }),
      );

      await expect(recoverFromKO(EXPEDITION_ID, PLAYER_ID)).rejects.toThrow(
        'Not knocked out',
      );
    });

    it('rejects recovery if not a member', async () => {
      mockPrisma.guildExpedition.findUnique.mockResolvedValue(
        makeExpeditionRow({ status: 'in_progress' }),
      );
      mockPrisma.guildExpeditionMember.findUnique.mockResolvedValue(null);

      await expect(recoverFromKO(EXPEDITION_ID, 'stranger')).rejects.toThrow(
        'Not a member of this expedition',
      );
    });

    it('rejects recovery if expedition not in progress', async () => {
      mockPrisma.guildExpedition.findUnique.mockResolvedValue(
        makeExpeditionRow({ status: 'recruiting' }),
      );

      await expect(recoverFromKO(EXPEDITION_ID, PLAYER_ID)).rejects.toThrow(
        'Expedition is not in progress',
      );
    });
  });

  // =========================================================================
  // autoResolveRoom
  // =========================================================================

  describe('autoResolveRoom', () => {
    const fullRoomDefs = [
      {
        roomIndex: 0, roomType: 'trash', environmentalDotPercent: 0,
        mobs: [{
          id: 'mob-0-0', mobTemplateId: 'tmpl-1', name: 'Goblin', prefix: null,
          hp: 100, maxHp: 100,
          stats: { hp: 100, maxHp: 100, attack: 10, accuracy: 10, defence: 5, magicDefence: 3, dodge: 2, evasion: 0, damageMin: 5, damageMax: 10, speed: 0, damageType: 'physical' },
          actionTemplate: [{ actionId: 'boss_physical_attack', targetMode: 'single_target' }],
          activeEffects: [],
        }],
      },
      { roomIndex: 1, roomType: 'elite', environmentalDotPercent: 0, mobs: [] },
      { roomIndex: 2, roomType: 'final_boss', environmentalDotPercent: 0, mobs: [] },
    ];

    const inProgressExpedition = (overrides: Record<string, unknown> = {}) =>
      makeExpeditionRow({
        status: 'in_progress',
        roundNumber: 0,
        roomDefinitions: fullRoomDefs,
        members: [makeMemberRow()],
        ...overrides,
      });

    it('rejects when expedition is not in_progress', async () => {
      mockPrisma.guildExpedition.findUnique.mockResolvedValue(
        makeExpeditionRow({ status: 'recruiting', members: [makeMemberRow()] }),
      );

      await expect(autoResolveRoom(EXPEDITION_ID)).rejects.toThrow('Expedition is not active');
    });

    it('rejects when roundNumber is not 0', async () => {
      mockPrisma.guildExpedition.findUnique.mockResolvedValue(
        inProgressExpedition({ roundNumber: 3 }),
      );

      await expect(autoResolveRoom(EXPEDITION_ID)).rejects.toThrow('Room already has rounds resolved');
    });

    it('resolves room clear with bonus tokens', async () => {
      // Mock resolveRaidRound to clear room on first call
      vi.mocked(resolveRaidRound).mockReturnValueOnce({
        mobsAfter: [{ id: 'mob-0-0', hp: 0, maxHp: 100, activeEffects: [], actionTemplate: [] }],
        participantResults: [{
          playerId: PLAYER_ID, actionId: 'normal_attack', targetMobId: 'mob-0-0',
          wasExhausted: false, damageDealt: 100, healingDone: 0, damageTaken: 5,
          hpAfter: 95, staminaAfter: 70, manaAfter: 45,
          templateRoundAfter: 2, isDead: false, hit: true, isCritical: false,
          activeEffectsAfter: [], potionsConsumed: [],
        }],
        mobActionResults: [],
        threatTableAfter: [{ playerId: PLAYER_ID, threat: 100, tauntRoundsRemaining: 0 }],
        roomCleared: true,
        allPlayersDead: false,
        roundLog: { round: 1, roomIndex: 0, phases: { playerAttacks: [], healing: [], mobActions: [], dots: [], outcome: { mobsKilled: 1, playersKnockedOut: 0, roomCleared: true, wipe: false } } },
        allPotionsConsumed: [],
      } as any);

      mockPrisma.guildExpedition.findUnique.mockResolvedValue(inProgressExpedition());
      mockPrisma.guildExpedition.update.mockResolvedValue({});
      mockPrisma.guildExpedition.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.guildExpeditionMember.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.guildExpeditionMember.findMany.mockResolvedValue([makeMemberRow()]);
      mockPrisma.guildExpeditionMember.update.mockResolvedValue(makeMemberRow());
      mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.guild.update.mockResolvedValue({});
      mockPrisma.guildLog.create.mockResolvedValue({});
      mockPrisma.mobTemplate.findMany.mockResolvedValue([]);

      const result = await autoResolveRoom(EXPEDITION_ID);

      expect(result.outcome).toBe('cleared');
      expect(result.roundsResolved).toBe(1);
      expect(result.roundLogs).toHaveLength(1);
      // Bonus tokens: base 5 * tier_mult 1 * 0.25 = 1
      expect(result.tokensAwarded).toBe(6); // 5 base + 1 bonus

      // Verify optimistic lock used roundNumber: 0
      expect(mockPrisma.guildExpedition.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: EXPEDITION_ID, roundNumber: 0 },
        }),
      );
    });

    it('resolves wipe when all players die', async () => {
      vi.mocked(resolveRaidRound).mockReturnValueOnce({
        mobsAfter: [{ id: 'mob-0-0', hp: 80, maxHp: 100, activeEffects: [], actionTemplate: [] }],
        participantResults: [{
          playerId: PLAYER_ID, actionId: 'normal_attack', targetMobId: 'mob-0-0',
          wasExhausted: false, damageDealt: 20, healingDone: 0, damageTaken: 100,
          hpAfter: 0, staminaAfter: 70, manaAfter: 45,
          templateRoundAfter: 2, isDead: true, hit: true, isCritical: false,
          activeEffectsAfter: [], potionsConsumed: [],
        }],
        mobActionResults: [],
        threatTableAfter: [{ playerId: PLAYER_ID, threat: 20, tauntRoundsRemaining: 0 }],
        roomCleared: false,
        allPlayersDead: true,
        roundLog: { round: 1, roomIndex: 0, phases: { playerAttacks: [], healing: [], mobActions: [], dots: [], outcome: { mobsKilled: 0, playersKnockedOut: 1, roomCleared: false, wipe: true } } },
        allPotionsConsumed: [],
      } as any);

      mockPrisma.guildExpedition.findUnique.mockResolvedValue(inProgressExpedition({ wipeCount: 0, expeditionAttemptLogs: [] }));
      mockPrisma.guildExpedition.update.mockResolvedValue({});
      mockPrisma.guildExpedition.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.guildExpeditionMember.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.guildExpeditionMember.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.guildLog.create.mockResolvedValue({});
      mockPrisma.mobTemplate.findMany.mockResolvedValue([]);

      const result = await autoResolveRoom(EXPEDITION_ID);

      expect(result.outcome).toBe('wiped');
      expect(result.roundsResolved).toBe(1);
      expect(result.tokensAwarded).toBe(0);
    });

    it('returns early wipe when no alive members', async () => {
      mockPrisma.guildExpedition.findUnique.mockResolvedValue(
        inProgressExpedition({
          members: [makeMemberRow({ isKnockedOut: true, currentHp: 0 })],
          wipeCount: 0,
          expeditionAttemptLogs: [],
        }),
      );
      mockPrisma.guildExpedition.update.mockResolvedValue({});
      mockPrisma.guildExpeditionMember.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.guildLog.create.mockResolvedValue({});
      mockPrisma.mobTemplate.findMany.mockResolvedValue([]);

      const result = await autoResolveRoom(EXPEDITION_ID);

      expect(result.outcome).toBe('wiped');
      expect(result.roundsResolved).toBe(0);
      expect(result.roundLogs).toHaveLength(0);
      // resolveRaidRound should not have been called
      expect(resolveRaidRound).not.toHaveBeenCalled();
    });

    it('throws on concurrent modification (optimistic lock fails)', async () => {
      vi.mocked(resolveRaidRound).mockReturnValueOnce({
        mobsAfter: [{ id: 'mob-0-0', hp: 0, maxHp: 100, activeEffects: [], actionTemplate: [] }],
        participantResults: [{
          playerId: PLAYER_ID, actionId: 'normal_attack', targetMobId: 'mob-0-0',
          wasExhausted: false, damageDealt: 100, healingDone: 0, damageTaken: 0,
          hpAfter: 100, staminaAfter: 80, manaAfter: 50,
          templateRoundAfter: 2, isDead: false, hit: true, isCritical: false,
          activeEffectsAfter: [], potionsConsumed: [],
        }],
        mobActionResults: [],
        threatTableAfter: [{ playerId: PLAYER_ID, threat: 100, tauntRoundsRemaining: 0 }],
        roomCleared: true,
        allPlayersDead: false,
        roundLog: { round: 1, roomIndex: 0, phases: { playerAttacks: [], healing: [], mobActions: [], dots: [], outcome: { mobsKilled: 1, playersKnockedOut: 0, roomCleared: true, wipe: false } } },
        allPotionsConsumed: [],
      } as any);

      mockPrisma.guildExpedition.findUnique.mockResolvedValue(inProgressExpedition());
      mockPrisma.guildExpedition.update.mockResolvedValue({});
      mockPrisma.guildExpedition.updateMany.mockResolvedValue({ count: 0 }); // Lock failed
      mockPrisma.mobTemplate.findMany.mockResolvedValue([]);

      await expect(autoResolveRoom(EXPEDITION_ID)).rejects.toThrow('Room was modified by another process');
    });
  });
});
