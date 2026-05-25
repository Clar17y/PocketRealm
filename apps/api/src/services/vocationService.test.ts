import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockPrisma } from '../__test__/setup';
import { Prisma } from '@pocketrealm/database';
import { VOCATION_MASTERY, getVocationXpForRank } from '@pocketrealm/shared';
import type { VocationId } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';

vi.mock('./guildTaxService', () => ({
  spendWithTaxTx: vi.fn().mockResolvedValue({
    turnSpend: {
      previousTurns: 50,
      spent: 12,
      currentTurns: 38,
      lastRegenAt: '2026-05-20T10:00:00.000Z',
      timeToCapMs: 1000,
    },
    taxResult: {
      preTaxAmount: 12,
      taxAmount: 2,
      postTaxAmount: 10,
      taxRatePercent: 20,
      guildId: 'guild-1',
    },
  }),
  taxInfoFromResult: vi.fn((taxResult) =>
    taxResult.guildId
      ? { rate: taxResult.taxRatePercent, amount: taxResult.taxAmount, guildId: taxResult.guildId }
      : null,
  ),
}));

import { spendWithTaxTx } from './guildTaxService';
import {
  getVocationSnapshot,
  grantPassiveVocationXpTx,
  honeVocation,
  learnTechnique,
  respecVocation,
} from './vocationService';

const PLAYER_ID = 'player-1';
const NOW = new Date('2026-05-21T13:30:00.000Z');
const TODAY = new Date('2026-05-21T00:00:00.000Z');
const YESTERDAY = new Date('2026-05-20T00:00:00.000Z');
const mockTx = mockPrisma as unknown as Prisma.TransactionClient;

function mockModel() {
  return {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  };
}

function setupVocationModels() {
  mockPrisma.playerVocation = mockModel();
  mockPrisma.playerVocationTechnique = mockModel();
  mockPrisma.playerVocationDailyCap = mockModel();
  mockPrisma.playerVocationCounter = mockModel();
}

function setTown(name = 'Millbrook Market') {
  mockPrisma.player.findUnique.mockResolvedValue({
    currentZone: { zoneType: 'town', name },
  });
}

