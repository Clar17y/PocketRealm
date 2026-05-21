import { describe, expect, it, vi } from 'vitest';

vi.mock('./core', () => ({
  fetchApi: vi.fn(),
}));

import { fetchApi } from './core';
import {
  getVocations,
  honeVocation,
  learnVocationTechnique,
  respecVocation,
} from './vocations';

describe('vocation API client', () => {
  it('loads the vocation snapshot', async () => {
    vi.mocked(fetchApi).mockResolvedValue({ data: null, error: null });

    await getVocations();

    expect(fetchApi).toHaveBeenCalledWith('/api/v1/vocations');
  });

  it('hones a vocation with a turn investment', async () => {
    vi.mocked(fetchApi).mockResolvedValue({ data: null, error: null });

    await honeVocation('weaponsmith', 25);

    expect(fetchApi).toHaveBeenCalledWith('/api/v1/vocations/hone', {
      method: 'POST',
      body: JSON.stringify({ vocationId: 'weaponsmith', turns: 25 }),
    });
  });

  it('learns and respecs vocation techniques', async () => {
    vi.mocked(fetchApi).mockResolvedValue({ data: null, error: null });

    await learnVocationTechnique('weaponsmith', 'weaponsmith_blood_groove');
    await respecVocation('weaponsmith');

    expect(fetchApi).toHaveBeenCalledWith('/api/v1/vocations/techniques/learn', {
      method: 'POST',
      body: JSON.stringify({ vocationId: 'weaponsmith', techniqueId: 'weaponsmith_blood_groove' }),
    });
    expect(fetchApi).toHaveBeenCalledWith('/api/v1/vocations/respec', {
      method: 'POST',
      body: JSON.stringify({ vocationId: 'weaponsmith' }),
    });
  });
});
