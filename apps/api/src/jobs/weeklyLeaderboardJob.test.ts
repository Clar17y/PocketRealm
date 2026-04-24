import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    exists: vi.fn(),
    del: vi.fn(),
    copy: vi.fn(),
    zadd: vi.fn(),
  },
  prisma: {
    season: { findMany: vi.fn() },
    playerSkill: { findMany: vi.fn() },
    player: { findMany: vi.fn() },
  },
  awardCrownsForCategory: vi.fn(),
  emitSystemMessage: vi.fn(),
  getIo: vi.fn(),
  getCategories: vi.fn(),
  refreshAllLeaderboards: vi.fn(),
  rebuildCrownCollectorSnapshot: vi.fn().mockResolvedValue({
    entries: [],
    totalPlayers: 0,
    lastRefreshedAt: '2026-04-24T12:00:00.000Z',
  }),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../redis', () => ({ redis: mocks.redis }));
vi.mock('@pocketrealm/database', () => ({ prisma: mocks.prisma }));
vi.mock('../services/crownService', () => ({ awardCrownsForCategory: mocks.awardCrownsForCategory }));
vi.mock('../services/systemMessageService', () => ({ emitSystemMessage: mocks.emitSystemMessage }));
vi.mock('../socket', () => ({ getIo: mocks.getIo }));
vi.mock('../services/leaderboardService', () => ({
  getCategories: mocks.getCategories,
  refreshAllLeaderboards: mocks.refreshAllLeaderboards,
}));
vi.mock('../services/crownLeaderboardService', () => ({
  rebuildCrownCollectorSnapshot: mocks.rebuildCrownCollectorSnapshot,
}));
vi.mock('../logger', () => ({ logger: mocks.logger }));

import { isWeeklyLeaderboardWindow, runWeeklyLeaderboardJob } from './weeklyLeaderboardJob';

describe('weeklyLeaderboardJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redis.get.mockResolvedValue(null);
    mocks.redis.set.mockResolvedValue('OK');
    mocks.redis.exists.mockResolvedValue(1);
    mocks.redis.copy.mockResolvedValue(1);
    mocks.redis.zadd.mockResolvedValue(1);
    mocks.prisma.season.findMany.mockResolvedValue([{ id: 'season-1' }]);
    mocks.prisma.playerSkill.findMany.mockResolvedValue([
      { playerId: 'p1', skillType: 'melee', xp: BigInt(1500) },
      { playerId: 'p1', skillType: 'alchemy', xp: BigInt(500) },
    ]);
    mocks.prisma.player.findMany.mockResolvedValue([
      { id: 'p1', characterXp: BigInt(2000) },
    ]);
    mocks.awardCrownsForCategory.mockResolvedValue([{ playerId: 'p1', rank: 1 }]);
    mocks.rebuildCrownCollectorSnapshot.mockResolvedValue({
      entries: [],
      totalPlayers: 0,
      lastRefreshedAt: '2026-04-24T12:00:00.000Z',
    });
    mocks.refreshAllLeaderboards.mockResolvedValue(undefined);
    mocks.getIo.mockReturnValue(null);
    mocks.getCategories.mockReturnValue({
      groups: [
        { name: 'PvP', categories: [{ slug: 'pvp_wins', label: 'PvP Wins' }] },
        { name: 'Skills', categories: [{ slug: 'skill_melee', label: 'Melee' }] },
      ],
    });
  });

  it('detects the Monday 00:00 UTC run window', () => {
    expect(isWeeklyLeaderboardWindow(new Date('2026-04-27T00:00:30.000Z'))).toBe(true);
    expect(isWeeklyLeaderboardWindow(new Date('2026-04-27T00:01:30.000Z'))).toBe(true);
    expect(isWeeklyLeaderboardWindow(new Date('2026-04-27T00:02:00.000Z'))).toBe(false);
    expect(isWeeklyLeaderboardWindow(new Date('2026-04-26T00:00:30.000Z'))).toBe(false);
  });

  it('skips when the weekly idempotency key already exists', async () => {
    mocks.redis.get.mockResolvedValue('1');

    await runWeeklyLeaderboardJob(new Date('2026-04-27T00:00:30.000Z'));

    expect(mocks.refreshAllLeaderboards).not.toHaveBeenCalled();
    expect(mocks.awardCrownsForCategory).not.toHaveBeenCalled();
    expect(mocks.redis.copy).not.toHaveBeenCalled();
  });

  it('awards prior-week crowns and snapshots permanent plus active seasonal realms', async () => {
    await runWeeklyLeaderboardJob(new Date('2026-04-27T00:00:30.000Z'));

    expect(mocks.refreshAllLeaderboards).toHaveBeenCalledTimes(1);
    expect(mocks.refreshAllLeaderboards.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.awardCrownsForCategory.mock.invocationCallOrder[0],
    );
    expect(mocks.awardCrownsForCategory).toHaveBeenCalledWith(
      'pvp_wins',
      new Date('2026-04-20T00:00:00.000Z'),
      null,
    );
    expect(mocks.awardCrownsForCategory).toHaveBeenCalledWith(
      'pvp_wins',
      new Date('2026-04-20T00:00:00.000Z'),
      'season-1',
    );
    expect(mocks.redis.copy).toHaveBeenCalledWith(
      'leaderboard:permanent:pvp_wins',
      'leaderboard:weekly_start:permanent:pvp_wins',
      'REPLACE',
    );
    expect(mocks.redis.copy).toHaveBeenCalledWith(
      'leaderboard:season-1:pvp_wins',
      'leaderboard:weekly_start:season-1:pvp_wins',
      'REPLACE',
    );
    expect(mocks.redis.zadd).toHaveBeenCalledWith(
      'leaderboard:weekly_start_xp:permanent:skill_melee',
      1500,
      'p1',
    );
    expect(mocks.rebuildCrownCollectorSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.redis.set).toHaveBeenCalledWith(
      'leaderboard:weekly_job_ran:2026-04-27',
      '1',
      'EX',
      604800,
    );
  });

  it('does not rebuild crown collector snapshot when no crowns are awarded', async () => {
    mocks.awardCrownsForCategory.mockResolvedValue([]);

    await runWeeklyLeaderboardJob(new Date('2026-04-27T00:00:30.000Z'));

    expect(mocks.rebuildCrownCollectorSnapshot).not.toHaveBeenCalled();
  });

  it('continues the weekly job lifecycle when crown collector snapshot rebuild fails', async () => {
    const err = new Error('snapshot unavailable');
    mocks.rebuildCrownCollectorSnapshot.mockRejectedValue(err);

    await expect(runWeeklyLeaderboardJob(new Date('2026-04-27T00:00:30.000Z'))).resolves.toBeUndefined();

    expect(mocks.rebuildCrownCollectorSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      { err },
      'Failed to rebuild crown collector snapshot after weekly crown awards',
    );
    expect(mocks.emitSystemMessage).toHaveBeenCalledWith(
      null,
      'world',
      'world',
      expect.any(String),
    );
    expect(mocks.redis.set).toHaveBeenCalledWith(
      'leaderboard:weekly_job_ran:2026-04-27',
      '1',
      'EX',
      604800,
    );
  });
});
