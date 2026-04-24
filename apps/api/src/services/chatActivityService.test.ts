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

import { CHAT_CONSTANTS } from '@pocketrealm/shared';
import { redis } from '../redis';
import { mockPrisma } from '../__test__/setup';
import { emitSystemMessage } from './systemMessageService';
import {
  broadcastBossDefeatActivity,
  broadcastCraftActivity,
  broadcastRareLootActivity,
  getNpcActivityReaction,
} from './chatActivityService';

const mockRedis = redis as unknown as { set: ReturnType<typeof vi.fn> };
const mockEmitSystemMessage = emitSystemMessage as ReturnType<typeof vi.fn>;

describe('chatActivityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.set.mockReset();
    mockEmitSystemMessage.mockReset();
    mockPrisma.chatActivity.findMany.mockReset();
    mockPrisma.chatActivity.create.mockReset();
    mockPrisma.playerNpcActivityReaction.findMany.mockReset();
    mockPrisma.playerNpcActivityReaction.create.mockReset();
    mockRedis.set.mockResolvedValue('OK');
    mockEmitSystemMessage.mockResolvedValue({
      id: 'chat-1',
      createdAt: new Date('2026-04-24T10:00:00.000Z'),
    });
    mockPrisma.chatActivity.findMany.mockResolvedValue([]);
    mockPrisma.chatActivity.create.mockResolvedValue({});
    mockPrisma.playerNpcActivityReaction.findMany.mockResolvedValue([]);
    mockPrisma.playerNpcActivityReaction.create.mockResolvedValue({});
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
      'activity',
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

  it('suppresses broadcast and persistence during player cooldown', async () => {
    mockRedis.set.mockResolvedValue(null);

    await broadcastCraftActivity({
      zoneId: 'zone-1',
      actorPlayerId: 'player-1',
      actorUsername: 'Kael',
      itemName: 'Steel Greatsword',
      rarity: 'epic',
      skillType: 'weaponsmithing',
    });

    expect(mockRedis.set).toHaveBeenCalledWith(
      'chat_activity:player-1:craft_crit',
      '1',
      'PX',
      expect.any(Number),
      'NX',
    );
    expect(mockEmitSystemMessage).not.toHaveBeenCalled();
    expect(mockPrisma.chatActivity.create).not.toHaveBeenCalled();
  });

  it('broadcasts boss defeats globally and to the zone without a player cooldown', async () => {
    await broadcastBossDefeatActivity({
      zoneId: 'zone-1',
      zoneName: 'Iron Hollow',
      bossName: 'The Molten Hart',
      killerName: 'Hero',
    });

    expect(mockRedis.set).not.toHaveBeenCalled();
    expect(mockEmitSystemMessage).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      'world',
      'world',
      'The Molten Hart in Iron Hollow has been defeated. Hero dealt the final blow.',
      'activity',
    );
    expect(mockEmitSystemMessage).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      'zone',
      'zone:zone-1',
      'The Molten Hart has been defeated. Hero dealt the final blow.',
      'activity',
    );
    expect(mockPrisma.chatActivity.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.chatActivity.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        eventType: 'boss_defeat',
        scope: 'global',
        zoneId: 'zone-1',
        actorPlayerId: null,
        actorUsername: 'Hero',
        subjectName: 'The Molten Hart',
        metadata: { zoneName: 'Iron Hollow' },
      }),
    });
    expect(mockPrisma.chatActivity.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        eventType: 'boss_defeat',
        scope: 'zone',
        zoneId: 'zone-1',
        actorPlayerId: null,
        actorUsername: 'Hero',
      }),
    });
  });

  it('broadcasts boss defeats without killer info when no killer is known', async () => {
    await broadcastBossDefeatActivity({
      zoneId: 'zone-1',
      zoneName: 'Iron Hollow',
      bossName: 'The Molten Hart',
      killerName: null,
    });

    expect(mockEmitSystemMessage).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      'world',
      'world',
      'The Molten Hart in Iron Hollow has been defeated.',
      'activity',
    );
    expect(mockEmitSystemMessage).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      'zone',
      'zone:zone-1',
      'The Molten Hart has been defeated.',
      'activity',
    );
  });

  it('broadcasts boss defeats globally only when no zone is known', async () => {
    await broadcastBossDefeatActivity({
      zoneId: null,
      zoneName: 'Iron Hollow',
      bossName: 'The Molten Hart',
      killerName: null,
    });

    expect(mockEmitSystemMessage).toHaveBeenCalledOnce();
    expect(mockEmitSystemMessage).toHaveBeenCalledWith(
      expect.anything(),
      'world',
      'world',
      'The Molten Hart in Iron Hollow has been defeated.',
      'activity',
    );
    expect(mockPrisma.chatActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'boss_defeat',
        scope: 'global',
        zoneId: null,
      }),
    });
  });

  it('truncates activity messages before emitting and persisting them', async () => {
    await broadcastBossDefeatActivity({
      zoneId: null,
      zoneName: 'Z'.repeat(64),
      bossName: 'B'.repeat(64),
      killerName: 'K'.repeat(32),
    });

    const emittedMessage = mockEmitSystemMessage.mock.calls[0]?.[3];
    expect(emittedMessage).toHaveLength(CHAT_CONSTANTS.MAX_MESSAGE_LENGTH);
    expect(mockEmitSystemMessage).toHaveBeenCalledWith(
      expect.anything(),
      'world',
      'world',
      emittedMessage,
      'activity',
    );
    expect(mockPrisma.chatActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        message: emittedMessage,
      }),
    });
  });

  it('rejects zone-scoped activity without a zone id before broadcasting', async () => {
    await expect(broadcastCraftActivity({
      zoneId: null,
      actorPlayerId: 'player-1',
      actorUsername: 'Kael',
      itemName: 'Steel Greatsword',
      rarity: 'epic',
      skillType: 'weaponsmithing',
    })).rejects.toThrow('zoneId is required');

    expect(mockEmitSystemMessage).not.toHaveBeenCalled();
    expect(mockPrisma.chatActivity.create).not.toHaveBeenCalled();
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

  it('skips already reacted and irrelevant NPC activity rows', async () => {
    const seenActivity = {
      id: 'activity-seen',
      eventType: 'craft_crit',
      scope: 'zone',
      zoneId: 'zone-1',
      actorPlayerId: 'player-1',
      actorUsername: 'Kael',
      subjectName: 'Seen Sword',
      subjectRarity: 'epic',
      message: 'Kael crafted an Epic Seen Sword.',
      metadata: { skillType: 'weaponsmithing' },
      createdAt: new Date('2026-04-24T10:00:00.000Z'),
    };
    const irrelevantActivity = {
      ...seenActivity,
      id: 'activity-irrelevant',
      subjectName: 'Healing Tonic',
      metadata: { skillType: 'alchemy' },
    };
    const matchingActivity = {
      ...seenActivity,
      id: 'activity-matching',
      subjectName: 'Fresh Sword',
      message: 'Kael crafted an Epic Fresh Sword.',
    };
    mockPrisma.chatActivity.findMany.mockResolvedValue([seenActivity, irrelevantActivity, matchingActivity]);
    mockPrisma.playerNpcActivityReaction.findMany.mockResolvedValue([{ activityId: 'activity-seen' }]);

    const result = await getNpcActivityReaction('player-1', 'kessa-weaponsmithing');

    expect(result?.activityId).toBe('activity-matching');
    expect(result?.line).toContain('Epic Fresh Sword');
    expect(mockPrisma.playerNpcActivityReaction.create).toHaveBeenCalledWith({
      data: { playerId: 'player-1', npcKey: 'kessa-weaponsmithing', activityId: 'activity-matching' },
    });
  });

  it('continues paging recent activity until an NPC reaction is found', async () => {
    const stalePage = Array.from({ length: 25 }, (_, index) => ({
      id: `activity-irrelevant-${index}`,
      eventType: 'craft_crit',
      scope: 'zone',
      zoneId: 'zone-1',
      actorPlayerId: 'other-player',
      actorUsername: 'Other',
      subjectName: 'Other Sword',
      subjectRarity: 'epic',
      message: 'Other crafted an Epic Other Sword.',
      metadata: { skillType: 'weaponsmithing' },
      createdAt: new Date('2026-04-24T10:00:00.000Z'),
    }));
    const matchingActivity = {
      id: 'activity-matching-page',
      eventType: 'craft_crit',
      scope: 'zone',
      zoneId: 'zone-1',
      actorPlayerId: 'player-1',
      actorUsername: 'Kael',
      subjectName: 'Fresh Sword',
      subjectRarity: 'epic',
      message: 'Kael crafted an Epic Fresh Sword.',
      metadata: { skillType: 'weaponsmithing' },
      createdAt: new Date('2026-04-24T09:59:00.000Z'),
    };
    mockPrisma.chatActivity.findMany
      .mockResolvedValueOnce(stalePage)
      .mockResolvedValueOnce([matchingActivity]);

    const result = await getNpcActivityReaction('player-1', 'kessa-weaponsmithing');

    expect(result?.activityId).toBe('activity-matching-page');
    expect(mockPrisma.chatActivity.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 25,
    }));
    expect(mockPrisma.chatActivity.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      cursor: { id: 'activity-irrelevant-24' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 25,
      skip: 1,
    }));
  });

  it('skips invalid activity rows while finding an NPC reaction', async () => {
    const validActivity = {
      id: 'activity-valid',
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
    mockPrisma.chatActivity.findMany.mockResolvedValue([
      { ...validActivity, id: 'activity-invalid-event', eventType: 'not_real' },
      { ...validActivity, id: 'activity-invalid-scope', scope: 'guild' },
      { ...validActivity, id: 'activity-zone-without-zone', zoneId: null },
      validActivity,
    ]);

    const result = await getNpcActivityReaction('player-1', 'kessa-weaponsmithing');

    expect(result?.activityId).toBe('activity-valid');
    expect(mockPrisma.playerNpcActivityReaction.create).toHaveBeenCalledWith({
      data: { playerId: 'player-1', npcKey: 'kessa-weaponsmithing', activityId: 'activity-valid' },
    });
  });

  it('continues after NPC activity reaction unique conflicts', async () => {
    const conflictingActivity = {
      id: 'activity-conflict',
      eventType: 'craft_crit',
      scope: 'zone',
      zoneId: 'zone-1',
      actorPlayerId: 'player-1',
      actorUsername: 'Kael',
      subjectName: 'First Sword',
      subjectRarity: 'epic',
      message: 'Kael crafted an Epic First Sword.',
      metadata: { skillType: 'weaponsmithing' },
      createdAt: new Date('2026-04-24T10:00:00.000Z'),
    };
    const nextActivity = {
      ...conflictingActivity,
      id: 'activity-next',
      subjectName: 'Second Sword',
      message: 'Kael crafted an Epic Second Sword.',
    };
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    mockPrisma.chatActivity.findMany.mockResolvedValue([conflictingActivity, nextActivity]);
    mockPrisma.playerNpcActivityReaction.create
      .mockRejectedValueOnce(p2002)
      .mockResolvedValueOnce({});

    const result = await getNpcActivityReaction('player-1', 'kessa-weaponsmithing');

    expect(result?.activityId).toBe('activity-next');
    expect(result?.line).toContain('Epic Second Sword');
    expect(mockPrisma.playerNpcActivityReaction.create).toHaveBeenCalledTimes(2);
  });

  it('returns null when all eligible NPC activity reactions lose the unique-conflict race', async () => {
    const activity = {
      id: 'activity-conflict',
      eventType: 'craft_crit',
      scope: 'zone',
      zoneId: 'zone-1',
      actorPlayerId: 'player-1',
      actorUsername: 'Kael',
      subjectName: 'First Sword',
      subjectRarity: 'epic',
      message: 'Kael crafted an Epic First Sword.',
      metadata: { skillType: 'weaponsmithing' },
      createdAt: new Date('2026-04-24T10:00:00.000Z'),
    };
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    mockPrisma.chatActivity.findMany.mockResolvedValue([activity]);
    mockPrisma.playerNpcActivityReaction.create.mockRejectedValueOnce(p2002);

    const result = await getNpcActivityReaction('player-1', 'kessa-weaponsmithing');

    expect(result).toBeNull();
  });
});
