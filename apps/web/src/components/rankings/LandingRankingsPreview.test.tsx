import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    getPublicLeaderboardSummary: vi.fn(),
  };
});

import { getPublicLeaderboardSummary } from '@/lib/api';
import { LandingRankingsPreview } from './LandingRankingsPreview';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LandingRankingsPreview', () => {
  it('renders crown collectors and weekly leaders', async () => {
    vi.mocked(getPublicLeaderboardSummary).mockResolvedValue({
      data: {
        crownCollectors: [
          {
            rank: 1,
            username: 'Arden',
            characterLevel: 24,
            crowns: { gold: 1, silver: 1, bronze: 2, total: 4 },
            topGroups: [{ group: 'Adventure', count: 4 }],
          },
        ],
        weeklyLeaders: [
          {
            category: 'character_xp',
            label: 'Character XP',
            rank: 1,
            username: 'XP Hero',
            characterLevel: 30,
            score: 2500,
          },
        ],
        lastRefreshedAt: '2026-04-20T00:00:00.000Z',
      },
      error: null,
    });

    render(<LandingRankingsPreview />);

    await screen.findByRole('heading', { name: 'Realm Rankings' });
    expect(screen.getByText('Arden')).toBeTruthy();
    expect(screen.getByText('XP Hero')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View Rankings' }).getAttribute('href')).toBe('/rankings');
  });

  it('renders quiet empty states', async () => {
    vi.mocked(getPublicLeaderboardSummary).mockResolvedValue({
      data: {
        crownCollectors: [],
        weeklyLeaders: [],
        lastRefreshedAt: null,
      },
      error: null,
    });

    render(<LandingRankingsPreview />);

    await screen.findByRole('heading', { name: 'Realm Rankings' });
    expect(screen.getByText('No crowns awarded yet.')).toBeTruthy();
    expect(screen.getByText('Weekly race starts after the next snapshot.')).toBeTruthy();
  });

  it('does not render a broken panel when the API fails', async () => {
    vi.mocked(getPublicLeaderboardSummary).mockResolvedValue({
      data: null,
      error: 'Failed to load rankings',
    });

    render(<LandingRankingsPreview />);

    await waitFor(() => expect(getPublicLeaderboardSummary).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('heading', { name: 'Realm Rankings' })).toBeNull();
  });
});