function expectAppErrorCode(error: unknown, code: string) {
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

function vocationRow(overrides: Partial<{
  vocationId: VocationId;
  xp: number;
  rank: number;
  masteryPoints: number;
  spentPoints: number;
}> = {}) {
  return {
    playerId: PLAYER_ID,
    vocationId: overrides.vocationId ?? 'prospector',
    xp: overrides.xp ?? 0,
    rank: overrides.rank ?? 1,
    masteryPoints: overrides.masteryPoints ?? 0,
    spentPoints: overrides.spentPoints ?? 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setupVocationModels();
  mockPrisma.$transaction.mockImplementation((fnOrArray: ((tx: unknown) => Promise<unknown>) | unknown[]) => {
    if (typeof fnOrArray === 'function') return fnOrArray(mockPrisma);
    return Promise.all(fnOrArray);
  });
  mockPrisma.playerVocation.findMany.mockResolvedValue([]);
  mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([]);
  mockPrisma.playerVocationDailyCap.findUnique.mockResolvedValue(null);
  setTown();
});

describe('vocationService', () => {
  it('returns all vocation snapshots and displays stale daily caps as the current UTC day', async () => {
    mockPrisma.playerVocation.findMany.mockResolvedValue([
      vocationRow({ vocationId: 'prospector', xp: getVocationXpForRank(2), rank: 2, masteryPoints: 1, spentPoints: 1 }),
    ]);
    mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([
      { vocationId: 'prospector', techniqueId: 'prospector_clean_split' },
    ]);
    mockPrisma.playerVocationDailyCap.findUnique.mockResolvedValue({
      playerId: PLAYER_ID,
      dayStart: YESTERDAY,
      turnsSpent: 99,
      updatedAt: YESTERDAY,
    });

    const snapshot = await getVocationSnapshot(PLAYER_ID, NOW);

    expect(snapshot.vocations).toHaveLength(11);
    expect(snapshot.vocations.find((vocation) => vocation.vocationId === 'prospector')).toMatchObject({
      xp: getVocationXpForRank(2),
      rank: 2,
      masteryPointsEarned: 1,
      spentPoints: 1,
      availableMasteryPoints: 0,
      learnedTechniqueIds: ['prospector_clean_split'],
    });
    expect(snapshot.vocations.find((vocation) => vocation.vocationId === 'alchemist')).toMatchObject({
      xp: 0,
      rank: 1,
      spentPoints: 0,
      learnedTechniqueIds: [],
    });
    expect(snapshot.dailyCap).toEqual({
      dayStart: TODAY.toISOString(),
      turnsSpent: 0,
      turnsLimit: VOCATION_MASTERY.DAILY_HONING_TURN_LIMIT,
      turnsRemaining: VOCATION_MASTERY.DAILY_HONING_TURN_LIMIT,
    });
  });

  it('active honing spends turns through guild tax, grants base-turn XP, and increments daily cap', async () => {
    mockPrisma.playerVocationDailyCap.findUnique.mockResolvedValue({
      playerId: PLAYER_ID,
      dayStart: TODAY,
      turnsSpent: 10,
      updatedAt: TODAY,
    });
    mockPrisma.playerVocation.upsert.mockResolvedValue(
      vocationRow({ vocationId: 'prospector', xp: 30, rank: 1, masteryPoints: 0 }),
    );
    mockPrisma.playerVocation.findMany.mockResolvedValue([
      vocationRow({ vocationId: 'prospector', xp: 30, rank: 1, masteryPoints: 0 }),
    ]);

    const result = await honeVocation({
      playerId: PLAYER_ID,
      vocationId: 'prospector',
      turns: 300,
      now: NOW,
    });

    expect(spendWithTaxTx).toHaveBeenCalledWith(mockPrisma, PLAYER_ID, 300);
    expect(mockPrisma.playerVocationDailyCap.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { playerId: PLAYER_ID },
      create: { playerId: PLAYER_ID, dayStart: TODAY, turnsSpent: 0 },
      update: {},
    }));
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(mockPrisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.playerVocationDailyCap.findUnique.mock.invocationCallOrder[0],
    );
    expect(mockPrisma.playerVocationDailyCap.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.$queryRaw.mock.invocationCallOrder[1],
    );
    expect(mockPrisma.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      mockPrisma.playerVocation.findUnique.mock.invocationCallOrder[0],
    );
    expect(mockPrisma.playerVocation.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(spendWithTaxTx).mock.invocationCallOrder[0],
    );
    expect(mockPrisma.playerVocation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { playerId_vocationId: { playerId: PLAYER_ID, vocationId: 'prospector' } },
      create: expect.objectContaining({ xp: 30, rank: 1, masteryPoints: 0 }),
      update: expect.objectContaining({ xp: 30, rank: 1, masteryPoints: 0 }),
    }));
    expect(mockPrisma.playerVocationDailyCap.update).toHaveBeenCalledWith({
      where: { playerId: PLAYER_ID },
      data: { dayStart: TODAY, turnsSpent: 310 },
    });
    expect(mockPrisma.playerVocationCounter.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { playerId_statKey: { playerId: PLAYER_ID, statKey: 'vocation_honed_turns_total' } },
      update: { value: { increment: 300 } },
    }));
    expect(mockPrisma.playerVocationCounter.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { playerId_statKey: { playerId: PLAYER_ID, statKey: 'vocation_honed_turns_prospector' } },
      update: { value: { increment: 300 } },
    }));
    expect(result.vocation).toMatchObject({ vocationId: 'prospector', xp: 30 });
    expect(result.turnSpend).toMatchObject({ spent: 12 });
    expect(result.taxInfo).toEqual({ rate: 20, amount: 2, guildId: 'guild-1' });
  });

  it('allows basic honing for every vocation from any known town mentor', async () => {
    setTown('Millbrook Market');
    mockPrisma.playerVocationDailyCap.findUnique.mockResolvedValue({
      playerId: PLAYER_ID,
      dayStart: TODAY,
      turnsSpent: 0,
      updatedAt: TODAY,
    });
    mockPrisma.playerVocation.upsert.mockResolvedValue(
      vocationRow({ vocationId: 'weaponsmith', xp: 360, rank: 2, masteryPoints: 1 }),
    );
    mockPrisma.playerVocation.findMany.mockResolvedValue([
      vocationRow({ vocationId: 'weaponsmith', xp: 360, rank: 2, masteryPoints: 1 }),
    ]);

    await expect(honeVocation({
      playerId: PLAYER_ID,
      vocationId: 'weaponsmith',
      turns: 3600,
      now: NOW,
    })).resolves.toMatchObject({
      vocation: expect.objectContaining({ vocationId: 'weaponsmith' }),
    });
    expect(spendWithTaxTx).toHaveBeenCalledWith(mockPrisma, PLAYER_ID, 3600);
  });

  it('daily cap resets at UTC day start before active honing', async () => {
    mockPrisma.playerVocationDailyCap.findUnique.mockResolvedValue({
      playerId: PLAYER_ID,
      dayStart: YESTERDAY,
      turnsSpent: VOCATION_MASTERY.DAILY_HONING_TURN_LIMIT,
      updatedAt: YESTERDAY,
    });
    mockPrisma.playerVocation.upsert.mockResolvedValue(
      vocationRow({ vocationId: 'prospector', xp: 1, rank: 1, masteryPoints: 0 }),
    );

    await honeVocation({ playerId: PLAYER_ID, vocationId: 'prospector', turns: 10, now: NOW });

    expect(mockPrisma.playerVocationDailyCap.update).toHaveBeenCalledWith({
      where: { playerId: PLAYER_ID },
      data: { dayStart: TODAY, turnsSpent: 10 },
    });
  });

  it('active honing cannot exceed the daily cap', async () => {
    mockPrisma.playerVocationDailyCap.findUnique.mockResolvedValue({
      playerId: PLAYER_ID,
      dayStart: TODAY,
      turnsSpent: VOCATION_MASTERY.DAILY_HONING_TURN_LIMIT - 10,
      updatedAt: TODAY,
    });

    await expect(honeVocation({ playerId: PLAYER_ID, vocationId: 'prospector', turns: 20, now: NOW }))
      .rejects.toMatchObject({ code: 'VOCATION_DAILY_CAP_EXCEEDED' });
    expect(spendWithTaxTx).not.toHaveBeenCalled();
  });

  it('active honing rejects unknown vocations before spending turns', async () => {
    await expect(honeVocation({
      playerId: PLAYER_ID,
      vocationId: 'unknown' as VocationId,
      turns: 1,
      now: NOW,
    })).rejects.toMatchObject({ code: 'UNKNOWN_VOCATION' });

    expect(spendWithTaxTx).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('active honing rejects non-positive and non-integer turns before spending turns', async () => {
    await expect(honeVocation({
      playerId: PLAYER_ID,
      vocationId: 'prospector',
      turns: 0,
      now: NOW,
    })).rejects.toMatchObject({ code: 'INVALID_TURNS' });
    await expect(honeVocation({
      playerId: PLAYER_ID,
      vocationId: 'prospector',
      turns: 1.5,
      now: NOW,
    })).rejects.toMatchObject({ code: 'INVALID_TURNS' });

    expect(spendWithTaxTx).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('passive craft and gather XP progresses vocations without spending turns', async () => {
    mockPrisma.playerVocation.findUnique.mockResolvedValue(vocationRow({ vocationId: 'weaponsmith', xp: 290 }));
    mockPrisma.playerVocation.upsert.mockResolvedValue(
      vocationRow({ vocationId: 'weaponsmith', xp: 310, rank: 2, masteryPoints: 1 }),
    );

    const craft = await grantPassiveVocationXpTx({
      tx: mockTx,
      playerId: PLAYER_ID,
      vocationId: 'weaponsmith',
      source: 'craft',
      baseXp: 100,
    });

    expect(craft).toMatchObject({ vocationId: 'weaponsmith', xp: 310, rank: 2, masteryPointsEarned: 1 });
    expect(spendWithTaxTx).not.toHaveBeenCalled();
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockPrisma.playerVocation.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.$queryRaw.mock.invocationCallOrder[0],
    );
    expect(mockPrisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.playerVocation.findUnique.mock.invocationCallOrder[0],
    );
    expect(mockPrisma.playerVocation.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.playerVocation.upsert.mock.invocationCallOrder[1],
    );

    mockPrisma.playerVocation.findUnique.mockResolvedValue(vocationRow({ vocationId: 'prospector', xp: 0 }));
    mockPrisma.playerVocation.upsert.mockResolvedValue(
      vocationRow({ vocationId: 'prospector', xp: 15, rank: 1, masteryPoints: 0 }),
    );

    const gather = await grantPassiveVocationXpTx({
      tx: mockTx,
      playerId: PLAYER_ID,
      vocationId: 'prospector',
      source: 'gather',
      baseXp: 100,
    });

    expect(gather).toMatchObject({ vocationId: 'prospector', xp: 15, rank: 1 });
  });

  it('passive XP returns current zero state without creating rows when computed XP is not positive', async () => {
    mockPrisma.playerVocation.findUnique.mockResolvedValue(null);

    const state = await grantPassiveVocationXpTx({
      tx: mockTx,
      playerId: PLAYER_ID,
      vocationId: 'prospector',
      source: 'craft',
      baseXp: 1,
    });

    expect(state).toMatchObject({ vocationId: 'prospector', xp: 0, rank: 1 });
    expect(mockPrisma.playerVocation.upsert).not.toHaveBeenCalled();
  });

  it('learning a technique spends mastery points and rejects wrong vocation, low rank, and duplicate learns', async () => {
    mockPrisma.playerVocation.findUnique.mockResolvedValue(
      vocationRow({ vocationId: 'prospector', xp: getVocationXpForRank(2), rank: 2, masteryPoints: 1, spentPoints: 0 }),
    );
    mockPrisma.playerVocationTechnique.findUnique.mockResolvedValue(null);
    mockPrisma.playerVocation.update.mockResolvedValue(
      vocationRow({ vocationId: 'prospector', xp: getVocationXpForRank(2), rank: 2, masteryPoints: 1, spentPoints: 1 }),
    );

    await learnTechnique({
      playerId: PLAYER_ID,
      vocationId: 'prospector',
      techniqueId: 'prospector_clean_split',
      now: NOW,
    });

    expect(mockPrisma.playerVocationTechnique.create).toHaveBeenCalledWith({
      data: { playerId: PLAYER_ID, vocationId: 'prospector', techniqueId: 'prospector_clean_split' },
    });
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockPrisma.playerVocation.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.$queryRaw.mock.invocationCallOrder[0],
    );
    expect(mockPrisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.playerVocation.findUnique.mock.invocationCallOrder[0],
    );
    expect(mockPrisma.playerVocation.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.playerVocation.update.mock.invocationCallOrder[0],
    );
    expect(mockPrisma.playerVocation.update).toHaveBeenCalledWith({
      where: { playerId_vocationId: { playerId: PLAYER_ID, vocationId: 'prospector' } },
      data: { spentPoints: { increment: 1 } },
    });

    await expect(learnTechnique({
      playerId: PLAYER_ID,
      vocationId: 'prospector',
      techniqueId: 'missing_technique',
      now: NOW,
    })).rejects.toMatchObject({ code: 'TECHNIQUE_NOT_FOUND' });

    await expect(learnTechnique({
      playerId: PLAYER_ID,
      vocationId: 'weaponsmith',
      techniqueId: 'prospector_clean_split',
      now: NOW,
    })).rejects.toMatchObject({ code: 'TECHNIQUE_WRONG_VOCATION' });

    mockPrisma.playerVocation.findUnique.mockResolvedValue(vocationRow({ vocationId: 'prospector', rank: 1 }));
    await expect(learnTechnique({
      playerId: PLAYER_ID,
      vocationId: 'prospector',
      techniqueId: 'prospector_bright_inclusion',
      now: NOW,
    })).rejects.toMatchObject({ code: 'VOCATION_RANK_TOO_LOW' });

    mockPrisma.playerVocation.findUnique.mockResolvedValue(
      vocationRow({ vocationId: 'prospector', rank: 2, masteryPoints: 1, spentPoints: 1 }),
    );
    await expect(learnTechnique({
      playerId: PLAYER_ID,
      vocationId: 'prospector',
      techniqueId: 'prospector_clean_split',
      now: NOW,
    })).rejects.toMatchObject({ code: 'INSUFFICIENT_MASTERY_POINTS' });

    mockPrisma.playerVocation.findUnique.mockResolvedValue(
      vocationRow({ vocationId: 'prospector', rank: 2, masteryPoints: 1 }),
    );
    mockPrisma.playerVocationTechnique.findUnique.mockResolvedValue({
      playerId: PLAYER_ID,
      vocationId: 'prospector',
      techniqueId: 'prospector_clean_split',
    });
    await expect(learnTechnique({
      playerId: PLAYER_ID,
      vocationId: 'prospector',
      techniqueId: 'prospector_clean_split',
      now: NOW,
    })).rejects.toMatchObject({ code: 'TECHNIQUE_ALREADY_LEARNED' });
  });

  it('lets any town teach basic techniques but requires Thornwall for advanced techniques', async () => {
    setTown('Millbrook Market');
    mockPrisma.playerVocation.findUnique.mockResolvedValue(
      vocationRow({ vocationId: 'weaponsmith', xp: getVocationXpForRank(2), rank: 2, masteryPoints: 1, spentPoints: 0 }),
    );
    mockPrisma.playerVocationTechnique.findUnique.mockResolvedValue(null);
    mockPrisma.playerVocation.update.mockResolvedValue(
      vocationRow({ vocationId: 'weaponsmith', xp: getVocationXpForRank(2), rank: 2, masteryPoints: 1, spentPoints: 1 }),
    );

    await expect(learnTechnique({
      playerId: PLAYER_ID,
      vocationId: 'weaponsmith',
      techniqueId: 'weaponsmith_keen_edge',
      now: NOW,
    })).resolves.toMatchObject({
      vocation: expect.objectContaining({ vocationId: 'weaponsmith' }),
    });

    mockPrisma.playerVocation.findUnique.mockResolvedValue(
      vocationRow({ vocationId: 'weaponsmith', rank: 5, masteryPoints: 5, spentPoints: 0 }),
    );
    await expect(learnTechnique({
      playerId: PLAYER_ID,
      vocationId: 'weaponsmith',
      techniqueId: 'weaponsmith_crushing_poll',
      now: NOW,
    })).rejects.toMatchObject({ code: 'ADVANCED_MENTOR_REQUIRED' });

    setTown('Thornwall Keep');
    await expect(learnTechnique({
      playerId: PLAYER_ID,
      vocationId: 'weaponsmith',
      techniqueId: 'weaponsmith_crushing_poll',
      now: NOW,
    })).resolves.toMatchObject({
      vocation: expect.objectContaining({ vocationId: 'weaponsmith' }),
    });
  });

  it('respec refunds partial points while keeping XP, rank, and mastery points', async () => {
    mockPrisma.playerVocation.findUnique.mockResolvedValue(
      vocationRow({ vocationId: 'prospector', xp: getVocationXpForRank(4), rank: 4, masteryPoints: 3, spentPoints: 3 }),
    );
    mockPrisma.playerVocation.update.mockResolvedValue(
      vocationRow({ vocationId: 'prospector', xp: getVocationXpForRank(4), rank: 4, masteryPoints: 3, spentPoints: 2 }),
    );
    mockPrisma.playerVocation.findMany.mockResolvedValue([
      vocationRow({ vocationId: 'prospector', xp: getVocationXpForRank(4), rank: 4, masteryPoints: 3, spentPoints: 2 }),
    ]);

    const result = await respecVocation({ playerId: PLAYER_ID, vocationId: 'prospector', now: NOW });

    expect(mockPrisma.playerVocationTechnique.deleteMany).toHaveBeenCalledWith({
      where: { playerId: PLAYER_ID, vocationId: 'prospector' },
    });
    expect(mockPrisma.playerVocation.update).toHaveBeenCalledWith({
      where: { playerId_vocationId: { playerId: PLAYER_ID, vocationId: 'prospector' } },
      data: { spentPoints: 2 },
    });
    expect(mockPrisma.playerVocationCounter.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { playerId_statKey: { playerId: PLAYER_ID, statKey: 'vocation_respecs_total' } },
      update: { value: { increment: 1 } },
    }));
    expect(mockPrisma.playerVocationCounter.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { playerId_statKey: { playerId: PLAYER_ID, statKey: 'vocation_respecs_prospector' } },
      update: { value: { increment: 1 } },
    }));
    expect(result.vocation).toMatchObject({
      vocationId: 'prospector',
      xp: getVocationXpForRank(4),
      rank: 4,
      masteryPointsEarned: 3,
      spentPoints: 2,
      availableMasteryPoints: 1,
    });

    mockPrisma.playerVocation.findUnique.mockResolvedValue(vocationRow({ vocationId: 'prospector', spentPoints: 0 }));
    await expect(respecVocation({ playerId: PLAYER_ID, vocationId: 'prospector', now: NOW }))
      .rejects.toMatchObject({ code: 'NOTHING_TO_RESPEC' });
  });

  it('rejects active, learn, and respec actions outside known mentor towns', async () => {
    mockPrisma.player.findUnique.mockResolvedValueOnce({
      currentZone: { zoneType: 'wild', name: 'Old Forest' },
    });
    await honeVocation({ playerId: PLAYER_ID, vocationId: 'prospector', turns: 10, now: NOW })
      .then(() => {
        throw new Error('expected hone to fail');
      })
      .catch((error) => expectAppErrorCode(error, 'NOT_IN_TOWN'));

    mockPrisma.player.findUnique.mockResolvedValueOnce({
      currentZone: { zoneType: 'town', name: 'Unknown Village' },
    });
    await learnTechnique({
      playerId: PLAYER_ID,
      vocationId: 'prospector',
      techniqueId: 'prospector_clean_split',
      now: NOW,
    })
      .then(() => {
        throw new Error('expected learn to fail');
      })
      .catch((error) => expectAppErrorCode(error, 'WRONG_MENTOR_TOWN'));

    mockPrisma.player.findUnique.mockResolvedValueOnce({
      currentZone: { zoneType: 'town', name: 'Unknown Village' },
    });
    await respecVocation({ playerId: PLAYER_ID, vocationId: 'prospector', now: NOW })
      .then(() => {
        throw new Error('expected respec to fail');
      })
      .catch((error) => expectAppErrorCode(error, 'WRONG_MENTOR_TOWN'));
  });
});
