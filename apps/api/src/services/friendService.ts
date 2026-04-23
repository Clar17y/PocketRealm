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

async function getPlayerSummary(playerId: string): Promise<{
  id: string;
  accountId: string;
  username: string;
  characterLevel: number;
} | null> {
  return prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      accountId: true,
      username: true,
      characterLevel: true,
    },
  });
}

async function countAcceptedFriends(accountId: string): Promise<number> {
  return prisma.friendship.count({
    where: {
      status: 'accepted',
      OR: [{ senderId: accountId }, { receiverId: accountId }],
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

  const [sender, target] = await Promise.all([
    getPlayerSummary(senderId),
    getPlayerSummary(targetId),
  ]);
  if (!sender || !target) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }
  if (sender.accountId === target.accountId) {
    throw new AppError(400, 'Cannot send friend request to yourself', 'SELF_REQUEST');
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
        { senderId: sender.accountId, receiverId: target.accountId },
        { senderId: target.accountId, receiverId: sender.accountId },
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
    where: { senderId: sender.accountId, status: 'pending' },
  });
  if (pendingCount >= FRIEND_CONSTANTS.MAX_PENDING_REQUESTS) {
    throw new AppError(400, 'Too many pending friend requests', 'MAX_PENDING');
  }

  // Check friend cap for both players
  const senderFriends = await countAcceptedFriends(sender.accountId);
  if (senderFriends >= FRIEND_CONSTANTS.MAX_FRIENDS) {
    throw new AppError(400, 'You have reached the maximum number of friends', 'MAX_FRIENDS');
  }

  const targetFriends = await countAcceptedFriends(target.accountId);
  if (targetFriends >= FRIEND_CONSTANTS.MAX_FRIENDS) {
    throw new AppError(400, 'This player has reached the maximum number of friends', 'TARGET_MAX_FRIENDS');
  }

  const friendship = await prisma.friendship.create({
    data: { senderId: sender.accountId, receiverId: target.accountId, status: 'pending' },
    select: { id: true },
  });

  return { friendshipId: friendship.id };
}

export async function acceptFriendRequest(
  playerId: string,
  friendshipId: string,
): Promise<void> {
  const player = await getPlayerSummary(playerId);
  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const friendship = await prisma.friendship.findFirst({
    where: { id: friendshipId, receiverId: player.accountId, status: 'pending' },
    select: { id: true, senderId: true },
  });
  if (!friendship) {
    throw new AppError(404, 'Friend request not found', 'NOT_FOUND');
  }

  // Recheck friend caps
  const receiverFriends = await countAcceptedFriends(player.accountId);
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
  const player = await getPlayerSummary(playerId);
  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  // Allow either sender (cancel) or receiver (decline) to remove a pending request
  const friendship = await prisma.friendship.findFirst({
    where: {
      id: friendshipId,
      status: 'pending',
      OR: [{ senderId: player.accountId }, { receiverId: player.accountId }],
    },
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
  const player = await getPlayerSummary(playerId);
  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const friendship = await prisma.friendship.findFirst({
    where: {
      id: friendshipId,
      status: 'accepted',
      OR: [{ senderId: player.accountId }, { receiverId: player.accountId }],
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
  const player = await getPlayerSummary(playerId);
  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const friendships = await prisma.friendship.findMany({
    where: {
      status: 'accepted',
      OR: [{ senderId: player.accountId }, { receiverId: player.accountId }],
    },
    include: {
      sender: { select: { activePlayer: { select: { id: true, username: true, characterLevel: true } } } },
      receiver: { select: { activePlayer: { select: { id: true, username: true, characterLevel: true } } } },
    },
    orderBy: { acceptedAt: 'desc' },
  });

  return friendships.flatMap((friendship) => {
    const friendAccount = friendship.senderId === player.accountId ? friendship.receiver : friendship.sender;
    const friend = friendAccount.activePlayer;
    if (!friend) {
      return [];
    }

    return {
      friendshipId: friendship.id,
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
  const player = await getPlayerSummary(playerId);
  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const requests = await prisma.friendship.findMany({
    where: { receiverId: player.accountId, status: 'pending' },
    include: {
      sender: { select: { activePlayer: { select: { id: true, username: true, characterLevel: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return requests.flatMap((request) => {
    const sender = request.sender.activePlayer;
    if (!sender) {
      return [];
    }

    return {
      friendshipId: request.id,
      playerId: sender.id,
      username: sender.username,
      characterLevel: sender.characterLevel,
      createdAt: request.createdAt.toISOString(),
    };
  });
}

export async function getOutgoingRequests(
  playerId: string,
): Promise<FriendRequest[]> {
  const player = await getPlayerSummary(playerId);
  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const requests = await prisma.friendship.findMany({
    where: { senderId: player.accountId, status: 'pending' },
    include: {
      receiver: { select: { activePlayer: { select: { id: true, username: true, characterLevel: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return requests.flatMap((request) => {
    const receiver = request.receiver.activePlayer;
    if (!receiver) {
      return [];
    }

    return {
      friendshipId: request.id,
      playerId: receiver.id,
      username: receiver.username,
      characterLevel: receiver.characterLevel,
      createdAt: request.createdAt.toISOString(),
    };
  });
}

export async function getFriendProfile(
  playerId: string,
  friendshipId: string,
  onlinePlayers: Set<string>,
): Promise<FriendProfile> {
  const player = await getPlayerSummary(playerId);
  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const friendship = await prisma.friendship.findFirst({
    where: {
      id: friendshipId,
      status: 'accepted',
      OR: [{ senderId: player.accountId }, { receiverId: player.accountId }],
    },
    include: {
      sender: { select: { activePlayer: { select: { id: true, username: true, characterLevel: true } } } },
      receiver: { select: { activePlayer: { select: { id: true, username: true, characterLevel: true } } } },
    },
  });
  if (!friendship) {
    throw new AppError(404, 'Friendship not found', 'NOT_FOUND');
  }

  const friendAccount = friendship.senderId === player.accountId ? friendship.receiver : friendship.sender;
  const friend = friendAccount.activePlayer;
  if (!friend) {
    throw new AppError(404, 'Friendship not found', 'NOT_FOUND');
  }

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
  searcherId: string,
): Promise<{ id: string; username: string; characterLevel: number } | null> {
  const searcher = await getPlayerSummary(searcherId);
  if (!searcher) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  // Exclude players who have blocked the searcher (so blocking isn't obvious)
  const blockedByIds = await prisma.playerBlock.findMany({
    where: { blockedId: searcher.accountId },
    select: { blockerId: true },
  });
  const excludeAccountIds = [searcher.accountId, ...blockedByIds.map((block) => block.blockerId)];

  return prisma.player.findFirst({
    where: {
      username: { contains: username, mode: 'insensitive' },
      accountId: { notIn: excludeAccountIds },
    },
    select: { id: true, username: true, characterLevel: true },
  });
}
