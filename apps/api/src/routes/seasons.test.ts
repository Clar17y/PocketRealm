import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CACHE_HEADER_CONSTANTS } from '@pocketrealm/shared';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));

import { mockPrisma } from '../__test__/setup';
import { seasonsRouter } from './seasons';

function findHandler(method: string, path: string) {
  const layer = (seasonsRouter as any).stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods[method],
  );
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} handler found`);
  const handlers = layer.route.stack.map((stackEntry: any) => stackEntry.handle);
  return handlers[handlers.length - 1];
}

function mockRes() {
  const res: any = {};
  res.set = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('seasons routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the active season snapshot', async () => {
    mockPrisma.season.findFirst.mockResolvedValue({
      id: 'season-1',
      name: 'Season 1',
      status: 'active',
      startsAt: new Date('2026-05-01T00:00:00.000Z'),
      endsAt: new Date('2026-06-01T00:00:00.000Z'),
      constantOverrides: { progression: { xpRate: 1.2 } },
      features: ['double_xp'],
    });

    const handler = findHandler('get', '/active');
    const res = mockRes();
    await handler({} as any, res, vi.fn());

    expect(mockPrisma.season.findFirst).toHaveBeenCalledWith({
      where: { status: 'active' },
      select: {
        id: true,
        name: true,
        status: true,
        startsAt: true,
        endsAt: true,
        constantOverrides: true,
        features: true,
      },
      orderBy: { startsAt: 'desc' },
    });
    expect(res.json).toHaveBeenCalledWith({
      season: expect.objectContaining({ id: 'season-1', status: 'active' }),
    });
  });

  it('returns public archived season summaries', async () => {
    mockPrisma.season.findMany.mockResolvedValue([
      {
        id: 'season-2',
        name: 'Season 2',
        status: 'archived',
        startsAt: new Date('2026-06-01T00:00:00.000Z'),
        endsAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    ]);

    const handler = findHandler('get', '/archives');
    const res = mockRes();
    await handler({} as any, res, vi.fn());

    expect(mockPrisma.season.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['ended', 'archived'] },
      },
      select: {
        id: true,
        name: true,
        status: true,
        startsAt: true,
        endsAt: true,
      },
      orderBy: { endsAt: 'desc' },
    });
    expect(res.set).toHaveBeenCalledWith('Cache-Control', CACHE_HEADER_CONSTANTS.PUBLIC_LONG);
    expect(res.json).toHaveBeenCalledWith({
      archives: [
        expect.objectContaining({
          id: 'season-2',
          name: 'Season 2',
          status: 'archived',
        }),
      ],
    });
  });

  it('returns ordered hall-of-fame entries for a season', async () => {
    mockPrisma.hallOfFameEntry.findMany.mockResolvedValue([
      {
        category: 'pvp_rating',
        rank: 1,
        accountId: 'account-1',
        username: 'Rook',
        value: 1500,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    ]);

    const handler = findHandler('get', '/:id/hall-of-fame');
    const res = mockRes();
    await handler({ params: { id: 'season-1' } } as any, res, vi.fn());

    expect(mockPrisma.hallOfFameEntry.findMany).toHaveBeenCalledWith({
      where: { seasonId: 'season-1' },
      select: {
        category: true,
        rank: true,
        accountId: true,
        username: true,
        value: true,
        createdAt: true,
      },
      orderBy: [
        { category: 'asc' },
        { rank: 'asc' },
      ],
    });
    expect(res.set).toHaveBeenCalledWith('Cache-Control', CACHE_HEADER_CONSTANTS.PUBLIC_LONG);
    expect(res.json).toHaveBeenCalledWith({
      entries: [
        expect.objectContaining({
          category: 'pvp_rating',
          rank: 1,
          username: 'Rook',
        }),
      ],
    });
  });
});
