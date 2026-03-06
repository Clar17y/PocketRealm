import { prisma } from '@pocketrealm/database';
import {
  FRIEND_CONSTANTS,
  type FriendListEntry,
  type FriendRequest,
  type FriendProfile,
  type FriendEquipmentSlot,
} from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { isBlocked } from './blockService';

const EQUIPMENT_SLOTS = [
  'head', 'neck', 'chest', 'gloves', 'belt',
  'legs', 'boots', 'main_hand', 'off_hand', 'ring', 'charm',
];

async function countAcceptedFriends(playerId: string): Promise<number> {
  return prisma.friendship.count({
    where: {
      status: 'accepted',
      OR: [{ senderId: playerId }, { receiverId: playerId }],
    },
  });
}

export async function sendFriendRequest(
  senderId: string,
  targetId: string,
): Promise<{ friendshipId: string }> {
  if (senderId === targetId) {
    throw new AppError(400, 'Cannot send friend request to yourself', 'SELF_REQUEST');
  }

  const target = await prisma.player.findUnique({
    where: { id: targetId },
    select: { id: true },
  });
  if (!target) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  // Check blocks in both directions
  if (await isBlocked(senderId, targetId)) {
    throw new AppError(400, 'Cannot send friend request to a blocked player', 'BLOCKED');
  }
  if (await isBlocked(targetId, senderId)) {
    throw new AppError(400, 'Cannot send friend request to this player', 'BLOCKED');
  }

  // Check for existing friendship or pending request (either direction)
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { senderId, receiverId: targetId },
        { senderId: targetId, receiverId: senderId },
      ],
    },
    select: { id: true, status: true },
  });
  if (existing) {
    if (existing.status === 'accepted') {
      throw new AppError(400, 'Already friends', 'ALREADY_FRIENDS');
    }
    throw new AppError(400, 'Friend request already pending', 'ALREADY_PENDING');
  }

  // Check pending outgoing cap
  const pendingCount = await prisma.friendship.count({
    where: { senderId, status: 'pending' },
  });
  if (pendingCount >= FRIEND_CONSTANTS.MAX_PENDING_REQUESTS) {
    throw new AppError(400, 'Too many pending friend requests', 'MAX_PENDING');
  }

  // Check friend cap for both players
  const senderFriends = await countAcceptedFriends(senderId);
  if (senderFriends >= FRIEND_CONSTANTS.MAX_FRIENDS) {
    throw new AppError(400, 'You have reached the maximum number of friends', 'MAX_FRIENDS');
  }

  const targetFriends = await countAcceptedFriends(targetId);
  if (targetFriends >= FRIEND_CONSTANTS.MAX_FRIENDS) {
    throw new AppError(400, 'This player has reached the maximum number of friends', 'TARGET_MAX_FRIENDS');
  }

  const friendship = await prisma.friendship.create({
    data: { senderId, receiverId: targetId, status: 'pending' },
    select: { id: true },
  });

  return { friendshipId: friendship.id };
}

export async function acceptFriendRequest(
  playerId: string,
  friendshipId: string,
): Promise<void> {
  const friendship = await prisma.friendship.findFirst({
    where: { id: friendshipId, receiverId: playerId, status: 'pending' },
    select: { id: true, senderId: true },
  });
  if (!friendship) {
    throw new AppError(404, 'Friend request not found', 'NOT_FOUND');
  }

  // Recheck friend caps
  const receiverFriends = await countAcceptedFriends(playerId);
  if (receiverFriends >= FRIEND_CONSTANTS.MAX_FRIENDS) {
    throw new AppError(400, 'You have reached the maximum number of friends', 'MAX_FRIENDS');
  }

  const senderFriends = await countAcceptedFriends(friendship.senderId);
  if (senderFriends >= FRIEND_CONSTANTS.MAX_FRIENDS) {
    throw new AppError(400, 'This player has reached the maximum number of friends', 'TARGET_MAX_FRIENDS');
  }

  await prisma.friendship.update({
    where: { id: friendshipId },
    data: { status: 'accepted', acceptedAt: new Date() },
  });
}

