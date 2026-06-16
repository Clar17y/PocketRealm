import { prisma } from '@pocketrealm/database';
import { redis } from '../redis';
import { logger } from '../logger';
import type { NotificationType } from './pushNotificationService';

export interface DiscordTarget {
  discordUserId: string;
}

/**
 * Resolves a player to their active linked Discord user, or null when the
 * player has no active link. Single query via the Account → players relation
 * (mirrors the active-link predicate in discordLinkedPlayer.ts).
 */
export async function resolveDiscordTarget(playerId: string): Promise<DiscordTarget | null> {
  const link = await prisma.discordAccountLink.findFirst({
    where: {
      account: { players: { some: { id: playerId } } },
      unlinkedAt: null,
    },
    orderBy: { linkedAt: 'desc' },
    select: { discordUserId: true },
  });
  if (!link) return null;

  return { discordUserId: link.discordUserId };
}

/** Redis list key shared with the bot (apps/discord-bot/src/notifications/notificationContract.ts). */
export const DISCORD_NOTIFICATION_QUEUE = 'discord:notifications';
const MAX_QUEUE_LENGTH = 1000;

export interface DiscordNotificationContent {
  title: string;
  body: string;
}

export interface DiscordNotificationMessage extends DiscordNotificationContent {
  discordUserId: string;
  type: NotificationType;
}

/** Pushes a notification onto the durable Redis queue and caps its length. */
export async function publishDiscordNotification(message: DiscordNotificationMessage): Promise<void> {
  const transaction = redis.multi();
  transaction.lpush(DISCORD_NOTIFICATION_QUEUE, JSON.stringify(message));
  transaction.ltrim(DISCORD_NOTIFICATION_QUEUE, 0, MAX_QUEUE_LENGTH - 1);
  await transaction.exec();
}

/**
 * Fire-and-forget Discord fan-out: resolves the linked target and publishes.
 * Swallows all errors so callers can `void` it without affecting their flow.
 */
export async function notifyDiscord(
  playerId: string,
  type: NotificationType,
  content: DiscordNotificationContent,
): Promise<void> {
  try {
    const target = await resolveDiscordTarget(playerId);
    if (!target) return;
    await publishDiscordNotification({
      discordUserId: target.discordUserId,
      type,
      title: content.title,
      body: content.body,
    });
  } catch (err) {
    logger.error({ err, playerId, type }, 'Failed to publish Discord notification');
  }
}
