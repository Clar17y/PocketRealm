import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PREMIUM_CONSTANTS } from '@pocketrealm/shared';

vi.mock('./eloService', () => ({
  calculateEloChange: vi.fn().mockReturnValue({ deltaA: 16, deltaB: -16 }),
}));
vi.mock('./equipmentService', () => ({
  getEquipmentStats: vi.fn().mockResolvedValue({
    attack: 10, rangedPower: 0, magicPower: 0, armor: 10,
    magicDefence: 5, health: 50, dodge: 5, accuracy: 5,
    critChance: 0.05, critDamage: 1.5, speed: 5,
  }),
}));
vi.mock('./turnBankService', () => ({
  spendPlayerTurnsTx: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./durabilityService', () => ({
  degradeEquippedDurability: vi.fn().mockResolvedValue([]),
}));
vi.mock('./attributesService', () => ({
  normalizePlayerAttributes: vi.fn().mockReturnValue({
    vitality: 5, strength: 5, dexterity: 5, intelligence: 5, luck: 5, evasion: 5,
  }),
}));
vi.mock('./hpService', () => ({
  getHpState: vi.fn().mockResolvedValue({
    currentHp: 100, maxHp: 100, isRecovering: false,
    regenPerSecond: 0.4, lastHpRegenAt: new Date().toISOString(), recoveryCost: null,
  }),
  setHp: vi.fn().mockResolvedValue(undefined),
  enterRecoveringState: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./combatTemplateService', () => ({
  getActiveTemplate: vi.fn().mockResolvedValue([{ actionId: 'light_attack' }]),
}));
vi.mock('./resourceService', () => ({
  getResourceState: vi.fn().mockResolvedValue({
    stamina: { current: 100, max: 100, regenPerRound: 10, regenPerSecond: 1 },
    mana: { current: 50, max: 50, regenPerRound: 5, regenPerSecond: 0.5 },
  }),
  setAllResources: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./skillPointService', () => ({
  getSkillPoints: vi.fn().mockResolvedValue({
    playerId: 'test',
    totalPointsEarned: 0,
    totalPointsSpent: 0,
    availablePoints: 0,
    allocations: {},
    unlockedActions: [],
  }),
}));
vi.mock('./pvpCombatantBuilder', () => ({
  getAttackStyle: vi.fn().mockResolvedValue('melee'),
  buildPvpCombatant: vi.fn().mockResolvedValue({
    id: 'mock-player',
    name: 'MockPlayer',
    stats: {
      hp: 100, maxHp: 100,
      attack: 15, defence: 10, magicPower: 0, magicDefence: 5,
      accuracy: 60, dodge: 10, speed: 5, damageMin: 5, damageMax: 15,
      critChance: 0.05, critDamage: 1.5, evasion: 5, damageType: 'physical',
    },
    template: [{ actionId: 'light_attack' }],
    stamina: 100,
    maxStamina: 100,
    staminaRegenPerRound: 10,
    mana: 50,
    maxMana: 50,
    manaRegenPerRound: 5,
    actionDefinitions: {},
  }),
}));
vi.mock('@pocketrealm/game-engine', () => ({
  calculateFleeChance: vi.fn().mockReturnValue(0.3),
  runTemplateCombat: vi.fn().mockReturnValue({
    outcome: 'victory',
    log: [],
    combatantAMaxHp: 100,
    combatantBMaxHp: 100,
    combatantAHpRemaining: 80,
    combatantBHpRemaining: 0,
    combatantAStaminaRemaining: 60,
    combatantBStaminaRemaining: 100,
    combatantAManaRemaining: 30,
    combatantBManaRemaining: 50,
    potionsConsumed: [],
    totalRounds: 5,
  }),
  calculateMaxStamina: vi.fn().mockReturnValue(100),
  calculateMaxMana: vi.fn().mockReturnValue(50),
}));
vi.mock('./combatLogMapper', () => ({
  mapTemplateCombatLog: vi.fn().mockImplementation((log: unknown[]) => log),
}));
vi.mock('../utils/routeHelpers.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    trackAchievements: vi.fn().mockResolvedValue(undefined),
  };
});

import { mockPrisma } from '../__test__/setup';
import { getHpState, enterRecoveringState, setHp } from './hpService';
import { setAllResources } from './resourceService';
import { runTemplateCombat } from '@pocketrealm/game-engine';
import { calculateEloChange } from './eloService';
import { degradeEquippedDurability } from './durabilityService';
import { spendPlayerTurnsTx } from './turnBankService';
import { trackAchievements } from '../utils/routeHelpers.js';
import { PVP_CONSTANTS, FLEE_CONSTANTS, QUERY_LIMITS } from '@pocketrealm/shared';
import {
  getOrCreateRating,
  getLadder,
  scoutOpponent,
  challenge,
  computeBracketBounds,
  getHistory,
  getMatchDetail,
  getNotificationCount,
  getNotifications,
  markNotificationsRead,
  getScoutNotificationCount,
  getScoutNotifications,
  markScoutNotificationsRead,
} from './pvpService';

function setupChallengeMocks(overrides?: {
  attackerRole?: string;
  targetRole?: string;
  attackerLevel?: number;
  targetLevel?: number;
  attackerRating?: number;
  defenderRating?: number;
  isBot?: boolean;
}) {
  const aRole = overrides?.attackerRole ?? 'player';
  const tRole = overrides?.targetRole ?? 'player';
  const aLevel = overrides?.attackerLevel ?? 10;
  const tLevel = overrides?.targetLevel ?? 10;
  const aRating = overrides?.attackerRating ?? 1000;
  const dRating = overrides?.defenderRating ?? 1000;
  const isBot = overrides?.isBot ?? false;

  mockPrisma.player.findUnique
    .mockResolvedValueOnce({
      characterLevel: aLevel,
      attributes: {},
      currentZone: { id: 'z1', zoneType: 'town' },
      account: { role: aRole },
    })
    .mockResolvedValueOnce({
      characterLevel: tLevel,
      attributes: {},
      username: 'Target',
      isBot,
      account: { role: tRole },
    });
  mockPrisma.pvpRating.upsert
    .mockResolvedValueOnce({ playerId: 'p1', rating: aRating, wins: 0, losses: 0, draws: 0, winStreak: 0, bestWinStreak: 0, bestRating: aRating })
    .mockResolvedValueOnce({ playerId: 'p2', rating: dRating, wins: 0, losses: 0, draws: 0, winStreak: 0, bestWinStreak: 0, bestRating: dRating });
  mockPrisma.pvpCooldown.findUnique.mockResolvedValue(null);
  mockPrisma.pvpMatch.findFirst.mockResolvedValue(null);
  mockPrisma.playerEquipment.findUnique.mockResolvedValue(null);
  mockPrisma.playerEquipment.findMany.mockResolvedValue([]);
  mockPrisma.playerSkill.findUnique.mockResolvedValue({ level: 10 });
  mockPrisma.playerSkill.findMany.mockResolvedValue([{ level: 10 }]);
  mockPrisma.pvpRating.findUnique
    .mockResolvedValueOnce({ rating: aRating })
    .mockResolvedValueOnce({ rating: dRating });
  mockPrisma.pvpRating.update.mockResolvedValue({});
  mockPrisma.pvpMatch.create.mockResolvedValue({ id: 'match-1' });
  mockPrisma.pvpCooldown.upsert.mockResolvedValue({});
  mockPrisma.combatTemplate.findFirst.mockResolvedValue(null);
  mockPrisma.skillPointAllocation.findUnique.mockResolvedValue(null);
}

