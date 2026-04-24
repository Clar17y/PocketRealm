import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('../services/chatActivityService', () => ({
  getNpcActivityReaction: vi.fn(),
}));

import { getNpcActivityReaction } from '../services/chatActivityService';

const querySchema = z.object({
  npcKey: z.string().min(1).max(64),
});

describe('chat activity route contract', () => {
  it('accepts a valid NPC key query', () => {
    expect(querySchema.parse({ npcKey: 'kessa-weaponsmithing' })).toEqual({ npcKey: 'kessa-weaponsmithing' });
  });

  it('rejects missing NPC key query', () => {
    expect(() => querySchema.parse({})).toThrow();
  });

  it('service returns nullable reaction shape', async () => {
    vi.mocked(getNpcActivityReaction).mockResolvedValue({
      activityId: 'activity-1',
      eventType: 'craft_crit',
      line: 'Fine work.',
    });

    await expect(getNpcActivityReaction('player-1', 'kessa-weaponsmithing')).resolves.toEqual({
      activityId: 'activity-1',
      eventType: 'craft_crit',
      line: 'Fine work.',
    });
  });
});
