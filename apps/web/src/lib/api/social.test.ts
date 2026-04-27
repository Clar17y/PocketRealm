import { describe, expect, it, vi } from 'vitest';

vi.mock('./core', () => ({
  fetchApi: vi.fn(),
}));

import { fetchApi } from './core';
import { getLeaderboard } from './social';

describe('leaderboard API client', () => {
  it('sends the permanent realm sentinel when seasonId is null', async () => {
    vi.mocked(fetchApi).mockResolvedValue({ data: null, error: null });

    await getLeaderboard('character_xp', false, null);

    expect(fetchApi).toHaveBeenCalledWith('/api/v1/leaderboard/character_xp?seasonId=permanent');
  });

  it('omits seasonId when the caller wants authenticated realm fallback', async () => {
    vi.mocked(fetchApi).mockResolvedValue({ data: null, error: null });

    await getLeaderboard('pvp_rating', true);

    expect(fetchApi).toHaveBeenCalledWith('/api/v1/leaderboard/pvp_rating?around_me=true');
  });
});
