import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockPrisma } from '../__test__/setup';
import { AppError } from '../middleware/errorHandler';
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  unfriend,
  getFriends,
  getIncomingRequests,
  getOutgoingRequests,
  getFriendProfile,
  findPlayerByUsername,
} from './friendService';

vi.mock('./blockService', () => ({
  isBlocked: vi.fn().mockResolvedValue(false),
}));

import { isBlocked } from './blockService';

const PLAYER_ID = 'player-1';
const TARGET_ID = 'player-2';
const FRIENDSHIP_ID = 'friendship-1';

describe('friendService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isBlocked).mockResolvedValue(false);
  });

  // ---------------------------------------------------------------------------
  // sendFriendRequest
  // ---------------------------------------------------------------------------
  describe('sendFriendRequest', () => {
    it('creates a pending friendship', async () => {
      mockPrisma.player.findUnique.mockResolvedValue({ id: TARGET_ID });
      mockPrisma.friendship.findFirst.mockResolvedValue(null);
      mockPrisma.friendship.count.mockResolvedValue(0);
      mockPrisma.friendship.create.mockResolvedValue({ id: FRIENDSHIP_ID });

      const result = await sendFriendRequest(PLAYER_ID, TARGET_ID);

      expect(result).toEqual({ friendshipId: FRIENDSHIP_ID });
      expect(mockPrisma.friendship.create).toHaveBeenCalledWith({
        data: { senderId: PLAYER_ID, receiverId: TARGET_ID, status: 'pending' },
        select: { id: true },
      });
    });

    it('throws SELF_REQUEST when sending to self', async () => {
      await expect(sendFriendRequest(PLAYER_ID, PLAYER_ID)).rejects.toThrow(AppError);
      await expect(sendFriendRequest(PLAYER_ID, PLAYER_ID)).rejects.toMatchObject({
        statusCode: 400,
        code: 'SELF_REQUEST',
      });
    });

    it('throws NOT_FOUND when target does not exist', async () => {
      mockPrisma.player.findUnique.mockResolvedValue(null);

      await expect(sendFriendRequest(PLAYER_ID, TARGET_ID)).rejects.toThrow(AppError);
      await expect(sendFriendRequest(PLAYER_ID, TARGET_ID)).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    it('throws BLOCKED when sender has blocked target', async () => {
      mockPrisma.player.findUnique.mockResolvedValue({ id: TARGET_ID });
      vi.mocked(isBlocked).mockResolvedValue(true);

      await expect(sendFriendRequest(PLAYER_ID, TARGET_ID)).rejects.toThrow(AppError);
      await expect(sendFriendRequest(PLAYER_ID, TARGET_ID)).rejects.toMatchObject({
        statusCode: 400,
        code: 'BLOCKED',
      });
    });

    it('throws BLOCKED when target has blocked sender', async () => {
      mockPrisma.player.findUnique.mockResolvedValue({ id: TARGET_ID });
      // isBlocked(sender, target) = false, isBlocked(target, sender) = true
      // Need 4 values because we call sendFriendRequest twice (two assertions)
      vi.mocked(isBlocked)
        .mockResolvedValueOnce(false).mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      await expect(sendFriendRequest(PLAYER_ID, TARGET_ID)).rejects.toThrow(AppError);
      await expect(sendFriendRequest(PLAYER_ID, TARGET_ID)).rejects.toMatchObject({
        statusCode: 400,
        code: 'BLOCKED',
      });
    });

    it('throws ALREADY_FRIENDS when friendship exists', async () => {
      mockPrisma.player.findUnique.mockResolvedValue({ id: TARGET_ID });
      mockPrisma.friendship.findFirst.mockResolvedValue({
        id: FRIENDSHIP_ID,
        status: 'accepted',
      });

      await expect(sendFriendRequest(PLAYER_ID, TARGET_ID)).rejects.toThrow(AppError);
      await expect(sendFriendRequest(PLAYER_ID, TARGET_ID)).rejects.toMatchObject({
        statusCode: 400,
        code: 'ALREADY_FRIENDS',
      });
    });

    it('throws ALREADY_PENDING when request is pending', async () => {
      mockPrisma.player.findUnique.mockResolvedValue({ id: TARGET_ID });
      mockPrisma.friendship.findFirst.mockResolvedValue({
        id: FRIENDSHIP_ID,
        status: 'pending',
      });

      await expect(sendFriendRequest(PLAYER_ID, TARGET_ID)).rejects.toThrow(AppError);
      await expect(sendFriendRequest(PLAYER_ID, TARGET_ID)).rejects.toMatchObject({
        statusCode: 400,
        code: 'ALREADY_PENDING',
      });
    });

    it('throws MAX_PENDING when too many outgoing requests', async () => {
      mockPrisma.player.findUnique.mockResolvedValue({ id: TARGET_ID });
      mockPrisma.friendship.findFirst.mockResolvedValue(null);
      // count always returns 20 — throws on pending check before reaching friend caps
      mockPrisma.friendship.count.mockResolvedValue(20);

      await expect(sendFriendRequest(PLAYER_ID, TARGET_ID)).rejects.toThrow(AppError);
      await expect(sendFriendRequest(PLAYER_ID, TARGET_ID)).rejects.toMatchObject({
        statusCode: 400,
        code: 'MAX_PENDING',
      });
    });

    it('throws MAX_FRIENDS when sender at cap', async () => {
      mockPrisma.player.findUnique.mockResolvedValue({ id: TARGET_ID });
      mockPrisma.friendship.findFirst.mockResolvedValue(null);
      // Two invocations: each calls count(pending=0, senderFriends=50)
      mockPrisma.friendship.count
        .mockResolvedValueOnce(0).mockResolvedValueOnce(50)
        .mockResolvedValueOnce(0).mockResolvedValueOnce(50);

      await expect(sendFriendRequest(PLAYER_ID, TARGET_ID)).rejects.toThrow(AppError);
      await expect(sendFriendRequest(PLAYER_ID, TARGET_ID)).rejects.toMatchObject({
        statusCode: 400,
        code: 'MAX_FRIENDS',
      });
    });

    it('throws TARGET_MAX_FRIENDS when target at cap', async () => {
      mockPrisma.player.findUnique.mockResolvedValue({ id: TARGET_ID });
      mockPrisma.friendship.findFirst.mockResolvedValue(null);
      // Two invocations: each calls count(pending=0, senderFriends=0, targetFriends=50)
      mockPrisma.friendship.count
        .mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(50)
        .mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(50);

      await expect(sendFriendRequest(PLAYER_ID, TARGET_ID)).rejects.toThrow(AppError);
      await expect(sendFriendRequest(PLAYER_ID, TARGET_ID)).rejects.toMatchObject({
        statusCode: 400,
        code: 'TARGET_MAX_FRIENDS',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // acceptFriendRequest
  // ---------------------------------------------------------------------------
  describe('acceptFriendRequest', () => {
    it('updates friendship to accepted', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({
        id: FRIENDSHIP_ID,
        senderId: TARGET_ID,
      });
      mockPrisma.friendship.count.mockResolvedValue(0);
      mockPrisma.friendship.update.mockResolvedValue({});

      await acceptFriendRequest(PLAYER_ID, FRIENDSHIP_ID);

      expect(mockPrisma.friendship.update).toHaveBeenCalledWith({
        where: { id: FRIENDSHIP_ID },
        data: { status: 'accepted', acceptedAt: expect.any(Date) },
      });
    });

    it('throws NOT_FOUND when request does not exist', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue(null);

      await expect(acceptFriendRequest(PLAYER_ID, 'bad-id')).rejects.toThrow(AppError);
      await expect(acceptFriendRequest(PLAYER_ID, 'bad-id')).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    it('throws MAX_FRIENDS when receiver at cap', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({
        id: FRIENDSHIP_ID,
        senderId: TARGET_ID,
      });
      // Always return 50 — throws on first count check (receiver friends)
      mockPrisma.friendship.count.mockResolvedValue(50);

      await expect(acceptFriendRequest(PLAYER_ID, FRIENDSHIP_ID)).rejects.toThrow(AppError);
      await expect(acceptFriendRequest(PLAYER_ID, FRIENDSHIP_ID)).rejects.toMatchObject({
        statusCode: 400,
        code: 'MAX_FRIENDS',
      });
    });

    it('throws TARGET_MAX_FRIENDS when sender at cap', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({
        id: FRIENDSHIP_ID,
        senderId: TARGET_ID,
      });
      // Two invocations: each calls count(receiverFriends=0, senderFriends=50)
      mockPrisma.friendship.count
        .mockResolvedValueOnce(0).mockResolvedValueOnce(50)
        .mockResolvedValueOnce(0).mockResolvedValueOnce(50);

      await expect(acceptFriendRequest(PLAYER_ID, FRIENDSHIP_ID)).rejects.toThrow(AppError);
      await expect(acceptFriendRequest(PLAYER_ID, FRIENDSHIP_ID)).rejects.toMatchObject({
        statusCode: 400,
        code: 'TARGET_MAX_FRIENDS',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // declineFriendRequest
  // ---------------------------------------------------------------------------
  describe('declineFriendRequest', () => {
    it('deletes pending request', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({ id: FRIENDSHIP_ID });
      mockPrisma.friendship.delete.mockResolvedValue({});

      await declineFriendRequest(PLAYER_ID, FRIENDSHIP_ID);

      expect(mockPrisma.friendship.delete).toHaveBeenCalledWith({
        where: { id: FRIENDSHIP_ID },
      });
    });

    it('throws NOT_FOUND when request does not exist', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue(null);

      await expect(declineFriendRequest(PLAYER_ID, 'bad-id')).rejects.toThrow(AppError);
      await expect(declineFriendRequest(PLAYER_ID, 'bad-id')).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // unfriend
  // ---------------------------------------------------------------------------
  describe('unfriend', () => {
    it('deletes accepted friendship', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({ id: FRIENDSHIP_ID });
      mockPrisma.friendship.delete.mockResolvedValue({});

      await unfriend(PLAYER_ID, FRIENDSHIP_ID);

      expect(mockPrisma.friendship.delete).toHaveBeenCalledWith({
        where: { id: FRIENDSHIP_ID },
      });
    });

    it('throws NOT_FOUND when friendship does not exist', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue(null);

      await expect(unfriend(PLAYER_ID, 'bad-id')).rejects.toThrow(AppError);
      await expect(unfriend(PLAYER_ID, 'bad-id')).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // getFriends
  // ---------------------------------------------------------------------------
  describe('getFriends', () => {
    it('returns friends with correct online status', async () => {
      const now = new Date();
      mockPrisma.friendship.findMany.mockResolvedValue([
        {
          id: 'f1',
          senderId: PLAYER_ID,
          receiverId: 'player-3',
          status: 'accepted',
          acceptedAt: now,
          sender: { id: PLAYER_ID, username: 'Me', characterLevel: 5 },
          receiver: { id: 'player-3', username: 'Alice', characterLevel: 10 },
        },
        {
          id: 'f2',
          senderId: 'player-4',
          receiverId: PLAYER_ID,
          status: 'accepted',
          acceptedAt: now,
          sender: { id: 'player-4', username: 'Bob', characterLevel: 7 },
          receiver: { id: PLAYER_ID, username: 'Me', characterLevel: 5 },
        },
      ]);

      const onlinePlayers = new Set(['player-3']);
      const result = await getFriends(PLAYER_ID, onlinePlayers);

      expect(result).toEqual([
        {
          friendshipId: 'f1',
          playerId: 'player-3',
          username: 'Alice',
          characterLevel: 10,
          isOnline: true,
        },
        {
          friendshipId: 'f2',
          playerId: 'player-4',
          username: 'Bob',
          characterLevel: 7,
          isOnline: false,
        },
      ]);
    });

    it('returns empty array when no friends', async () => {
      mockPrisma.friendship.findMany.mockResolvedValue([]);

      const result = await getFriends(PLAYER_ID, new Set());

      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // getIncomingRequests
  // ---------------------------------------------------------------------------
  describe('getIncomingRequests', () => {
    it('returns pending incoming requests with sender info', async () => {
      const now = new Date('2025-06-01T12:00:00Z');
      mockPrisma.friendship.findMany.mockResolvedValue([
        {
          id: 'f1',
          senderId: TARGET_ID,
          receiverId: PLAYER_ID,
          status: 'pending',
          createdAt: now,
          sender: { id: TARGET_ID, username: 'Alice', characterLevel: 10 },
        },
      ]);

      const result = await getIncomingRequests(PLAYER_ID);

      expect(result).toEqual([
        {
          friendshipId: 'f1',
          playerId: TARGET_ID,
          username: 'Alice',
          characterLevel: 10,
          createdAt: now.toISOString(),
        },
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // getOutgoingRequests
  // ---------------------------------------------------------------------------
  describe('getOutgoingRequests', () => {
    it('returns pending outgoing requests with receiver info', async () => {
      const now = new Date('2025-06-01T12:00:00Z');
      mockPrisma.friendship.findMany.mockResolvedValue([
        {
          id: 'f1',
          senderId: PLAYER_ID,
          receiverId: TARGET_ID,
          status: 'pending',
          createdAt: now,
          receiver: { id: TARGET_ID, username: 'Bob', characterLevel: 3 },
        },
      ]);

      const result = await getOutgoingRequests(PLAYER_ID);

      expect(result).toEqual([
        {
          friendshipId: 'f1',
          playerId: TARGET_ID,
          username: 'Bob',
          characterLevel: 3,
          createdAt: now.toISOString(),
        },
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // getFriendProfile
  // ---------------------------------------------------------------------------
  describe('getFriendProfile', () => {
    it('returns friend profile with equipment slots', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({
        id: FRIENDSHIP_ID,
        senderId: PLAYER_ID,
        receiverId: TARGET_ID,
        status: 'accepted',
        sender: { id: PLAYER_ID, username: 'Me', characterLevel: 5 },
        receiver: { id: TARGET_ID, username: 'Alice', characterLevel: 10 },
      });

      mockPrisma.playerEquipment.findMany.mockResolvedValue([
        {
          playerId: TARGET_ID,
          slot: 'head',
          itemId: 'item-1',
          item: { rarity: 'rare', template: { name: 'Iron Helm' } },
        },
        {
          playerId: TARGET_ID,
          slot: 'chest',
          itemId: 'item-2',
          item: { rarity: 'epic', template: { name: 'Dragon Plate' } },
        },
      ]);

      const onlinePlayers = new Set([TARGET_ID]);
      const result = await getFriendProfile(PLAYER_ID, FRIENDSHIP_ID, onlinePlayers);

      expect(result.playerId).toBe(TARGET_ID);
      expect(result.username).toBe('Alice');
      expect(result.characterLevel).toBe(10);
      expect(result.isOnline).toBe(true);
      expect(result.equipment).toHaveLength(11);
      expect(result.equipment.find((e) => e.slot === 'head')).toEqual({
        slot: 'head',
        itemName: 'Iron Helm',
        rarity: 'rare',
      });
      expect(result.equipment.find((e) => e.slot === 'chest')).toEqual({
        slot: 'chest',
        itemName: 'Dragon Plate',
        rarity: 'epic',
      });
      // Empty slots should have null values
      expect(result.equipment.find((e) => e.slot === 'boots')).toEqual({
        slot: 'boots',
        itemName: null,
        rarity: null,
      });
    });

    it('throws NOT_FOUND when friendship does not exist', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue(null);

      await expect(
        getFriendProfile(PLAYER_ID, 'bad-id', new Set()),
      ).rejects.toThrow(AppError);
      await expect(
        getFriendProfile(PLAYER_ID, 'bad-id', new Set()),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // findPlayerByUsername
  // ---------------------------------------------------------------------------
  describe('findPlayerByUsername', () => {
    it('returns player info when found', async () => {
      mockPrisma.player.findUnique.mockResolvedValue({
        id: TARGET_ID,
        username: 'Alice',
        characterLevel: 10,
      });

      const result = await findPlayerByUsername('Alice');

      expect(result).toEqual({
        id: TARGET_ID,
        username: 'Alice',
        characterLevel: 10,
      });
      expect(mockPrisma.player.findUnique).toHaveBeenCalledWith({
        where: { username: 'Alice' },
        select: { id: true, username: true, characterLevel: true },
      });
    });

    it('returns null when player not found', async () => {
      mockPrisma.player.findUnique.mockResolvedValue(null);

      const result = await findPlayerByUsername('nobody');

      expect(result).toBeNull();
    });
  });
});
