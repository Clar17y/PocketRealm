import { prisma } from '@pocketrealm/database';
import { DISCORD_NOTIFICATION_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';
import {
  DISCORD_NOTIFICATION_TYPES,
  type DiscordNotificationEventView,
  type DiscordNotificationPreferenceView,
  type DiscordNotificationType,
  type DiscordTurnsCappedPayload,
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
    update: { enabled: input.enabled },
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
    payload: event.payload as unknown as DiscordTurnsCappedPayload,
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
