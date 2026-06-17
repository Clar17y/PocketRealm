import { Prisma, prisma } from '@pocketrealm/database';
import { logger } from '../logger';
import { DISCORD_NOTIFICATION_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';
import {
  DISCORD_NOTIFICATION_TYPES,
  type DiscordNotificationEventView,
  type DiscordNotificationPayload,
  type DiscordNotificationPreferenceView,
  type DiscordNotificationType,
} from '@pocketrealm/shared/discord/discordNotifications';
import {
  DISCORD_LINK_REQUIRED_ERROR,
  findLinkedDiscordPlayer,
} from './discordLinkedPlayer';

export interface DiscordNotificationPreferenceLookup {
  guildId: string;
  discordUserId: string;
}

export interface DiscordNotificationPreferenceUpsert {
  discordGuildId: string;
  discordUserId: string;
  type: DiscordNotificationType;
  enabled: boolean;
}

export interface DiscordNotificationAck {
  deliveredIds: string[];
  failedIds: string[];
}

export async function listDiscordNotificationPreferences(
  input: DiscordNotificationPreferenceLookup,
): Promise<DiscordNotificationPreferenceView[]> {
  await findLinkedDiscordPlayer(input, { linkRequired: DISCORD_LINK_REQUIRED_ERROR });

  const stored = await prisma.discordNotificationPreference.findMany({
    where: {
      discordGuildId: input.guildId,
      discordUserId: input.discordUserId,
    },
    select: { type: true, enabled: true },
  });

  return DISCORD_NOTIFICATION_TYPES.map((type) => ({
    type,
    enabled: stored.find((preference) => preference.type === type)?.enabled ?? false,
  }));
}

export async function upsertDiscordNotificationPreference(
  input: DiscordNotificationPreferenceUpsert,
): Promise<DiscordNotificationPreferenceView> {
  await findLinkedDiscordPlayer(
    { guildId: input.discordGuildId, discordUserId: input.discordUserId },
    { linkRequired: DISCORD_LINK_REQUIRED_ERROR },
  );

  const preference = await prisma.discordNotificationPreference.upsert({
    where: {
      discordGuildId_discordUserId_type: {
        discordGuildId: input.discordGuildId,
        discordUserId: input.discordUserId,
        type: input.type,
      },
    },
    create: {
      discordGuildId: input.discordGuildId,
      discordUserId: input.discordUserId,
      type: input.type,
      enabled: input.enabled,
    },
    update: { enabled: input.enabled, ...(input.enabled ? { armed: true } : {}) },
  });

  return {
    type: preference.type as DiscordNotificationType,
    enabled: preference.enabled,
  };
}

export async function listPendingDiscordNotificationEvents(
  limit: number = DISCORD_NOTIFICATION_CONSTANTS.PENDING_BATCH_LIMIT,
): Promise<DiscordNotificationEventView[]> {
  const events = await prisma.discordNotificationEvent.findMany({
    where: { deliveredAt: null, failedAt: null },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      id: true,
      discordGuildId: true,
      discordUserId: true,
      type: true,
      payload: true,
      createdAt: true,
    },
  });

  return events.map((event) => ({
    id: event.id,
    discordGuildId: event.discordGuildId,
    discordUserId: event.discordUserId,
    type: event.type as DiscordNotificationType,
    payload: event.payload as unknown as DiscordNotificationPayload,
    createdAt: event.createdAt.toISOString(),
  }));
}

export async function ackDiscordNotificationEvents(
  input: DiscordNotificationAck,
  now: Date = new Date(),
): Promise<{ delivered: number; failed: number }> {
  let delivered = 0;
  let failed = 0;

  if (input.deliveredIds.length > 0) {
    const result = await prisma.discordNotificationEvent.updateMany({
      where: { id: { in: input.deliveredIds }, deliveredAt: null },
      data: { deliveredAt: now },
    });
    delivered = result.count;
  }

  if (input.failedIds.length > 0) {
    const [incremented] = await prisma.$transaction([
      prisma.discordNotificationEvent.updateMany({
        where: { id: { in: input.failedIds }, deliveredAt: null, failedAt: null },
        data: { attempts: { increment: 1 } },
      }),
      prisma.discordNotificationEvent.updateMany({
        where: {
          id: { in: input.failedIds },
          attempts: { gte: DISCORD_NOTIFICATION_CONSTANTS.MAX_DELIVERY_ATTEMPTS },
          failedAt: null,
        },
        data: { failedAt: now },
      }),
    ]);
    failed = incremented.count;
  }

  return { delivered, failed };
}

export interface DiscordTarget {
  discordUserId: string;
  discordGuildId: string;
}

/**
 * Resolves a player to their active linked Discord user + guild, or null when
 * the player has no active link. Newest active link wins.
 */
export async function resolveDiscordTarget(playerId: string): Promise<DiscordTarget | null> {
  const link = await prisma.discordAccountLink.findFirst({
    where: { account: { players: { some: { id: playerId } } }, unlinkedAt: null },
    orderBy: { linkedAt: 'desc' },
    select: { discordUserId: true, discordGuildId: true },
  });
  return link;
}

/**
 * Targeted Discord DM: enqueue an outbox event for one player, gated on their
 * per-type `/notify` preference. Fire-and-forget — never throws to the caller.
 */
export async function enqueueDiscordNotificationEvent(
  playerId: string,
  type: DiscordNotificationType,
  payload: DiscordNotificationPayload,
): Promise<void> {
  try {
    const target = await resolveDiscordTarget(playerId);
    if (!target) return;

    const preference = await prisma.discordNotificationPreference.findUnique({
      where: {
        discordGuildId_discordUserId_type: {
          discordGuildId: target.discordGuildId,
          discordUserId: target.discordUserId,
          type,
        },
      },
      select: { enabled: true },
    });
    if (!preference?.enabled) return;

    await prisma.discordNotificationEvent.create({
      data: {
        discordGuildId: target.discordGuildId,
        discordUserId: target.discordUserId,
        type,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.error({ err, playerId, type }, 'Failed to enqueue Discord notification event');
  }
}

/**
 * Broadcast Discord DM: enqueue one outbox event per user opted into `type`.
 * Used for global events (boss appeared). Fire-and-forget.
 */
export async function broadcastDiscordNotification(
  type: DiscordNotificationType,
  payload: DiscordNotificationPayload,
): Promise<void> {
  try {
    const recipients = await prisma.discordNotificationPreference.findMany({
      where: { type, enabled: true },
      select: { discordGuildId: true, discordUserId: true },
    });
    if (recipients.length === 0) return;

    await prisma.discordNotificationEvent.createMany({
      data: recipients.map((recipient) => ({
        discordGuildId: recipient.discordGuildId,
        discordUserId: recipient.discordUserId,
        type,
        payload: payload as unknown as Prisma.InputJsonValue,
      })),
    });
  } catch (err) {
    logger.error({ err, type }, 'Failed to broadcast Discord notification');
  }
}
