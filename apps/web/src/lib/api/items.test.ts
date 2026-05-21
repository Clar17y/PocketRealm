import { describe, expect, it, vi } from 'vitest';

vi.mock('./core', () => ({
  fetchApi: vi.fn(),
}));

import { fetchApi } from './core';
import { craft, mine } from './items';

describe('item action API clients', () => {
  it('sends an optional craft technique id when crafting', async () => {
    vi.mocked(fetchApi).mockResolvedValue({ data: null, error: null });

    await (craft as (recipeId: string, quantity: number, techniqueId?: string) => unknown)(
      'recipe-1',
      2,
      'weaponsmith_blood_groove',
    );

    expect(fetchApi).toHaveBeenCalledWith('/api/v1/crafting/craft', {
      method: 'POST',
      body: JSON.stringify({
        recipeId: 'recipe-1',
        quantity: 2,
        techniqueId: 'weaponsmith_blood_groove',
      }),
    });
  });

  it('sends an optional gathering technique id when mining', async () => {
    vi.mocked(fetchApi).mockResolvedValue({ data: null, error: null });

    await (mine as (playerNodeId: string, turns: number, techniqueId?: string) => unknown)(
      'node-1',
      30,
      'prospector_clean_split',
    );

    expect(fetchApi).toHaveBeenCalledWith('/api/v1/gathering/mine', {
      method: 'POST',
      body: JSON.stringify({
        playerNodeId: 'node-1',
        turns: 30,
        techniqueId: 'prospector_clean_split',
      }),
    });
  });
});
