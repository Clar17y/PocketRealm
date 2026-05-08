import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    getActiveSeason: vi.fn(),
    getCrownCollectors: vi.fn(),
    getHallOfFame: vi.fn(),
    getLeaderboard: vi.fn(),
    getLeaderboardCategories: vi.fn(),
    getPublicSeasonArchives: vi.fn(),
  };
});

import {
  getActiveSeason,
  getCrownCollectors,
  getHallOfFame,
  getLeaderboard,
  getLeaderboardCategories,
  getPublicSeasonArchives,
} from '@/lib/api';
import { PublicRankings } from './PublicRankings';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

function crownEntry(username: string, rank = 1) {
  return {
    rank,
    username,
    characterLevel: 12,
    crowns: { gold: 1, silver: 1, bronze: 2, total: 4 },
    topGroups: [{ group: 'PvP', count: 2 }],
  };
}

function primeApi() {
  vi.mocked(getLeaderboardCategories).mockResolvedValue({
    data: {
      groups: [
        {
          name: 'PvP',
          categories: [{ slug: 'pvp_rating', label: 'PvP Rating' }],
        },
        {
          name: 'Progression',
          categories: [
            { slug: 'character_level', label: 'Character Level' },
            { slug: 'character_xp', label: 'Total XP' },
          ],
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
  vi.mocked(getPublicSeasonArchives).mockResolvedValue({ data: { archives: [] }, error: null });
  vi.mocked(getCrownCollectors).mockResolvedValue({
    data: {
      entries: [crownEntry('Arden')],
      myRank: null,
      totalPlayers: 1,
      lastRefreshedAt: '2026-04-20T00:00:00.000Z',
    },
    error: null,
  });
  vi.mocked(getLeaderboard).mockResolvedValue({
    data: {
      category: 'character_xp',
      entries: [{ rank: 1, username: 'XP Hero', characterLevel: 30, score: 5000, isBot: false }],
      myRank: null,
      totalPlayers: 1,
      lastRefreshedAt: '2026-04-20T00:00:00.000Z',
      period: 'weekly',
    },
    error: null,
  });
  vi.mocked(getHallOfFame).mockResolvedValue({ data: { entries: [] }, error: null });
}

describe('PublicRankings', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/rankings');
    primeApi();
  });

  it('defaults to Preseason Total XP leaderboards', async () => {
    render(<PublicRankings />);

    await waitFor(() => expect(getLeaderboard).toHaveBeenCalledWith('character_xp', false, null, 'alltime'));
    expect(screen.getByRole('heading', { name: 'Realm Rankings' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Leaderboards' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Preseason' }).className).toContain('bg-[var(--rpg-gold)]');
    expect(screen.getByRole('button', { name: 'Progression' }).className).toContain('bg-[var(--rpg-gold)]');
    expect(screen.getByText('XP Hero')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Total XP' })).toBeTruthy();
  });

  it('loads crown collectors when the crowns tab is selected', async () => {
    render(<PublicRankings />);

    fireEvent.click(screen.getByRole('button', { name: 'Crowns' }));

    await waitFor(() => expect(getCrownCollectors).toHaveBeenCalledWith(false));
    expect(screen.getByText('Arden')).toBeTruthy();
    expect(screen.getByText('4 crowns')).toBeTruthy();
  });

  it('can render inside another page without its own main landmark', async () => {
    const { container } = render(<PublicRankings embedded />);

    await waitFor(() => expect(getLeaderboard).toHaveBeenCalledWith('character_xp', false, null, 'alltime'));
    expect(container.querySelector('main')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Realm Rankings' })).toBeTruthy();
  });

  it('loads weekly rankings when the weekly tab is selected', async () => {
    render(<PublicRankings />);

    fireEvent.click(screen.getByRole('button', { name: 'Weekly' }));

    await waitFor(() => expect(getLeaderboard).toHaveBeenCalledWith('character_xp', false, null, 'weekly'));
    expect(screen.getByText('XP Hero')).toBeTruthy();
  });

  it('loads weekly rankings from the initial tab prop', async () => {
    render(<PublicRankings initialTab="weekly" />);

    await waitFor(() => expect(getLeaderboard).toHaveBeenCalledWith('character_xp', false, null, 'weekly'));
    expect(screen.getByText('XP Hero')).toBeTruthy();
  });

  it('clears leaderboard loading state when the request rejects', async () => {
    vi.mocked(getLeaderboard).mockRejectedValue(new Error('network failed'));

    render(<PublicRankings />);

    await waitFor(() => expect(screen.queryByText('Loading rankings...')).toBeNull());
    expect(screen.getByText('No rankings available yet.')).toBeTruthy();
  });

  it('loads hall of fame season options from the public archives endpoint', async () => {
    vi.mocked(getActiveSeason).mockResolvedValue({ data: { season: null }, error: null });
    vi.mocked(getPublicSeasonArchives).mockResolvedValue({
      data: {
        archives: [
          {
            id: 'season-2',
            name: 'Season 2',
            status: 'archived',
            startsAt: '2026-06-01T00:00:00.000Z',
            endsAt: '2026-07-01T00:00:00.000Z',
          },
        ],
      },
      error: null,
    });

    render(<PublicRankings initialTab="hallOfFame" />);

    await waitFor(() => expect(getPublicSeasonArchives).toHaveBeenCalled());
    await waitFor(() => expect(getHallOfFame).toHaveBeenCalledWith('season-2'));
    expect(screen.getByRole('option', { name: 'Season 2' })).toBeTruthy();
  });

  it('does not use the active season as a hall of fame archive', async () => {
    render(<PublicRankings initialTab="hallOfFame" />);

    await waitFor(() => expect(getPublicSeasonArchives).toHaveBeenCalled());
    expect(getHallOfFame).not.toHaveBeenCalled();
    expect(screen.getByText('No seasonal results are archived yet.')).toBeTruthy();
  });

  it('can request the signed-in crown collector rank', async () => {
    vi.mocked(getCrownCollectors).mockResolvedValue({
      data: {
        entries: [crownEntry('Arden')],
        myRank: crownEntry('Meadow', 10),
        totalPlayers: 10,
        lastRefreshedAt: '2026-04-20T00:00:00.000Z',
      },
      error: null,
    });

    render(<PublicRankings initialTab="crowns" />);

    await screen.findByRole('button', { name: 'View My Rank' });
    fireEvent.click(screen.getByRole('button', { name: 'View My Rank' }));

    await waitFor(() => expect(getCrownCollectors).toHaveBeenCalledWith(true));
  });
});
