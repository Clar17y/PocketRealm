import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PREMIUM_CONSTANTS } from '@pocketrealm/shared';

vi.mock('../redis', () => ({
  redis: { set: vi.fn() },
}));

import { redis } from '../redis';
import { mockPrisma } from '../__test__/setup';
import { checkRateLimit, getAuthorizedChannelHistory, getChannelHistory, saveMessage } from './chatService';

const mockRedis = redis as unknown as { set: ReturnType<typeof vi.fn> };

describe('chatService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkRateLimit', () => {
    it('allows first message', async () => {
      mockRedis.set.mockResolvedValue('OK');

      expect(await checkRateLimit('player-1', 'world')).toBe(true);
    });

    it('blocks rapid second message on same channel', async () => {
      mockRedis.set.mockResolvedValue(null);

      expect(await checkRateLimit('player-2', 'world')).toBe(false);
    });

    it('allows messages on different channels', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await checkRateLimit('player-3', 'world');

      expect(await checkRateLimit('player-3', 'zone')).toBe(true);
    });

    it('allows messages from different players', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await checkRateLimit('player-4', 'world');

      expect(await checkRateLimit('player-5', 'world')).toBe(true);
    });
  });

  describe('saveMessage', () => {
    it('creates a chat message in DB', async () => {
      const createdAt = new Date();
      mockPrisma.chatMessage.create.mockResolvedValue({ id: 'msg-1', createdAt });

      const result = await saveMessage({
        channelType: 'world',
        channelId: 'world',
        playerId: 'p1',
        username: 'TestUser',
        message: 'Hello world!',
      });

      expect(result).toEqual({ id: 'msg-1', createdAt });
      expect(mockPrisma.chatMessage.create).toHaveBeenCalledWith({
        data: {
          channelType: 'world',
          channelId: 'world',
          playerId: 'p1',
          username: 'TestUser',
          message: 'Hello world!',
          messageType: 'player',
        },
        select: { id: true, createdAt: true },
      });
    });

    it('truncates messages longer than the chat limit', async () => {
      const createdAt = new Date();
      mockPrisma.chatMessage.create.mockResolvedValue({ id: 'msg-2', createdAt });

      await saveMessage({
        channelType: 'zone',
        channelId: 'zone:z1',
        playerId: 'p1',
        username: 'User',
        message: 'a'.repeat(300),
      });

      const callArgs = mockPrisma.chatMessage.create.mock.calls[0][0];
      expect(callArgs.data.message.length).toBe(200);
    });
  });

  describe('getChannelHistory', () => {
    it('returns messages in chronological order with player titles', async () => {
      mockPrisma.chatMessage.findMany.mockResolvedValue([
        { id: '2', channelType: 'world', channelId: 'world', playerId: 'p1', username: 'A', message: 'Second', messageType: 'player', createdAt: new Date('2025-01-02') },
        { id: '1', channelType: 'world', channelId: 'world', playerId: 'p2', username: 'B', message: 'First', messageType: 'player', createdAt: new Date('2025-01-01') },
      ]);
      mockPrisma.player.findMany.mockResolvedValue([
        { id: 'p1', activeTitle: 'combat_kills_500' },
        { id: 'p2', activeTitle: null },
      ]);

      const result = await getChannelHistory('world', 'world');

      expect(result).toHaveLength(2);
      expect(result[0].message).toBe('First');
      expect(result[1].message).toBe('Second');
      expect(result[0].title).toBeUndefined();
      expect(result[1].title).toBe('The Warrior');
      expect(result[1].titleStyle).toBeUndefined();
    });

    it('returns titleStyle for styled titles', async () => {
      mockPrisma.chatMessage.findMany.mockResolvedValue([
        { id: '1', channelType: 'world', channelId: 'world', playerId: 'p1', username: 'A', message: 'Styled', messageType: 'player', createdAt: new Date('2025-01-01') },
      ]);
      mockPrisma.player.findMany.mockResolvedValue([
        { id: 'p1', activeTitle: PREMIUM_CONSTANTS.SUPPORT_TITLE_ACHIEVEMENT_ID },
      ]);

      const result = await getChannelHistory('world', 'world');

      expect(result[0].title).toBe(PREMIUM_CONSTANTS.SUPPORT_TITLE);
      expect(result[0].titleStyle).toBe('rainbow');
    });

    it('queries with correct limit and ordering', async () => {
      mockPrisma.chatMessage.findMany.mockResolvedValue([]);
      mockPrisma.player.findMany.mockResolvedValue([]);

      await getChannelHistory('zone', 'zone:z1');

      expect(mockPrisma.chatMessage.findMany).toHaveBeenCalledWith({
        where: { channelType: 'zone', channelId: 'zone:z1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      expect(mockPrisma.player.findMany).not.toHaveBeenCalled();
    });

    it('can query history without activity messages', async () => {
      mockPrisma.chatMessage.findMany.mockResolvedValue([]);
      mockPrisma.player.findMany.mockResolvedValue([]);

      await getChannelHistory('world', 'world', { messageType: 'non_activity' });

      expect(mockPrisma.chatMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          channelType: 'world',
          channelId: 'world',
          NOT: { messageType: 'activity' },
        },
      }));
    });

    it('can query only activity history', async () => {
      mockPrisma.chatMessage.findMany.mockResolvedValue([]);
      mockPrisma.player.findMany.mockResolvedValue([]);

      await getChannelHistory('world', 'world', { messageType: 'activity' });

      expect(mockPrisma.chatMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          channelType: 'world',
          channelId: 'world',
          messageType: 'activity',
        },
      }));
    });
  });
});

describe('getAuthorizedChannelHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.chatMessage.findMany.mockResolvedValue([]);
    mockPrisma.player.findMany.mockResolvedValue([]);
  });

  it('rejects zone history for zones other than the player current zone', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ currentZoneId: 'zone-current' });

    await expect(
      getAuthorizedChannelHistory('player-1', 'zone', 'zone:zone-other'),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });

    expect(mockPrisma.chatMessage.findMany).not.toHaveBeenCalled();
  });

  it('allows zone history for the player current zone', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ currentZoneId: 'zone-current' });

    await getAuthorizedChannelHistory('player-1', 'zone', 'zone:zone-current');

    expect(mockPrisma.chatMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { channelType: 'zone', channelId: 'zone:zone-current' },
    }));
  });

  it('applies history filters after authorizing the channel', async () => {
    await getAuthorizedChannelHistory('player-1', 'world', 'world', { messageType: 'non_activity' });

    expect(mockPrisma.chatMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        channelType: 'world',
        channelId: 'world',
        NOT: { messageType: 'activity' },
      },
    }));
  });

  it('rejects guild history when the player is not in that guild', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({ guildId: 'guild-current' });

    await expect(
      getAuthorizedChannelHistory('player-1', 'guild', 'guild:guild-other'),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });

    expect(mockPrisma.chatMessage.findMany).not.toHaveBeenCalled();
  });

  it('allows guild history for the player current guild', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({ guildId: 'guild-current' });

    await getAuthorizedChannelHistory('player-1', 'guild', 'guild:guild-current');

    expect(mockPrisma.chatMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { channelType: 'guild', channelId: 'guild:guild-current' },
    }));
  });
});
