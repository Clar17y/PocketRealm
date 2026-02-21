import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@adventure/database', () => import('../__mocks__/database.js'));
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
vi.mock('@adventure/game-engine', () => ({
  buildPlayerCombatStats: vi.fn().mockReturnValue({
    attack: 15, defence: 10, magicPower: 0, magicDefence: 5,
    accuracy: 60, dodge: 10, speed: 5, damageMin: 5, damageMax: 15,
    critChance: 0.05, critDamage: 1.5, maxHp: 100, currentHp: 100,
  }),
  calculateFleeResult: vi.fn().mockReturnValue({ outcome: 'escape', remainingHp: 1 }),
  runCombat: vi.fn().mockReturnValue({
    outcome: 'victory',
    log: [],
    combatantAHpRemaining: 80,
    combatantBHpRemaining: 0,
    combatantAMaxHp: 100,
    combatantBMaxHp: 100,
    potionsConsumed: [],
  }),
  calculateMaxHp: vi.fn().mockReturnValue(100),
}));

import { prisma } from '@adventure/database';
import { getHpState } from './hpService';
import {
  getOrCreateRating,
  getLadder,
  scoutOpponent,
  challenge,
  getHistory,
  getMatchDetail,
  getNotificationCount,
  markNotificationsRead,
} from './pvpService';

const mockPrisma = prisma as unknown as Record<string, any>;

function setupChallengeMocks() {
  mockPrisma.player.findUnique
    .mockResolvedValueOnce({ characterLevel: 10, attributes: {}, currentZone: { id: 'z1', zoneType: 'town' } })
    .mockResolvedValueOnce({ characterLevel: 10, attributes: {}, username: 'Target', isBot: false });
  mockPrisma.pvpRating.upsert
    .mockResolvedValueOnce({ playerId: 'p1', rating: 1000, wins: 0, losses: 0, draws: 0, winStreak: 0, bestWinStreak: 0, bestRating: 1000 })
    .mockResolvedValueOnce({ playerId: 'p2', rating: 1000, wins: 0, losses: 0, draws: 0, winStreak: 0, bestWinStreak: 0, bestRating: 1000 });
  mockPrisma.pvpCooldown.findUnique.mockResolvedValue(null);
  mockPrisma.pvpMatch.findFirst.mockResolvedValue(null);
  mockPrisma.playerEquipment.findUnique.mockResolvedValue(null);
  mockPrisma.playerEquipment.findMany.mockResolvedValue([]);
  mockPrisma.playerSkill.findUnique.mockResolvedValue({ level: 10 });
  mockPrisma.playerSkill.findMany.mockResolvedValue([{ level: 10 }]);
  mockPrisma.pvpRating.findUnique.mockResolvedValue({ rating: 1000 });
  mockPrisma.pvpRating.update.mockResolvedValue({});
  mockPrisma.pvpMatch.create.mockResolvedValue({ id: 'match-1' });
  mockPrisma.pvpCooldown.upsert.mockResolvedValue({});
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
      const expected = { playerId: 'p1', rating: 1000, wins: 0, losses: 0, draws: 0 };
      mockPrisma.pvpRating.upsert.mockResolvedValue(expected);

      const result = await getOrCreateRating('p1');

      expect(result).toEqual(expected);
      expect(mockPrisma.pvpRating.upsert).toHaveBeenCalledWith({
        where: { playerId: 'p1' },
        update: {},
        create: { playerId: 'p1', rating: 1000, bestRating: 1000 },
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
      mockPrisma.pvpCooldown.findMany.mockResolvedValue([]);
      mockPrisma.pvpRating.findMany.mockResolvedValue([
        {
          playerId: 'p2', rating: 950,
          player: { username: 'Rival', characterLevel: 15, activeTitle: null },
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
      mockPrisma.pvpCooldown.findMany.mockResolvedValue([{ defenderId: 'p2' }]);
      mockPrisma.pvpRating.findMany.mockResolvedValue([
        {
          playerId: 'p2', rating: 950,
          player: { username: 'CooldownGuy', characterLevel: 12, activeTitle: null },
        },
        {
          playerId: 'p3', rating: 1020,
          player: { username: 'Available', characterLevel: 14, activeTitle: null },
        },
      ]);

      const result = await getLadder('p1');

      expect(result.opponents).toHaveLength(1);
      expect(result.opponents[0].playerId).toBe('p3');
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

    it('returns power ratings on success', async () => {
      mockPrisma.player.findUnique
        .mockResolvedValueOnce({ currentZone: { zoneType: 'town' } })
        .mockResolvedValueOnce({ characterLevel: 12, attributes: {} })
        .mockResolvedValueOnce({ attributes: {} })
        .mockResolvedValueOnce({ attributes: {} });
      mockPrisma.playerEquipment.findMany.mockResolvedValue([]);
      mockPrisma.playerSkill.findMany.mockResolvedValue([{ level: 5 }]);

      const result = await scoutOpponent('p1', 'p2');

      expect(result.combatLevel).toBe(12);
      expect(result.attackStyle).toBe('melee');
      expect(typeof result.powerRating).toBe('number');
      expect(typeof result.myPowerRating).toBe('number');
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
        characterLevel: 10, attributes: {}, currentZone: { id: 'z1', zoneType: 'wild' },
      });

      await expect(challenge('p1', 'Attacker', 'p2')).rejects.toThrow('Must be in a town to challenge');
    });

    it('returns match result on success', async () => {
      setupChallengeMocks();

      const result = await challenge('p1', 'Attacker', 'p2');

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

    it('creates pvpMatch and upserts cooldown in transaction', async () => {
      setupChallengeMocks();

      await challenge('p1', 'Attacker', 'p2');

      expect(mockPrisma.pvpMatch.create).toHaveBeenCalled();
      expect(mockPrisma.pvpCooldown.upsert).toHaveBeenCalled();
      expect(mockPrisma.pvpRating.update).toHaveBeenCalledTimes(2);
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

    it('returns match detail for participant', async () => {
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
});
