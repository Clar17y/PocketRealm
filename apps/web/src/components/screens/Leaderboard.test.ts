import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/leaderboard/LeaderboardTable', () => ({
  LeaderboardTable: ({
    entries,
    loading,
  }: {
    entries: Array<{ username: string }>;
    loading: boolean;
  }) => React.createElement(
    'div',
    null,
    loading ? 'loading' : entries.map((entry) => entry.username).join(', '),
  ),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    getLeaderboardCategories: vi.fn(),
    getLeaderboard: vi.fn(),
    getActiveSeason: vi.fn(),
    getSeasonArchives: vi.fn(),
    getHallOfFame: vi.fn(),
  };
});

import {
  getActiveSeason,
  getHallOfFame,
  getLeaderboard,
  getLeaderboardCategories,
  getSeasonArchives,
} from '@/lib/api';
import { Leaderboard } from './Leaderboard';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function primeApi() {
  vi.mocked(getLeaderboardCategories).mockResolvedValue({
    data: {
      groups: [
        {
          name: 'PvP',
          categories: [{ slug: 'pvp_rating', label: 'PvP Rating' }],
        },
      ],
    },
    error: null,
  });
  vi.mocked(getActiveSeason).mockResolvedValue({
    data: {
      season: {
        id: 'season-1',
        name: 'Season 1',
        status: 'active',
        startsAt: '2026-04-01T00:00:00.000Z',
        endsAt: '2026-05-01T00:00:00.000Z',
        constantOverrides: null,
        features: null,
      },
    },
    error: null,
  });
  vi.mocked(getSeasonArchives).mockResolvedValue({
    data: {
      archives: [
        {
          id: 'archive-1',
          username: 'Rook_S1',
          characterLevel: 20,
          characterXp: 1234,
          attributes: {},
          skills: [],
          stats: {},
          combatTemplates: [],
          leaderboardRanks: {},
          rewardsEarned: {},
          mergeLog: {},
          createdAt: '2026-04-20T00:00:00.000Z',
          season: {
            id: 'season-0',
            name: 'Preseason',
            startsAt: '2026-03-01T00:00:00.000Z',
            endsAt: '2026-03-20T00:00:00.000Z',
          },
        },
      ],
    },
    error: null,
  });
}

describe('Leaderboard', () => {
  it('loads rankings for the current season and can switch back to the permanent realm', async () => {
    primeApi();
    vi.mocked(getLeaderboard).mockResolvedValue({
      data: {
        category: 'pvp_rating',
        entries: [{ rank: 1, username: 'SeasonHero', characterLevel: 10, score: 1200, isBot: false }],
        myRank: null,
        totalPlayers: 1,
        lastRefreshedAt: '2026-04-20T00:00:00.000Z',
      },
      error: null,
    });
    vi.mocked(getHallOfFame).mockResolvedValue({ data: { entries: [] }, error: null });

    render(React.createElement(Leaderboard, { playerId: 'player-1', currentSeasonId: 'season-1' }));

    await waitFor(() => expect(getLeaderboard).toHaveBeenCalledWith('pvp_rating', false, 'season-1'));
    expect(screen.getByText('SeasonHero')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Permanent Realm' }));

    await waitFor(() => expect(getLeaderboard).toHaveBeenLastCalledWith('pvp_rating', false, null));
  });

  it('shows hall of fame entries grouped by category', async () => {
    primeApi();
    vi.mocked(getLeaderboard).mockResolvedValue({
      data: {
        category: 'pvp_rating',
        entries: [],
        myRank: null,
        totalPlayers: 0,
        lastRefreshedAt: null,
      },
      error: null,
    });
    vi.mocked(getHallOfFame).mockResolvedValue({
      data: {
        entries: [
          {
            category: 'pvp_rating',
            rank: 1,
            accountId: 'account-1',
            username: 'Champion',
            value: 2450,
            createdAt: '2026-04-20T00:00:00.000Z',
          },
        ],
      },
      error: null,
    });

    render(React.createElement(Leaderboard, { playerId: 'player-1', currentSeasonId: null }));

    fireEvent.click(screen.getByRole('button', { name: 'Hall of Fame' }));

    await waitFor(() => expect(getHallOfFame).toHaveBeenCalled());
    expect(screen.getByText('Pvp Rating')).toBeTruthy();
    expect(screen.getByText('#1 Champion')).toBeTruthy();
    expect(screen.getByText('2,450 points')).toBeTruthy();
  });
});