describe('pvpService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // getOrCreateRating
  // -------------------------------------------------------------------------

  describe('getOrCreateRating', () => {
    it('calls prisma.pvpRating.upsert with starting rating', async () => {
      mockPrisma.pvpRating.upsert.mockResolvedValue({ playerId: 'p1', rating: 1000, wins: 0, losses: 0, draws: 0 });

      await getOrCreateRating('p1');

      expect(mockPrisma.pvpRating.upsert).toHaveBeenCalledWith({
        where: { playerId: 'p1' },
        update: {},
        create: { playerId: 'p1', rating: PVP_CONSTANTS.STARTING_RATING, bestRating: PVP_CONSTANTS.STARTING_RATING },
      });
    });
  });

  // -------------------------------------------------------------------------
  // getLadder
  // -------------------------------------------------------------------------

  describe('getLadder', () => {
    it('returns myRating and filtered opponents', async () => {
      mockPrisma.pvpRating.upsert.mockResolvedValue({
        playerId: 'p1', rating: 1000, wins: 5, losses: 3, draws: 1, winStreak: 2, bestRating: 1050,
      });
      mockPrisma.player.findUnique.mockResolvedValue({ account: { role: 'player' } });
      mockPrisma.pvpCooldown.findMany.mockResolvedValue([]);
      mockPrisma.pvpRating.findMany.mockResolvedValue([
        {
          playerId: 'p2', rating: 950,
          player: { username: 'Rival', characterLevel: 15, account: { role: 'player' }, activeTitle: null },
        },
      ]);

      const result = await getLadder('p1');

      expect(result.myRating.rating).toBe(1000);
      expect(result.myRating.wins).toBe(5);
      expect(result.opponents).toHaveLength(1);
      expect(result.opponents[0].username).toBe('Rival');
    });

    it('excludes opponents on cooldown', async () => {
      mockPrisma.pvpRating.upsert.mockResolvedValue({
        playerId: 'p1', rating: 1000, wins: 0, losses: 0, draws: 0, winStreak: 0, bestRating: 1000,
      });
      mockPrisma.player.findUnique.mockResolvedValue({ account: { role: 'player' } });
      mockPrisma.pvpCooldown.findMany.mockResolvedValue([{ defenderId: 'p2' }]);
      mockPrisma.pvpRating.findMany.mockResolvedValue([
        {
          playerId: 'p2', rating: 950,
          player: { username: 'CooldownGuy', characterLevel: 12, account: { role: 'player' }, activeTitle: null },
        },
        {
          playerId: 'p3', rating: 1020,
          player: { username: 'Available', characterLevel: 14, account: { role: 'player' }, activeTitle: null },
        },
      ]);

      const result = await getLadder('p1');

      expect(result.opponents).toHaveLength(1);
      expect(result.opponents[0].playerId).toBe('p3');
    });

    it('admin bypasses cooldown checks', async () => {
      mockPrisma.pvpRating.upsert.mockResolvedValue({
        playerId: 'admin1', rating: 1000, wins: 0, losses: 0, draws: 0, winStreak: 0, bestRating: 1000,
      });
      mockPrisma.player.findUnique.mockResolvedValue({ account: { role: 'admin' } });
      mockPrisma.pvpRating.findMany.mockResolvedValue([
        {
          playerId: 'p2', rating: 950,
          player: { username: 'Target', characterLevel: 12, account: { role: 'player' }, activeTitle: null },
        },
      ]);

      const result = await getLadder('admin1');

      // No pvpCooldown.findMany should be called for admins
      expect(mockPrisma.pvpCooldown.findMany).not.toHaveBeenCalled();
      expect(result.opponents).toHaveLength(1);
    });

    it('resolves title from activeTitle achievement', async () => {
      mockPrisma.pvpRating.upsert.mockResolvedValue({
        playerId: 'p1', rating: 1000, wins: 0, losses: 0, draws: 0, winStreak: 0, bestRating: 1000,
      });
      mockPrisma.player.findUnique.mockResolvedValue({ account: { role: 'player' } });
      mockPrisma.pvpCooldown.findMany.mockResolvedValue([]);
      mockPrisma.pvpRating.findMany.mockResolvedValue([
        {
          playerId: 'p2', rating: 1000,
          // Player has no active title
          player: { username: 'NoTitle', characterLevel: 10, account: { role: 'player' }, activeTitle: null },
        },
      ]);

      const result = await getLadder('p1');

      expect(result.opponents[0].title).toBeUndefined();
      expect(result.opponents[0].titleTier).toBeUndefined();
      expect(result.opponents[0].titleStyle).toBeUndefined();
    });

    it('includes titleStyle for styled active titles', async () => {
      mockPrisma.pvpRating.upsert.mockResolvedValue({
        playerId: 'p1', rating: 1000, wins: 0, losses: 0, draws: 0, winStreak: 0, bestRating: 1000,
      });
      mockPrisma.player.findUnique.mockResolvedValue({ role: 'player' });
      mockPrisma.pvpCooldown.findMany.mockResolvedValue([]);
      mockPrisma.pvpRating.findMany.mockResolvedValue([
        {
          playerId: 'p2', rating: 1000,
          player: {
            username: 'Supporter',
            characterLevel: 10,
            role: 'player',
            activeTitle: PREMIUM_CONSTANTS.SUPPORT_TITLE_ACHIEVEMENT_ID,
          },
        },
      ]);

      const result = await getLadder('p1');

      expect(result.opponents[0].title).toBe(PREMIUM_CONSTANTS.SUPPORT_TITLE);
      expect(result.opponents[0].titleStyle).toBe('rainbow');
    });

    it('returns isAdmin flag on opponents', async () => {
      mockPrisma.pvpRating.upsert.mockResolvedValue({
        playerId: 'p1', rating: 1000, wins: 0, losses: 0, draws: 0, winStreak: 0, bestRating: 1000,
      });
      mockPrisma.player.findUnique.mockResolvedValue({ account: { role: 'player' } });
      mockPrisma.pvpCooldown.findMany.mockResolvedValue([]);
      mockPrisma.pvpRating.findMany.mockResolvedValue([
        {
          playerId: 'admin2', rating: 1000,
          player: { username: 'AdminGuy', characterLevel: 10, account: { role: 'admin' }, activeTitle: null },
        },
      ]);

      const result = await getLadder('p1');

      expect(result.opponents[0].isAdmin).toBe(true);
    });

    it('queries with max-widened bracket bounds in a single query', async () => {
      mockPrisma.pvpRating.upsert.mockResolvedValue({
        playerId: 'p1', rating: 1000, wins: 0, losses: 0, draws: 0, winStreak: 0, bestRating: 1000,
      });
      mockPrisma.player.findUnique.mockResolvedValue({ account: { role: 'player' } });
      mockPrisma.pvpCooldown.findMany.mockResolvedValue([]);
      mockPrisma.pvpRating.findMany.mockResolvedValue([]);

      await getLadder('p1');

      const maxExpansion = PVP_CONSTANTS.BRACKET_WIDEN_STEP * PVP_CONSTANTS.BRACKET_MAX_WIDEN_ITERATIONS;
      const bounds = computeBracketBounds(1000);
      const expectedLower = Math.max(0, bounds.lower - maxExpansion);
      const expectedUpper = bounds.upper + maxExpansion;
      expect(mockPrisma.pvpRating.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.pvpRating.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            rating: { gte: expectedLower, lte: expectedUpper },
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // scoutOpponent
  // -------------------------------------------------------------------------

  describe('scoutOpponent', () => {
    it('throws if attacker is recovering', async () => {
      vi.mocked(getHpState).mockResolvedValueOnce({ currentHp: 0, maxHp: 100, isRecovering: true, regenPerSecond: 0.4, lastHpRegenAt: new Date().toISOString(), recoveryCost: 100 });

      await expect(scoutOpponent('p1', 'p2')).rejects.toThrow('Cannot scout while recovering');
    });

    it('throws if attacker is not in a town', async () => {
      mockPrisma.player.findUnique.mockResolvedValue({
        currentZone: { zoneType: 'wild' },
      });

      await expect(scoutOpponent('p1', 'p2')).rejects.toThrow('Must be in a town to scout');
    });

    it('throws if target not found', async () => {
      mockPrisma.player.findUnique
        .mockResolvedValueOnce({ currentZone: { zoneType: 'town' } })
        .mockResolvedValueOnce(null);

      await expect(scoutOpponent('p1', 'p2')).rejects.toThrow('Target player not found');
    });

    it('returns templateInfo with category breakdown on success', async () => {
      mockPrisma.player.findUnique
        .mockResolvedValueOnce({ currentZone: { zoneType: 'town' } })
        .mockResolvedValueOnce({ characterLevel: 12, attributes: {} })
        .mockResolvedValueOnce({ attributes: {} })
        .mockResolvedValueOnce({ attributes: {} });
      mockPrisma.playerEquipment.findMany.mockResolvedValue([]);
      mockPrisma.playerSkill.findMany.mockResolvedValue([{ skillType: 'melee', level: 5 }]);
      mockPrisma.pvpScoutLog.create.mockResolvedValue({});

      const result = await scoutOpponent('p1', 'p2');

      expect(result.combatLevel).toBe(12);
      expect(result.attackStyle).toBe('melee');
      expect(typeof result.powerRating).toBe('number');
      expect(typeof result.myPowerRating).toBe('number');
      expect(result.templateInfo).toBeDefined();
      expect(result.templateInfo.templateLength).toBe(1);
      expect(typeof result.templateInfo.maxStamina).toBe('number');
      expect(typeof result.templateInfo.maxMana).toBe('number');
      expect(result.templateInfo.talentInvestment).toBeDefined();
    });

    it('creates PvpScoutLog notification', async () => {
      mockPrisma.player.findUnique
        .mockResolvedValueOnce({ currentZone: { zoneType: 'town' } })
        .mockResolvedValueOnce({ characterLevel: 12, attributes: {} })
        .mockResolvedValueOnce({ attributes: {} })
        .mockResolvedValueOnce({ attributes: {} });
      mockPrisma.playerEquipment.findMany.mockResolvedValue([]);
      mockPrisma.playerSkill.findMany.mockResolvedValue([]);
      mockPrisma.pvpScoutLog.create.mockResolvedValue({});

      await scoutOpponent('p1', 'p2');

      expect(mockPrisma.pvpScoutLog.create).toHaveBeenCalledWith({
        data: { scouterId: 'p1', targetId: 'p2' },
      });
    });

    it('spends SCOUT_TURN_COST turns after validation', async () => {
      mockPrisma.player.findUnique
        .mockResolvedValueOnce({ currentZone: { zoneType: 'town' } })
        .mockResolvedValueOnce({ characterLevel: 12, attributes: {} })
        .mockResolvedValueOnce({ attributes: {} })
        .mockResolvedValueOnce({ attributes: {} });
      mockPrisma.playerEquipment.findMany.mockResolvedValue([]);
      mockPrisma.playerSkill.findMany.mockResolvedValue([]);
      mockPrisma.pvpScoutLog.create.mockResolvedValue({});

      await scoutOpponent('p1', 'p2');

      expect(spendPlayerTurnsTx).toHaveBeenCalledWith(
        expect.anything(), 'p1', PVP_CONSTANTS.SCOUT_TURN_COST,
      );
    });

    it('detects ranged attack style from main hand weapon', async () => {
      mockPrisma.player.findUnique
        .mockResolvedValueOnce({ currentZone: { zoneType: 'town' } })
        .mockResolvedValueOnce({ characterLevel: 12, attributes: {} })
        .mockResolvedValueOnce({ attributes: {} })
        .mockResolvedValueOnce({ attributes: {} });
      mockPrisma.playerEquipment.findMany.mockResolvedValue([
        { slot: 'main_hand', item: { template: { requiredSkill: 'ranged' } } },
      ]);
      mockPrisma.playerSkill.findMany.mockResolvedValue([]);
      mockPrisma.pvpScoutLog.create.mockResolvedValue({});

      const result = await scoutOpponent('p1', 'p2');

      expect(result.attackStyle).toBe('ranged');
    });

    it('detects magic attack style from main hand weapon', async () => {
      mockPrisma.player.findUnique
        .mockResolvedValueOnce({ currentZone: { zoneType: 'town' } })
        .mockResolvedValueOnce({ characterLevel: 12, attributes: {} })
        .mockResolvedValueOnce({ attributes: {} })
        .mockResolvedValueOnce({ attributes: {} });
      mockPrisma.playerEquipment.findMany.mockResolvedValue([
        { slot: 'main_hand', item: { template: { requiredSkill: 'magic' } } },
      ]);
      mockPrisma.playerSkill.findMany.mockResolvedValue([]);
      mockPrisma.pvpScoutLog.create.mockResolvedValue({});

      const result = await scoutOpponent('p1', 'p2');

      expect(result.attackStyle).toBe('magic');
    });

    it('defaults to melee with no main hand weapon', async () => {
      mockPrisma.player.findUnique
        .mockResolvedValueOnce({ currentZone: { zoneType: 'town' } })
        .mockResolvedValueOnce({ characterLevel: 12, attributes: {} })
        .mockResolvedValueOnce({ attributes: {} })
        .mockResolvedValueOnce({ attributes: {} });
      mockPrisma.playerEquipment.findMany.mockResolvedValue([
        { slot: 'chest', item: { template: { requiredSkill: null } } },
      ]);
      mockPrisma.playerSkill.findMany.mockResolvedValue([]);
      mockPrisma.pvpScoutLog.create.mockResolvedValue({});

      const result = await scoutOpponent('p1', 'p2');

      expect(result.attackStyle).toBe('melee');
    });

    it('detects armor class from chest piece', async () => {
      mockPrisma.player.findUnique
        .mockResolvedValueOnce({ currentZone: { zoneType: 'town' } })
        .mockResolvedValueOnce({ characterLevel: 12, attributes: {} })
        .mockResolvedValueOnce({ attributes: {} })
        .mockResolvedValueOnce({ attributes: {} });
      mockPrisma.playerEquipment.findMany.mockResolvedValue([
        { slot: 'chest', item: { template: { weightClass: 'heavy' } } },
      ]);
      mockPrisma.playerSkill.findMany.mockResolvedValue([]);
      mockPrisma.pvpScoutLog.create.mockResolvedValue({});

      const result = await scoutOpponent('p1', 'p2');

      expect(result.armorClass).toBe('heavy');
    });

    it('armorClass defaults to none with no chest piece', async () => {
      mockPrisma.player.findUnique
        .mockResolvedValueOnce({ currentZone: { zoneType: 'town' } })
        .mockResolvedValueOnce({ characterLevel: 12, attributes: {} })
        .mockResolvedValueOnce({ attributes: {} })
        .mockResolvedValueOnce({ attributes: {} });
      mockPrisma.playerEquipment.findMany.mockResolvedValue([]);
      mockPrisma.playerSkill.findMany.mockResolvedValue([]);
      mockPrisma.pvpScoutLog.create.mockResolvedValue({});

      const result = await scoutOpponent('p1', 'p2');

      expect(result.armorClass).toBe('none');
    });

    it('throws when attacker zone is null', async () => {
      mockPrisma.player.findUnique.mockResolvedValue({
        currentZone: null,
      });

      await expect(scoutOpponent('p1', 'p2')).rejects.toThrow('Must be in a town to scout');
    });
  });

  // -------------------------------------------------------------------------
  // challenge
  // -------------------------------------------------------------------------

  describe('challenge', () => {
    it('throws if challenging self', async () => {
      await expect(challenge('p1', 'Attacker', 'p1')).rejects.toThrow('Cannot challenge yourself');
    });

    it('throws if attacker is recovering', async () => {
      vi.mocked(getHpState).mockResolvedValueOnce({ currentHp: 0, maxHp: 100, isRecovering: true, regenPerSecond: 0.4, lastHpRegenAt: new Date().toISOString(), recoveryCost: 100 });

      await expect(challenge('p1', 'Attacker', 'p2')).rejects.toThrow('Cannot challenge while recovering');
    });

    it('throws if attacker has 0 HP', async () => {
      vi.mocked(getHpState).mockResolvedValueOnce({ currentHp: 0, maxHp: 100, isRecovering: false, regenPerSecond: 0.4, lastHpRegenAt: new Date().toISOString(), recoveryCost: null });

      await expect(challenge('p1', 'Attacker', 'p2')).rejects.toThrow('Cannot challenge with 0 HP');
    });

    it('throws if attacker is not in a town', async () => {
      mockPrisma.player.findUnique.mockResolvedValue({
        characterLevel: 10, attributes: {}, account: { role: 'player' }, currentZone: { id: 'z1', zoneType: 'wild' },
      });

      await expect(challenge('p1', 'Attacker', 'p2')).rejects.toThrow('Must be in a town to challenge');
    });

    it('throws if attacker not found', async () => {
      mockPrisma.player.findUnique.mockResolvedValue(null);

      await expect(challenge('p1', 'Attacker', 'p2')).rejects.toThrow('Player not found');
    });

    it('throws if attacker below minimum character level', async () => {
      mockPrisma.player.findUnique.mockResolvedValue({
        characterLevel: PVP_CONSTANTS.MIN_CHARACTER_LEVEL - 1,
        attributes: {},
        account: { role: 'player' },
        currentZone: { id: 'z1', zoneType: 'town' },
      });

      await expect(challenge('p1', 'Attacker', 'p2')).rejects.toThrow(
        `Must be character level ${PVP_CONSTANTS.MIN_CHARACTER_LEVEL}+`,
      );
    });

    it('throws if on cooldown (non-admin)', async () => {
      mockPrisma.player.findUnique.mockResolvedValue({
        characterLevel: 10, attributes: {}, account: { role: 'player' }, currentZone: { id: 'z1', zoneType: 'town' },
      });
      mockPrisma.pvpCooldown.findUnique.mockResolvedValue({
        expiresAt: new Date(Date.now() + 3_600_000), // 1 hour in the future
      });

      await expect(challenge('p1', 'Attacker', 'p2')).rejects.toThrow('Opponent is on cooldown');
    });

    it('admin bypasses cooldown', async () => {
      setupChallengeMocks({ attackerRole: 'admin' });

      const result = await challenge('p1', 'Attacker', 'p2');

      expect(mockPrisma.pvpCooldown.findUnique).not.toHaveBeenCalled();
      expect(result.matchId).toBe('match-1');
    });

    it('throws if target not found', async () => {
      mockPrisma.player.findUnique
        .mockResolvedValueOnce({ characterLevel: 10, attributes: {}, account: { role: 'player' }, currentZone: { id: 'z1', zoneType: 'town' } })
        .mockResolvedValueOnce(null);
      mockPrisma.pvpCooldown.findUnique.mockResolvedValue(null);

      await expect(challenge('p1', 'Attacker', 'p2')).rejects.toThrow('Target not found');
    });

    it('throws if target below minimum level', async () => {
      mockPrisma.player.findUnique
        .mockResolvedValueOnce({ characterLevel: 10, attributes: {}, account: { role: 'player' }, currentZone: { id: 'z1', zoneType: 'town' } })
        .mockResolvedValueOnce({ characterLevel: PVP_CONSTANTS.MIN_CHARACTER_LEVEL - 1, attributes: {}, username: 'LowLevel', isBot: false, account: { role: 'player' } });
      mockPrisma.pvpCooldown.findUnique.mockResolvedValue(null);

      await expect(challenge('p1', 'Attacker', 'p2')).rejects.toThrow('Target below minimum level');
    });

    it('throws if target is outside rating bracket', async () => {
      mockPrisma.player.findUnique
        .mockResolvedValueOnce({ characterLevel: 10, attributes: {}, account: { role: 'player' }, currentZone: { id: 'z1', zoneType: 'town' } })
        .mockResolvedValueOnce({ characterLevel: 10, attributes: {}, username: 'FarAway', isBot: false, account: { role: 'player' } });
      mockPrisma.pvpCooldown.findUnique.mockResolvedValue(null);
      // Attacker at 1000, defender at 2000 — outside 25% bracket
      mockPrisma.pvpRating.upsert
        .mockResolvedValueOnce({ playerId: 'p1', rating: 1000, wins: 0, losses: 0, draws: 0, winStreak: 0, bestWinStreak: 0, bestRating: 1000 })
        .mockResolvedValueOnce({ playerId: 'p2', rating: 2000, wins: 0, losses: 0, draws: 0, winStreak: 0, bestWinStreak: 0, bestRating: 2000 });

      await expect(challenge('p1', 'Attacker', 'p2')).rejects.toThrow('Target is outside your rating bracket');
    });

    it('uses runTemplateCombat and returns match result', async () => {
      setupChallengeMocks();

      const result = await challenge('p1', 'Attacker', 'p2');

      expect(runTemplateCombat).toHaveBeenCalled();
      expect(result.matchId).toBe('match-1');
      expect(result.attackerId).toBe('p1');
      expect(result.defenderId).toBe('p2');
      expect(result.attackerName).toBe('Attacker');
      expect(result.defenderName).toBe('Target');
      expect(result.winnerId).toBe('p1');
      expect(result.isDraw).toBe(false);
      expect(result.attackerRatingChange).toBe(16);
      expect(result.defenderRatingChange).toBe(-16);
    });

    it('persists attacker resources via setAllResources on victory', async () => {
      setupChallengeMocks();

      await challenge('p1', 'Attacker', 'p2');

      expect(setAllResources).toHaveBeenCalledWith('p1', 80, 60, 30);
    });

    it('persists attacker resources with escape HP on defeat', async () => {
      vi.mocked(runTemplateCombat).mockReturnValueOnce({
        outcome: 'defeat',
        log: [],
        combatantAMaxHp: 100,
        combatantBMaxHp: 100,
        combatantAHpRemaining: 0,
        combatantBHpRemaining: 50,
        combatantAStaminaRemaining: 20,
        combatantBStaminaRemaining: 100,
        combatantAManaRemaining: 10,
        combatantBManaRemaining: 50,
        potionsConsumed: [],
        totalRounds: 10,
      } as any);
      setupChallengeMocks();

      const result = await challenge('p1', 'Attacker', 'p2');

      // Should always escape — either clean (15% maxHp) or wounded (1 HP)
      expect(result.fleeOutcome).toMatch(/^(clean_escape|wounded_escape)$/);
      expect(result.attackerKnockedOut).toBe(false);
      expect(enterRecoveringState).not.toHaveBeenCalled();
      // setAllResources is called with escape HP, not 0
      const setAllResourcesCalls = vi.mocked(setAllResources).mock.calls;
      const hpArg = setAllResourcesCalls[0][1];
      expect(hpArg).toBeGreaterThanOrEqual(1);
    });

    it('creates pvpMatch and upserts cooldown in transaction', async () => {
      setupChallengeMocks();

      await challenge('p1', 'Attacker', 'p2');

      expect(mockPrisma.pvpMatch.create).toHaveBeenCalled();
      expect(mockPrisma.pvpCooldown.upsert).toHaveBeenCalled();
      expect(mockPrisma.pvpRating.update).toHaveBeenCalledTimes(2);
    });

    it('detects revenge match and uses reduced turn cost', async () => {
      setupChallengeMocks();
      // Override: there was a recent match where target attacked us
      mockPrisma.pvpMatch.findFirst.mockResolvedValue({
        attackerId: 'p2',
        defenderId: 'p1',
        createdAt: new Date(), // recent
      });

      const result = await challenge('p1', 'Attacker', 'p2');

      expect(result.isRevenge).toBe(true);
      expect(result.turnsSpent).toBe(PVP_CONSTANTS.REVENGE_TURN_COST);
      // spendPlayerTurnsTx called with revenge cost
      expect(spendPlayerTurnsTx).toHaveBeenCalledWith(
        expect.anything(), 'p1', PVP_CONSTANTS.REVENGE_TURN_COST, expect.any(Date),
      );
    });

    it('uses normal turn cost when not revenge', async () => {
      setupChallengeMocks();

      const result = await challenge('p1', 'Attacker', 'p2');

      expect(result.isRevenge).toBe(false);
      expect(result.turnsSpent).toBe(PVP_CONSTANTS.CHALLENGE_TURN_COST);
    });

    it('handles draw outcome correctly', async () => {
      vi.mocked(runTemplateCombat).mockReturnValueOnce({
        outcome: 'draw',
        log: [],
        combatantAMaxHp: 100,
        combatantBMaxHp: 100,
        combatantAHpRemaining: 50,
        combatantBHpRemaining: 50,
        combatantAStaminaRemaining: 60,
        combatantBStaminaRemaining: 60,
        combatantAManaRemaining: 30,
        combatantBManaRemaining: 30,
        potionsConsumed: [],
        totalRounds: 100,
      } as any);
      vi.mocked(calculateEloChange).mockReturnValueOnce({ deltaA: 0, deltaB: 0 });
      setupChallengeMocks();

      const result = await challenge('p1', 'Attacker', 'p2');

      expect(result.isDraw).toBe(true);
      expect(result.winnerId).toBeNull();
    });

    it('zeroes ELO changes when attacker is admin', async () => {
      setupChallengeMocks({ attackerRole: 'admin' });

      const result = await challenge('p1', 'Attacker', 'p2');

      expect(result.attackerRatingChange).toBe(0);
      expect(result.defenderRatingChange).toBe(0);
    });

    it('zeroes ELO changes when defender is admin', async () => {
      setupChallengeMocks({ targetRole: 'admin' });

      const result = await challenge('p1', 'Attacker', 'p2');

      expect(result.attackerRatingChange).toBe(0);
      expect(result.defenderRatingChange).toBe(0);
    });

    it('admin does not get cooldown upserted', async () => {
      setupChallengeMocks({ attackerRole: 'admin' });

      await challenge('p1', 'Attacker', 'p2');

      expect(mockPrisma.pvpCooldown.upsert).not.toHaveBeenCalled();
    });

    it('PvP defeat never triggers knockout or gold loss', async () => {
      vi.mocked(runTemplateCombat).mockReturnValueOnce({
        outcome: 'defeat',
        log: [],
        combatantAMaxHp: 100,
        combatantBMaxHp: 100,
        combatantAHpRemaining: 0,
        combatantBHpRemaining: 50,
        combatantAStaminaRemaining: 0,
        combatantBStaminaRemaining: 100,
        combatantAManaRemaining: 0,
        combatantBManaRemaining: 50,
        potionsConsumed: [],
        totalRounds: 10,
      } as any);
      setupChallengeMocks();

      const result = await challenge('p1', 'Attacker', 'p2');

      // Never knockout in PvP
      expect(result.attackerKnockedOut).toBe(false);
      expect(result.fleeOutcome).toMatch(/^(clean_escape|wounded_escape)$/);
      expect(enterRecoveringState).not.toHaveBeenCalled();
      expect(trackAchievements).not.toHaveBeenCalledWith('p1', { totalDeaths: 1 });
      // No gold deduction — player.findUnique should NOT be called for gold lookup
      // (no calculateFleeWithGold call)
    });

    it('PvP defeat sets HP to escape value via setAllResources', async () => {
      vi.mocked(runTemplateCombat).mockReturnValueOnce({
        outcome: 'defeat',
        log: [],
        combatantAMaxHp: 100,
        combatantBMaxHp: 100,
        combatantAHpRemaining: 0,
        combatantBHpRemaining: 50,
        combatantAStaminaRemaining: 0,
        combatantBStaminaRemaining: 100,
        combatantAManaRemaining: 0,
        combatantBManaRemaining: 50,
        potionsConsumed: [],
        totalRounds: 10,
      } as any);
      setupChallengeMocks();

      await challenge('p1', 'Attacker', 'p2');

      // setAllResources called with escape HP (either 1 or 15% maxHp), not 0
      const hpArg = vi.mocked(setAllResources).mock.calls[0][1];
      const cleanEscapeHp = Math.max(1, Math.floor(100 * FLEE_CONSTANTS.HIGH_SUCCESS_HP_PERCENT));
      expect([FLEE_CONSTANTS.PARTIAL_SUCCESS_HP, cleanEscapeHp]).toContain(hpArg);
      // setHp should NOT be called separately (setAllResources handles it)
      expect(setHp).not.toHaveBeenCalled();
    });

    it('skips durability degradation for bot defenders', async () => {
      setupChallengeMocks({ isBot: true });

      await challenge('p1', 'Attacker', 'p2');

      // degradeEquippedDurability should only be called once (attacker), not for bot
      expect(degradeEquippedDurability).toHaveBeenCalledTimes(1);
      expect(degradeEquippedDurability).toHaveBeenCalledWith('p1', expect.any(Array), 'combatantA');
    });

    it('degrades durability for both human players', async () => {
      setupChallengeMocks({ isBot: false });

      await challenge('p1', 'Attacker', 'p2');

      expect(degradeEquippedDurability).toHaveBeenCalledTimes(2);
      expect(degradeEquippedDurability).toHaveBeenCalledWith('p1', expect.any(Array), 'combatantA');
      expect(degradeEquippedDurability).toHaveBeenCalledWith('p2', expect.any(Array), 'combatantB');
    });

    it('returns durability info for both attacker and defender', async () => {
      const attackerDur = [{ itemId: 'item1', newDurability: 95 }];
      const defenderDur = [{ itemId: 'item2', newDurability: 90 }];
      vi.mocked(degradeEquippedDurability)
        .mockResolvedValueOnce(attackerDur as any)
        .mockResolvedValueOnce(defenderDur as any);
      setupChallengeMocks();

      const result = await challenge('p1', 'Attacker', 'p2');

      expect(result.durability.attacker).toEqual(attackerDur);
      expect(result.durability.defender).toEqual(defenderDur);
    });

    it('winner is target when attacker loses', async () => {
      vi.mocked(runTemplateCombat).mockReturnValueOnce({
        outcome: 'defeat',
        log: [],
        combatantAMaxHp: 100,
        combatantBMaxHp: 100,
        combatantAHpRemaining: 0,
        combatantBHpRemaining: 80,
        combatantAStaminaRemaining: 0,
        combatantBStaminaRemaining: 100,
        combatantAManaRemaining: 0,
        combatantBManaRemaining: 50,
        potionsConsumed: [],
        totalRounds: 8,
      } as any);
      setupChallengeMocks();

      const result = await challenge('p1', 'Attacker', 'p2');

      expect(result.winnerId).toBe('p2');
    });

    it('expired cooldown does not block challenge', async () => {
      mockPrisma.player.findUnique
        .mockResolvedValueOnce({ characterLevel: 10, attributes: {}, account: { role: 'player' }, currentZone: { id: 'z1', zoneType: 'town' } })
        .mockResolvedValueOnce({ characterLevel: 10, attributes: {}, username: 'Target', isBot: false, account: { role: 'player' } });
      mockPrisma.pvpCooldown.findUnique.mockResolvedValue({
        expiresAt: new Date(Date.now() - 1000), // expired
      });
      mockPrisma.pvpRating.upsert
        .mockResolvedValueOnce({ playerId: 'p1', rating: 1000, wins: 0, losses: 0, draws: 0, winStreak: 0, bestWinStreak: 0, bestRating: 1000 })
        .mockResolvedValueOnce({ playerId: 'p2', rating: 1000, wins: 0, losses: 0, draws: 0, winStreak: 0, bestWinStreak: 0, bestRating: 1000 });
      mockPrisma.pvpMatch.findFirst.mockResolvedValue(null);
      mockPrisma.playerEquipment.findMany.mockResolvedValue([]);
      mockPrisma.playerSkill.findMany.mockResolvedValue([]);
      mockPrisma.pvpRating.findUnique
        .mockResolvedValueOnce({ rating: 1000 })
        .mockResolvedValueOnce({ rating: 1000 });
      mockPrisma.pvpRating.update.mockResolvedValue({});
      mockPrisma.pvpMatch.create.mockResolvedValue({ id: 'match-2' });
      mockPrisma.pvpCooldown.upsert.mockResolvedValue({});
      mockPrisma.combatTemplate.findFirst.mockResolvedValue(null);
      mockPrisma.skillPointAllocation.findUnique.mockResolvedValue(null);

      const result = await challenge('p1', 'Attacker', 'p2');

      expect(result.matchId).toBe('match-2');
    });
  });

  // -------------------------------------------------------------------------
  // getHistory
  // -------------------------------------------------------------------------

  describe('getHistory', () => {
    it('returns paginated matches', async () => {
      const matchRow = {
        id: 'm1',
        attackerId: 'p1',
        attacker: { username: 'Attacker' },
        defenderId: 'p2',
        defender: { username: 'Defender' },
        winnerId: 'p1',
        attackerRating: 1000,
        defenderRating: 980,
        attackerRatingChange: 16,
        defenderRatingChange: -16,
        attackerStyle: 'melee',
        defenderStyle: 'melee',
        isRevenge: false,
        turnsSpent: 500,
        createdAt: new Date('2026-01-15T12:00:00Z'),
      };
      mockPrisma.pvpMatch.findMany.mockResolvedValue([matchRow]);
      mockPrisma.pvpMatch.count.mockResolvedValue(1);

      const result = await getHistory('p1', 1, 10);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].matchId).toBe('m1');
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrevious).toBe(false);
    });

    it('calculates pagination correctly for multiple pages', async () => {
      mockPrisma.pvpMatch.findMany.mockResolvedValue([]);
      mockPrisma.pvpMatch.count.mockResolvedValue(25);

      const result = await getHistory('p1', 2, 10);

      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.hasPrevious).toBe(true);
    });

    it('queries for matches as attacker OR defender', async () => {
      mockPrisma.pvpMatch.findMany.mockResolvedValue([]);
      mockPrisma.pvpMatch.count.mockResolvedValue(0);

      await getHistory('p1', 1, 10);

      expect(mockPrisma.pvpMatch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ attackerId: 'p1' }, { defenderId: 'p1' }] },
        }),
      );
    });

    it('serializes createdAt to ISO string', async () => {
      const date = new Date('2026-03-01T09:30:00Z');
      mockPrisma.pvpMatch.findMany.mockResolvedValue([{
        id: 'm1', attackerId: 'p1', defenderId: 'p2', winnerId: 'p1',
        attacker: { username: 'A' }, defender: { username: 'B' },
        attackerRating: 1000, defenderRating: 900,
        attackerRatingChange: 10, defenderRatingChange: -10,
        attackerStyle: 'melee', defenderStyle: 'ranged',
        isRevenge: false, turnsSpent: 500,
        createdAt: date,
      }]);
      mockPrisma.pvpMatch.count.mockResolvedValue(1);

      const result = await getHistory('p1', 1, 10);

      expect(result.matches[0].createdAt).toBe('2026-03-01T09:30:00.000Z');
    });

    it('returns empty matches array for no results', async () => {
      mockPrisma.pvpMatch.findMany.mockResolvedValue([]);
      mockPrisma.pvpMatch.count.mockResolvedValue(0);

      const result = await getHistory('p1', 1, 10);

      expect(result.matches).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // getMatchDetail
  // -------------------------------------------------------------------------

  describe('getMatchDetail', () => {
    it('throws 404 if match not found', async () => {
      mockPrisma.pvpMatch.findUnique.mockResolvedValue(null);

      await expect(getMatchDetail('p1', 'bad-id')).rejects.toThrow('Match not found');
    });

    it('throws 403 if player is not a participant', async () => {
      mockPrisma.pvpMatch.findUnique.mockResolvedValue({
        id: 'm1',
        attackerId: 'p2',
        defenderId: 'p3',
        attacker: { username: 'A' },
        defender: { username: 'B' },
      });

      await expect(getMatchDetail('p1', 'm1')).rejects.toThrow('Not authorized to view this match');
    });

    it('returns match detail for attacker', async () => {
      mockPrisma.pvpMatch.findUnique.mockResolvedValue({
        id: 'm1',
        attackerId: 'p1',
        defenderId: 'p2',
        winnerId: 'p1',
        attacker: { username: 'Attacker' },
        defender: { username: 'Defender' },
        attackerRating: 1000,
        defenderRating: 980,
        attackerRatingChange: 16,
        defenderRatingChange: -16,
        attackerStyle: 'melee',
        defenderStyle: 'ranged',
        isRevenge: false,
        turnsSpent: 500,
        createdAt: new Date('2026-01-15T12:00:00Z'),
        combatLog: { log: [] },
      });

      const result = await getMatchDetail('p1', 'm1');

      expect(result.matchId).toBe('m1');
      expect(result.attackerName).toBe('Attacker');
      expect(result.combatLog).toEqual({ log: [] });
    });

    it('allows defender to view match', async () => {
      mockPrisma.pvpMatch.findUnique.mockResolvedValue({
        id: 'm1',
        attackerId: 'p1',
        defenderId: 'p2',
        winnerId: 'p1',
        attacker: { username: 'Attacker' },
        defender: { username: 'Defender' },
        attackerRating: 1000,
        defenderRating: 980,
        attackerRatingChange: 16,
        defenderRatingChange: -16,
        attackerStyle: 'melee',
        defenderStyle: 'melee',
        isRevenge: true,
        turnsSpent: 250,
        createdAt: new Date('2026-02-01T12:00:00Z'),
        combatLog: { log: [{ action: 'attack' }] },
      });

      const result = await getMatchDetail('p2', 'm1');

      expect(result.matchId).toBe('m1');
      expect(result.isRevenge).toBe(true);
    });

  });

  // -------------------------------------------------------------------------
  // getNotificationCount
  // -------------------------------------------------------------------------

  describe('getNotificationCount', () => {
    it('counts unread matches for defender', async () => {
      mockPrisma.pvpMatch.count.mockResolvedValue(3);

      const result = await getNotificationCount('p1');

      expect(result).toBe(3);
      expect(mockPrisma.pvpMatch.count).toHaveBeenCalledWith({
        where: { defenderId: 'p1', defenderRead: false },
      });
    });

    it('returns 0 when no unread notifications', async () => {
      mockPrisma.pvpMatch.count.mockResolvedValue(0);

      const result = await getNotificationCount('p1');

      expect(result).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getNotifications
  // -------------------------------------------------------------------------

  describe('getNotifications', () => {
    it('returns unread matches as defender with attacker info', async () => {
      const matches = [
        {
          id: 'm1', attackerId: 'p2', defenderId: 'p1', defenderRead: false,
          createdAt: new Date(), winnerId: 'p2',
          attacker: { username: 'Rival1' },
        },
        {
          id: 'm2', attackerId: 'p3', defenderId: 'p1', defenderRead: false,
          createdAt: new Date(), winnerId: 'p1',
          attacker: { username: 'Rival2' },
        },
      ];
      mockPrisma.pvpMatch.findMany.mockResolvedValue(matches);

      const result = await getNotifications('p1');

      expect(result).toHaveLength(2);
      expect(result[0].attacker.username).toBe('Rival1');
      expect(result[1].attacker.username).toBe('Rival2');
    });

    it('returns empty array when no unread notifications', async () => {
      mockPrisma.pvpMatch.findMany.mockResolvedValue([]);

      const result = await getNotifications('p1');

      expect(result).toEqual([]);
    });

    it('queries with correct where clause and ordering', async () => {
      mockPrisma.pvpMatch.findMany.mockResolvedValue([]);

      await getNotifications('p1');

      expect(mockPrisma.pvpMatch.findMany).toHaveBeenCalledWith({
        where: { defenderId: 'p1', defenderRead: false },
        select: {
          id: true,
          attackerId: true,
          attackerRating: true,
          defenderRating: true,
          attackerRatingChange: true,
          defenderRatingChange: true,
          attackerStyle: true,
          defenderStyle: true,
          winnerId: true,
          isRevenge: true,
          createdAt: true,
          attacker: { select: { username: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: QUERY_LIMITS.MAX_PVP_NOTIFICATIONS,
      });
    });

    it('limits notifications to MAX_PVP_NOTIFICATIONS', async () => {
      mockPrisma.pvpMatch.findMany.mockResolvedValue([]);

      await getNotifications('player-1');

      expect(mockPrisma.pvpMatch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: QUERY_LIMITS.MAX_PVP_NOTIFICATIONS }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // markNotificationsRead
  // -------------------------------------------------------------------------

  describe('markNotificationsRead', () => {
    it('marks specific matches as read when matchIds provided', async () => {
      mockPrisma.pvpMatch.updateMany.mockResolvedValue({ count: 2 });

      await markNotificationsRead('p1', ['m1', 'm2']);

      expect(mockPrisma.pvpMatch.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['m1', 'm2'] }, defenderId: 'p1' },
        data: { defenderRead: true },
      });
    });

    it('marks all unread matches when no matchIds provided', async () => {
      mockPrisma.pvpMatch.updateMany.mockResolvedValue({ count: 5 });

      await markNotificationsRead('p1');

      expect(mockPrisma.pvpMatch.updateMany).toHaveBeenCalledWith({
        where: { defenderId: 'p1', defenderRead: false },
        data: { defenderRead: true },
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scout Notifications
  // -------------------------------------------------------------------------

  describe('getScoutNotificationCount', () => {
    it('returns unread scout count', async () => {
      mockPrisma.pvpScoutLog.count.mockResolvedValue(2);

      const result = await getScoutNotificationCount('p1');

      expect(result).toBe(2);
      expect(mockPrisma.pvpScoutLog.count).toHaveBeenCalledWith({
        where: { targetId: 'p1', isRead: false },
      });
    });

    it('returns 0 when no unread scouts', async () => {
      mockPrisma.pvpScoutLog.count.mockResolvedValue(0);

      const result = await getScoutNotificationCount('p1');

      expect(result).toBe(0);
    });
  });

  describe('getScoutNotifications', () => {
    it('returns unread scout logs with scouter names', async () => {
      mockPrisma.pvpScoutLog.findMany.mockResolvedValue([
        { id: 's1', scouterId: 'p2', targetId: 'p1', isRead: false, createdAt: new Date('2026-03-01T12:00:00Z'), scouter: { username: 'Scout1' } },
        { id: 's2', scouterId: 'p3', targetId: 'p1', isRead: false, createdAt: new Date('2026-03-01T11:00:00Z'), scouter: { username: 'Scout2' } },
      ]);

      const result = await getScoutNotifications('p1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('s1');
      expect(result[0].scouterName).toBe('Scout1');
      expect(result[0].createdAt).toBe('2026-03-01T12:00:00.000Z');
    });

    it('returns empty array when no unread scouts', async () => {
      mockPrisma.pvpScoutLog.findMany.mockResolvedValue([]);

      const result = await getScoutNotifications('p1');

      expect(result).toEqual([]);
    });

    it('limits scout notifications to MAX_SCOUT_NOTIFICATIONS', async () => {
      mockPrisma.pvpScoutLog.findMany.mockResolvedValue([]);

      await getScoutNotifications('player-1');

      expect(mockPrisma.pvpScoutLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: QUERY_LIMITS.MAX_SCOUT_NOTIFICATIONS }),
      );
    });
  });

  describe('markScoutNotificationsRead', () => {
    it('marks specific scout logs as read when ids provided', async () => {
      mockPrisma.pvpScoutLog.updateMany.mockResolvedValue({ count: 1 });

      await markScoutNotificationsRead('p1', ['s1']);

      expect(mockPrisma.pvpScoutLog.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['s1'] }, targetId: 'p1' },
        data: { isRead: true },
      });
    });

    it('marks all unread scout logs when no ids provided', async () => {
      mockPrisma.pvpScoutLog.updateMany.mockResolvedValue({ count: 3 });

      await markScoutNotificationsRead('p1');

      expect(mockPrisma.pvpScoutLog.updateMany).toHaveBeenCalledWith({
        where: { targetId: 'p1', isRead: false },
        data: { isRead: true },
      });
    });
  });

  // -------------------------------------------------------------------------
  // computeBracketBounds
  // -------------------------------------------------------------------------

  describe('computeBracketBounds', () => {
    it('rating 0 produces bracket [0, 100] (not [0, 0])', () => {
      const bounds = computeBracketBounds(0);
      expect(bounds.lower).toBe(0);
      expect(bounds.upper).toBe(100);
    });

    it('rating 400 uses min half-width since 400*0.25 = 100 equals MIN_BRACKET_HALF_WIDTH', () => {
      const bounds = computeBracketBounds(400);
      // percentLower = floor(400 * 0.75) = 300, min(300, 400-100=300) = 300
      // percentUpper = ceil(400 * 1.25) = 500, max(500, 400+100=500) = 500
      expect(bounds.lower).toBe(300);
      expect(bounds.upper).toBe(500);
    });

    it('rating 1000 uses percentage-based bracket [750, 1250]', () => {
      const bounds = computeBracketBounds(1000);
      expect(bounds.lower).toBe(750);
      expect(bounds.upper).toBe(1250);
    });

    it('low rating (50) gets minimum width protection', () => {
      const bounds = computeBracketBounds(50);
      // percentLower = floor(50 * 0.75) = 37, min(37, 50-100=-50) → max(0, -50) = 0
      // percentUpper = ceil(50 * 1.25) = 63, max(63, 50+100=150) = 150
      expect(bounds.lower).toBe(0);
      expect(bounds.upper).toBe(150);
    });
  });

  // -------------------------------------------------------------------------
  // getLadder bracket widening
  // -------------------------------------------------------------------------

  describe('getLadder bracket widening', () => {
    it('includes opponents outside initial bracket when too few in range', async () => {
      mockPrisma.pvpRating.upsert.mockResolvedValue({
        playerId: 'p1', rating: 1000, wins: 0, losses: 0, draws: 0, winStreak: 0, bestRating: 1000,
      });
      mockPrisma.player.findUnique.mockResolvedValue({ account: { role: 'player' } });
      mockPrisma.pvpCooldown.findMany.mockResolvedValue([]);

      // Return mix of in-bracket and out-of-bracket opponents
      const bounds = computeBracketBounds(1000);
      mockPrisma.pvpRating.findMany.mockResolvedValue([
        // In initial bracket
        { playerId: 'p2', rating: bounds.lower + 10, player: { username: 'Near', characterLevel: 12, account: { role: 'player' }, activeTitle: null } },
        // Outside initial bracket but within widened range
        ...Array.from({ length: 10 }, (_, i) => ({
          playerId: `p${i + 3}`, rating: bounds.upper + 50 + i, player: { username: `Far${i}`, characterLevel: 12, account: { role: 'player' }, activeTitle: null },
        })),
      ]);

      const result = await getLadder('p1');

      // Widening should include the outer opponents since initial bracket only has 1
      expect(result.opponents.length).toBe(11);
      // Only one DB query (single fetch + client-side filtering)
      expect(mockPrisma.pvpRating.findMany).toHaveBeenCalledTimes(1);
    });

    it('returns only initial bracket opponents when enough are available', async () => {
      mockPrisma.pvpRating.upsert.mockResolvedValue({
        playerId: 'p1', rating: 1000, wins: 0, losses: 0, draws: 0, winStreak: 0, bestRating: 1000,
      });
      mockPrisma.player.findUnique.mockResolvedValue({ account: { role: 'player' } });
      mockPrisma.pvpCooldown.findMany.mockResolvedValue([]);
      mockPrisma.pvpRating.findMany.mockResolvedValue(
        Array.from({ length: 12 }, (_, i) => ({
          playerId: `p${i + 2}`, rating: 950 + i, player: { username: `Player${i}`, characterLevel: 12, account: { role: 'player' }, activeTitle: null },
        })),
      );

      const result = await getLadder('p1');

      expect(result.opponents.length).toBe(12);
      expect(mockPrisma.pvpRating.findMany).toHaveBeenCalledTimes(1);
    });

    it('returns empty when no opponents exist in widest range', async () => {
      mockPrisma.pvpRating.upsert.mockResolvedValue({
        playerId: 'p1', rating: 1000, wins: 0, losses: 0, draws: 0, winStreak: 0, bestRating: 1000,
      });
      mockPrisma.player.findUnique.mockResolvedValue({ account: { role: 'player' } });
      mockPrisma.pvpCooldown.findMany.mockResolvedValue([]);
      mockPrisma.pvpRating.findMany.mockResolvedValue([]);

      const result = await getLadder('p1');

      expect(result.opponents.length).toBe(0);
      expect(mockPrisma.pvpRating.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
