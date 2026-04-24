import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../redis', () => ({
  redis: { set: vi.fn() },
}));

vi.mock('../socket', () => ({
  getIo: vi.fn(() => ({ to: vi.fn(() => ({ emit: vi.fn() })) })),
}));

vi.mock('./systemMessageService', () => ({
  emitSystemMessage: vi.fn(),
}));

import { redis } from '../redis';
import { mockPrisma } from '../__test__/setup';
import { emitSystemMessage } from './systemMessageService';
import {
  broadcastCraftActivity,
  broadcastRareLootActivity,
  getNpcActivityReaction,
} from './chatActivityService';

const mockRedis = redis as unknown as { set: ReturnType<typeof vi.fn> };
const mockEmitSystemMessage = emitSystemMessage as ReturnType<typeof vi.fn>;

describe('chatActivityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.set.mockResolvedValue('OK');
    mockEmitSystemMessage.mockResolvedValue({
      id: 'chat-1',
      createdAt: new Date('2026-04-24T10:00:00.000Z'),
    });
  });

  it('broadcasts and persists rare loot activity', async () => {
    await broadcastRareLootActivity({
      zoneId: 'zone-1',
      actorPlayerId: 'player-1',
      actorUsername: 'Mira',
      loot: [{ itemTemplateId: 'item-1', quantity: 1, rarity: 'rare', itemName: 'Willow Bark' }],
    });

    expect(mockEmitSystemMessage).toHaveBeenCalledWith(
      expect.anything(),
      'zone',
      'zone:zone-1',
      'Mira found a Rare Willow Bark.',
    );
    expect(mockPrisma.chatActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        chatMessageId: 'chat-1',
        eventType: 'rare_loot',
        scope: 'zone',
        zoneId: 'zone-1',
        actorPlayerId: 'player-1',
        actorUsername: 'Mira',
        subjectName: 'Willow Bark',
        subjectRarity: 'rare',
      }),
    });
  });

  it('skips loot below rarity threshold', async () => {
    await broadcastRareLootActivity({
      zoneId: 'zone-1',
      actorPlayerId: 'player-1',
      actorUsername: 'Mira',
      loot: [{ itemTemplateId: 'item-1', quantity: 1, rarity: 'uncommon', itemName: 'Willow Bark' }],
    });

    expect(mockEmitSystemMessage).not.toHaveBeenCalled();
    expect(mockPrisma.chatActivity.create).not.toHaveBeenCalled();
  });

  it('broadcasts craft activity with skill metadata', async () => {
    await broadcastCraftActivity({
      zoneId: 'zone-1',
      actorPlayerId: 'player-1',
      actorUsername: 'Kael',
      itemName: 'Steel Greatsword',
      rarity: 'epic',
      skillType: 'weaponsmithing',
    });

    expect(mockPrisma.chatActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'craft_crit',
        metadata: { skillType: 'weaponsmithing' },
      }),
    });
  });

  it('returns and marks one NPC activity reaction', async () => {
    const activity = {
      id: 'activity-1',
      eventType: 'craft_crit',
      scope: 'zone',
      zoneId: 'zone-1',
      actorPlayerId: 'player-1',
      actorUsername: 'Kael',
      subjectName: 'Steel Greatsword',
      subjectRarity: 'epic',
      message: 'Kael crafted an Epic Steel Greatsword.',
      metadata: { skillType: 'weaponsmithing' },
      createdAt: new Date('2026-04-24T10:00:00.000Z'),
    };
    mockPrisma.chatActivity.findMany.mockResolvedValue([activity]);
    mockPrisma.playerNpcActivityReaction.findMany.mockResolvedValue([]);

    const result = await getNpcActivityReaction('player-1', 'kessa-weaponsmithing');

    expect(result?.activityId).toBe('activity-1');
    expect(result?.line).toContain('Epic Steel Greatsword');
    expect(mockPrisma.playerNpcActivityReaction.create).toHaveBeenCalledWith({
      data: { playerId: 'player-1', npcKey: 'kessa-weaponsmithing', activityId: 'activity-1' },
    });
  });
});
