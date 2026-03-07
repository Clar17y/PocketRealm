import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./turnBankService', () => ({
  spendPlayerTurnsTx: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./guildService', () => ({
  addGuildLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./hpService', () => ({
  getHpState: vi.fn().mockResolvedValue({ currentHp: 100, maxHp: 100, isRecovering: false }),
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
}));
vi.mock('@pocketrealm/game-engine', async () => {
  const actual = await vi.importActual<typeof import('@pocketrealm/game-engine')>('@pocketrealm/game-engine');
  return {
    ...actual,
    generateExpeditionRooms: vi.fn().mockReturnValue([
      { roomIndex: 0, roomType: 'trash', mobs: [{ id: 'mob-0-0', hp: 100, maxHp: 100 }] },
      { roomIndex: 1, roomType: 'elite', mobs: [{ id: 'mob-1-0', hp: 200, maxHp: 200 }] },
      { roomIndex: 2, roomType: 'final_boss', mobs: [{ id: 'mob-2-0', hp: 500, maxHp: 500 }] },
    ]),
  };
});

import { mockPrisma } from '../__test__/setup';
import {
  launchExpedition,
  signUpForExpedition,
  getActiveExpedition,
  getExpeditionStatus,
} from './expeditionService';
import { getHpState } from './hpService';

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
    { roomIndex: 0, roomType: 'trash', mobs: [{ id: 'mob-0-0', hp: 100, maxHp: 100 }] },
    { roomIndex: 1, roomType: 'elite', mobs: [{ id: 'mob-1-0', hp: 200, maxHp: 200 }] },
    { roomIndex: 2, roomType: 'final_boss', mobs: [{ id: 'mob-2-0', hp: 500, maxHp: 500 }] },
  ],
  roomStartSnapshot: null,
  roundNumber: 0,
  roundSummaries: null,
  nextRoundAt: new Date(Date.now() + 600_000),
  startedAt: new Date(),
  completedAt: null,
  launchedBy: PLAYER_ID,
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
});
