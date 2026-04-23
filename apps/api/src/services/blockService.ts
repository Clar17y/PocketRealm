import { prisma } from '@pocketrealm/database';
import type { BlockedPlayer } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';

async function getAccountIdForPlayer(playerId: string): Promise<string | null> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { accountId: true },
  });

  return player?.accountId ?? null;
}

export async function isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const [blockerAccountId, blockedAccountId] = await Promise.all([
    getAccountIdForPlayer(blockerId),
    getAccountIdForPlayer(blockedId),
  ]);

  if (!blockerAccountId || !blockedAccountId) {
    return false;
  }

  const block = await prisma.playerBlock.findUnique({
    where: { blockerId_blockedId: { blockerId: blockerAccountId, blockedId: blockedAccountId } },
    select: { id: true },
  });
  return block !== null;
}

export async function blockPlayer(blockerId: string, targetId: string): Promise<void> {
  if (blockerId === targetId) {
    throw new AppError(400, 'Cannot block yourself', 'SELF_BLOCK');
  }

  const [blocker, target] = await Promise.all([
    prisma.player.findUnique({
      where: { id: blockerId },
      select: { accountId: true },
    }),
    prisma.player.findUnique({
      where: { id: targetId },
      select: { id: true, accountId: true },
    }),
  ]);

  if (!blocker) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  if (!target) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }
  if (blocker.accountId === target.accountId) {
    throw new AppError(400, 'Cannot block yourself', 'SELF_BLOCK');
  }

  await prisma.$transaction(async (tx) => {
    await tx.playerBlock.upsert({
      where: { blockerId_blockedId: { blockerId: blocker.accountId, blockedId: target.accountId } },
      create: { blockerId: blocker.accountId, blockedId: target.accountId },
      update: {},
    });

    await tx.friendship.deleteMany({
      where: {
        OR: [
          { senderId: blocker.accountId, receiverId: target.accountId },
          { senderId: target.accountId, receiverId: blocker.accountId },
        ],
      },
    });
  });
}

export async function unblockPlayer(playerId: string, blockId: string): Promise<void> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { accountId: true },
  });
  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const block = await prisma.playerBlock.findFirst({
    where: { id: blockId, blockerId: player.accountId },
    select: { id: true },
  });
  if (!block) {
    throw new AppError(404, 'Block not found', 'NOT_FOUND');
  }

  await prisma.playerBlock.delete({ where: { id: blockId } });
}

export async function getBlockList(playerId: string): Promise<BlockedPlayer[]> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, accountId: true },
  });
  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const blocks = await prisma.playerBlock.findMany({
    where: { blockerId: player.accountId },
    include: {
      blocked: {
        select: {
          activePlayer: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return blocks
    .filter((block) => block.blocked.activePlayer)
    .map((block) => ({
      blockId: block.id,
      playerId: block.blocked.activePlayer!.id,
      username: block.blocked.activePlayer!.username,
      createdAt: block.createdAt.toISOString(),
    }));
}
