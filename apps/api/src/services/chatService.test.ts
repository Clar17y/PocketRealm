import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../redis', () => ({
  redis: { set: vi.fn() },
}));

import { redis } from '../redis';
import { mockPrisma } from '../__test__/setup';
import { checkRateLimit, saveMessage, getChannelHistory } from './chatService';

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
    it('creates a chat message in DB and truncates to max length', async () => {
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

    it('truncates messages longer than MAX_MESSAGE_LENGTH', async () => {
      const createdAt = new Date();
      mockPrisma.chatMessage.create.mockResolvedValue({ id: 'msg-2', createdAt });

      const longMessage = 'a'.repeat(300);
      await saveMessage({
        channelType: 'zone',
        channelId: 'zone:z1',
        playerId: 'p1',
        username: 'User',
        message: longMessage,
      });

      const callArgs = mockPrisma.chatMessage.create.mock.calls[0][0];
      expect(callArgs.data.message.length).toBe(200);
    });
  });

  describe('getChannelHistory', () => {
    it('returns messages in chronological order with player titles', async () => {
      const rows = [
        { id: '2', channelType: 'world', channelId: 'world', playerId: 'p1', username: 'A', message: 'Second', messageType: 'player', createdAt: new Date('2025-01-02') },
        { id: '1', channelType: 'world', channelId: 'world', playerId: 'p2', username: 'B', message: 'First', messageType: 'player', createdAt: new Date('2025-01-01') },
      ];
      mockPrisma.chatMessage.findMany.mockResolvedValue(rows);
      mockPrisma.player.findMany.mockResolvedValue([
        { id: 'p1', activeTitle: 'combat_kills_500' },
        { id: 'p2', activeTitle: null },
      ]);

      const result = await getChannelHistory('world', 'world');

      expect(result).toHaveLength(2);
      // Reversed from desc to chronological
      expect(result[0].message).toBe('First');
      expect(result[1].message).toBe('Second');
      expect(result[0].title).toBeUndefined();
      expect(result[1].title).toBe('The Warrior');
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
    });
  });
});