export async function declineFriendRequest(
  playerId: string,
  friendshipId: string,
): Promise<void> {
  const friendship = await prisma.friendship.findFirst({
    where: { id: friendshipId, receiverId: playerId, status: 'pending' },
    select: { id: true },
  });
  if (!friendship) {
    throw new AppError(404, 'Friend request not found', 'NOT_FOUND');
  }

  await prisma.friendship.delete({ where: { id: friendshipId } });
}

export async function unfriend(
  playerId: string,
  friendshipId: string,
): Promise<void> {
  const friendship = await prisma.friendship.findFirst({
    where: {
      id: friendshipId,
      status: 'accepted',
      OR: [{ senderId: playerId }, { receiverId: playerId }],
    },
    select: { id: true },
  });
  if (!friendship) {
    throw new AppError(404, 'Friendship not found', 'NOT_FOUND');
  }

  await prisma.friendship.delete({ where: { id: friendshipId } });
}

export async function getFriends(
  playerId: string,
  onlinePlayers: Set<string>,
): Promise<FriendListEntry[]> {
  const friendships = await prisma.friendship.findMany({
    where: {
      status: 'accepted',
      OR: [{ senderId: playerId }, { receiverId: playerId }],
    },
    include: {
      sender: { select: { id: true, username: true, characterLevel: true } },
      receiver: { select: { id: true, username: true, characterLevel: true } },
    },
    orderBy: { acceptedAt: 'desc' },
  });

  return friendships.map((f) => {
    const friend = f.senderId === playerId ? f.receiver : f.sender;
    return {
      friendshipId: f.id,
      playerId: friend.id,
      username: friend.username,
      characterLevel: friend.characterLevel,
      isOnline: onlinePlayers.has(friend.id),
    };
  });
}

export async function getIncomingRequests(
  playerId: string,
): Promise<FriendRequest[]> {
  const requests = await prisma.friendship.findMany({
    where: { receiverId: playerId, status: 'pending' },
    include: {
      sender: { select: { id: true, username: true, characterLevel: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return requests.map((r) => ({
    friendshipId: r.id,
    playerId: r.sender.id,
    username: r.sender.username,
    characterLevel: r.sender.characterLevel,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getOutgoingRequests(
  playerId: string,
): Promise<FriendRequest[]> {
  const requests = await prisma.friendship.findMany({
    where: { senderId: playerId, status: 'pending' },
    include: {
      receiver: { select: { id: true, username: true, characterLevel: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return requests.map((r) => ({
    friendshipId: r.id,
    playerId: r.receiver.id,
    username: r.receiver.username,
    characterLevel: r.receiver.characterLevel,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getFriendProfile(
  playerId: string,
  friendshipId: string,
  onlinePlayers: Set<string>,
): Promise<FriendProfile> {
  const friendship = await prisma.friendship.findFirst({
    where: {
      id: friendshipId,
      status: 'accepted',
      OR: [{ senderId: playerId }, { receiverId: playerId }],
    },
    include: {
      sender: { select: { id: true, username: true, characterLevel: true } },
      receiver: { select: { id: true, username: true, characterLevel: true } },
    },
  });
  if (!friendship) {
    throw new AppError(404, 'Friendship not found', 'NOT_FOUND');
  }

  const friend = friendship.senderId === playerId ? friendship.receiver : friendship.sender;

  const equipmentRows = await prisma.playerEquipment.findMany({
    where: { playerId: friend.id },
    include: {
      item: { include: { template: { select: { name: true } } } },
    },
  });

  const equipmentMap = new Map(equipmentRows.map((e) => [e.slot, e]));

  const equipment: FriendEquipmentSlot[] = EQUIPMENT_SLOTS.map((slot) => {
    const row = equipmentMap.get(slot);
    return {
      slot,
      itemName: row?.item?.template?.name ?? null,
      rarity: row?.item?.rarity ?? null,
    };
  });

  return {
    playerId: friend.id,
    username: friend.username,
    characterLevel: friend.characterLevel,
    isOnline: onlinePlayers.has(friend.id),
    equipment,
  };
}

export async function findPlayerByUsername(
  username: string,
): Promise<{ id: string; username: string; characterLevel: number } | null> {
  return prisma.player.findUnique({
    where: { username },
    select: { id: true, username: true, characterLevel: true },
  });
}
