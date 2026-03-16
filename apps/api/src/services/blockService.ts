import { prisma } from '@pocketrealm/database';
import type { BlockedPlayer } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';

export async function isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const block = await prisma.playerBlock.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    select: { id: true },
  });
  return block !== null;
}

export async function blockPlayer(blockerId: string, targetId: string): Promise<void> {
  if (blockerId === targetId) {
    throw new AppError(400, 'Cannot block yourself', 'SELF_BLOCK');
  }

  const target = await prisma.player.findUnique({
    where: { id: targetId },
    select: { id: true },
  });
  if (!target) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  await prisma.$transaction(async (tx) => {
    // Use upsert to eliminate TOCTOU race: concurrent calls both pass the
    // existence check when it runs outside the transaction.
    await (tx as any).playerBlock.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId: targetId } },
      create: { blockerId, blockedId: targetId },
      update: {}, // no-op if already exists
    });

    // Remove any existing friendship (either direction)
    await tx.friendship.deleteMany({
      where: {
        status: 'accepted',
        OR: [
          { senderId: blockerId, receiverId: targetId },
          { senderId: targetId, receiverId: blockerId },
        ],
      },
    });

    // Delete any pending requests between the two players (both directions)
    await tx.friendship.deleteMany({
      where: {
        status: 'pending',
        OR: [
          { senderId: targetId, receiverId: blockerId },
          { senderId: blockerId, receiverId: targetId },
        ],
      },
    });
  });
}

export async function unblockPlayer(playerId: string, blockId: string): Promise<void> {
  const block = await prisma.playerBlock.findFirst({
    where: { id: blockId, blockerId: playerId },
    select: { id: true },
  });
  if (!block) {
    throw new AppError(404, 'Block not found', 'NOT_FOUND');
  }

  await prisma.playerBlock.delete({ where: { id: blockId } });
}

export async function getBlockList(playerId: string): Promise<BlockedPlayer[]> {
  const blocks = await prisma.playerBlock.findMany({
    where: { blockerId: playerId },
    include: { blocked: { select: { username: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return blocks.map((b) => ({
    blockId: b.id,
    playerId: b.blockedId,
    username: b.blocked.username,
    createdAt: b.createdAt.toISOString(),
  }));
}
