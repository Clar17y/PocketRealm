import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockPrisma } from '../__test__/setup';
import { isBlocked, blockPlayer, unblockPlayer, getBlockList } from './blockService';
import { AppError } from '../middleware/errorHandler';

const PLAYER_ID = 'player-1';
const TARGET_ID = 'player-2';

describe('blockService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isBlocked', () => {
    it('returns true when block exists', async () => {
      mockPrisma.playerBlock.findUnique.mockResolvedValue({ id: 'block-1' });

      const result = await isBlocked(PLAYER_ID, TARGET_ID);

      expect(result).toBe(true);
      expect(mockPrisma.playerBlock.findUnique).toHaveBeenCalledWith({
        where: { blockerId_blockedId: { blockerId: PLAYER_ID, blockedId: TARGET_ID } },
        select: { id: true },
      });
    });

    it('returns false when block does not exist', async () => {
      mockPrisma.playerBlock.findUnique.mockResolvedValue(null);

      const result = await isBlocked(PLAYER_ID, TARGET_ID);

      expect(result).toBe(false);
    });
  });

  describe('blockPlayer', () => {
    it('throws SELF_BLOCK when blocking yourself', async () => {
      await expect(blockPlayer(PLAYER_ID, PLAYER_ID)).rejects.toThrow(AppError);
      await expect(blockPlayer(PLAYER_ID, PLAYER_ID)).rejects.toMatchObject({
        statusCode: 400,
        code: 'SELF_BLOCK',
      });
    });

    it('throws NOT_FOUND when target does not exist', async () => {
      mockPrisma.player.findUnique.mockResolvedValue(null);

      await expect(blockPlayer(PLAYER_ID, TARGET_ID)).rejects.toThrow(AppError);
      await expect(blockPlayer(PLAYER_ID, TARGET_ID)).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    it('is idempotent when block already exists (upsert)', async () => {
      mockPrisma.player.findUnique.mockResolvedValue({ id: TARGET_ID });
      mockPrisma.playerBlock.upsert.mockResolvedValue({});
      mockPrisma.friendship.deleteMany.mockResolvedValue({ count: 0 });

      // Should not throw — upsert handles duplicates gracefully
      await blockPlayer(PLAYER_ID, TARGET_ID);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('creates block, removes friendship, and deletes pending requests in transaction', async () => {
      mockPrisma.player.findUnique.mockResolvedValue({ id: TARGET_ID });
      mockPrisma.playerBlock.upsert.mockResolvedValue({});
      mockPrisma.friendship.deleteMany.mockResolvedValue({ count: 1 });

      await blockPlayer(PLAYER_ID, TARGET_ID);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.playerBlock.upsert).toHaveBeenCalledWith({
        where: { blockerId_blockedId: { blockerId: PLAYER_ID, blockedId: TARGET_ID } },
        create: { blockerId: PLAYER_ID, blockedId: TARGET_ID },
        update: {},
      });
      // Removes accepted friendships
      expect(mockPrisma.friendship.deleteMany).toHaveBeenCalledWith({
        where: {
          status: 'accepted',
          OR: [
            { senderId: PLAYER_ID, receiverId: TARGET_ID },
            { senderId: TARGET_ID, receiverId: PLAYER_ID },
          ],
        },
      });
      // Deletes pending requests in both directions (no orphan "declined" rows)
      expect(mockPrisma.friendship.deleteMany).toHaveBeenCalledWith({
        where: {
          status: 'pending',
          OR: [
            { senderId: TARGET_ID, receiverId: PLAYER_ID },
            { senderId: PLAYER_ID, receiverId: TARGET_ID },
          ],
        },
      });
      expect(mockPrisma.friendship.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('unblockPlayer', () => {
    it('deletes block record when found', async () => {
      mockPrisma.playerBlock.findFirst.mockResolvedValue({ id: 'block-1' });
      mockPrisma.playerBlock.delete.mockResolvedValue({});

      await unblockPlayer(PLAYER_ID, 'block-1');

      expect(mockPrisma.playerBlock.findFirst).toHaveBeenCalledWith({
        where: { id: 'block-1', blockerId: PLAYER_ID },
        select: { id: true },
      });
      expect(mockPrisma.playerBlock.delete).toHaveBeenCalledWith({
        where: { id: 'block-1' },
      });
    });

    it('throws NOT_FOUND when block does not exist', async () => {
      mockPrisma.playerBlock.findFirst.mockResolvedValue(null);

      await expect(unblockPlayer(PLAYER_ID, 'block-999')).rejects.toThrow(AppError);
      await expect(unblockPlayer(PLAYER_ID, 'block-999')).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });
  });

  describe('getBlockList', () => {
    it('returns formatted blocked players', async () => {
      const now = new Date('2025-06-01T12:00:00Z');
      mockPrisma.playerBlock.findMany.mockResolvedValue([
        {
          id: 'block-1',
          blockerId: PLAYER_ID,
          blockedId: 'player-3',
          createdAt: now,
          blocked: { username: 'EvilDragon' },
        },
        {
          id: 'block-2',
          blockerId: PLAYER_ID,
          blockedId: 'player-4',
          createdAt: now,
          blocked: { username: 'Troll99' },
        },
      ]);

      const result = await getBlockList(PLAYER_ID);

      expect(result).toEqual([
        {
          blockId: 'block-1',
          playerId: 'player-3',
          username: 'EvilDragon',
          createdAt: now.toISOString(),
        },
        {
          blockId: 'block-2',
          playerId: 'player-4',
          username: 'Troll99',
          createdAt: now.toISOString(),
        },
      ]);

      expect(mockPrisma.playerBlock.findMany).toHaveBeenCalledWith({
        where: { blockerId: PLAYER_ID },
        include: { blocked: { select: { username: true } } },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('returns empty array when no blocks exist', async () => {
      mockPrisma.playerBlock.findMany.mockResolvedValue([]);

      const result = await getBlockList(PLAYER_ID);

      expect(result).toEqual([]);
    });
  });
});
