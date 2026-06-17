import { DISCORD_NOTIFICATION_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';
import type {
  DiscordBossAppearedPayload,
  DiscordBossDefeatedPayload,
  DiscordExpeditionFinishedPayload,
  DiscordExpeditionRecruitingPayload,
  DiscordNotificationEventView,
  DiscordPvpAttackPayload,
  DiscordPvpScoutPayload,
  DiscordTurnsCappedPayload,
} from '@pocketrealm/shared/discord/discordNotifications';

interface NotificationApi {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
}

interface DmCapableUser {
  send(payload: unknown): Promise<unknown>;
}

interface ReadyClientLike {
  users: {
    fetch(userId: string): Promise<DmCapableUser>;
  };
}

interface LoggerLike {
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

interface DeliverySuppressionStore {
  set(
    key: string,
    value: string,
    expiryMode: 'EX',
    seconds: number,
    setMode: 'NX',
  ): Promise<'OK' | string | null>;
  del(key: string): Promise<unknown>;
}

export interface DiscordNotificationPollOptions {
  api: NotificationApi;
  logger: LoggerLike;
  readyClient: ReadyClientLike;
  webBaseUrl: string;
  redis?: DeliverySuppressionStore;
}

interface PendingNotificationsResponse {
  events: DiscordNotificationEventView[];
}

function gameLink(webBaseUrl: string, path: string): string {
  return `${webBaseUrl.replace(/\/$/, '')}${path}`;
}

export function formatNotificationMessage(event: DiscordNotificationEventView, webBaseUrl: string): string {
  const arena = gameLink(webBaseUrl, '/game?screen=arena');
  const worldEvents = gameLink(webBaseUrl, '/game?screen=worldEvents');
  const expeditions = gameLink(webBaseUrl, '/game?screen=guild&tab=expeditions');

  switch (event.type) {
    case 'pvp_attack': {
      const p = event.payload as DiscordPvpAttackPayload;
      return `⚔️ **${p.attackerName}** challenged you in the arena! [Fight back →](${arena})`;
    }
    case 'pvp_scout': {
      const p = event.payload as DiscordPvpScoutPayload;
      return `🔍 **${p.scouterName}** is sizing you up in the arena. [Check the arena →](${arena})`;
    }
    case 'boss_appeared': {
      const p = event.payload as DiscordBossAppearedPayload;
      return `🐉 **${p.bossName}** has appeared in **${p.zoneName}**! [Join the fight →](${worldEvents})`;
    }
    case 'boss_defeated': {
      const p = event.payload as DiscordBossDefeatedPayload;
      return `🏆 **${p.bossName}** has been slain! [Claim your spoils →](${worldEvents})`;
    }
    case 'expedition_recruiting': {
      const p = event.payload as DiscordExpeditionRecruitingPayload;
      return `🧭 A Tier ${p.tier} guild expedition is recruiting — [sign up →](${expeditions})`;
    }
    case 'expedition_finished': {
      const p = event.payload as DiscordExpeditionFinishedPayload;
      return p.outcome === 'victory'
        ? `🎉 Your Tier ${p.tier} expedition was victorious! [Collect rewards →](${expeditions})`
        : `💀 Your Tier ${p.tier} expedition failed after ${p.attempts ?? 0} attempts. [View expeditions →](${expeditions})`;
    }
    case 'turns_capped':
    default: {
      const p = event.payload as DiscordTurnsCappedPayload;
      const turns = p.currentTurns.toLocaleString('en-US');
      const cap = p.bankCap.toLocaleString('en-US');
      return `⚡ ${p.username}, your turns are full (${turns}/${cap})! Regen is going to waste — time for an adventure.`;
    }
  }
}

export async function pollDiscordNotifications(options: DiscordNotificationPollOptions): Promise<void> {
  const { events } = await options.api.get<PendingNotificationsResponse>(
    `/api/v1/discord/notifications/pending?limit=${DISCORD_NOTIFICATION_CONSTANTS.PENDING_BATCH_LIMIT}`,
  );

  const deliveredIds: string[] = [];
  const failedIds: string[] = [];

  for (const event of events) {
    if (!event.discordUserId) {
      // Channel-targeted events arrive with later notification types; until
      // then a DM-less event can never deliver, so fail it toward the
      // attempts cap instead of serving it forever.
      failedIds.push(event.id);
      continue;
    }

    const suppressionKey = deliverySuppressionKey(event.id);
    if (!await claimDelivery(options, suppressionKey, event.id)) {
      continue;
    }

    try {
      const user = await options.readyClient.users.fetch(event.discordUserId);
      await user.send({ content: formatNotificationMessage(event, options.webBaseUrl) });
      deliveredIds.push(event.id);
    } catch (error) {
      failedIds.push(event.id);
      await releaseDelivery(options, suppressionKey, event.id);
      options.logger.warn(
        { error, eventId: event.id, discordUserId: event.discordUserId },
        'Failed to deliver Discord notification DM',
      );
    }
  }

  if (deliveredIds.length === 0 && failedIds.length === 0) {
    return;
  }

  await options.api.post('/api/v1/discord/notifications/ack', { deliveredIds, failedIds });
}

function deliverySuppressionKey(eventId: string): string {
  return `discord:notifications:delivery:${eventId}`;
}

async function claimDelivery(
  options: DiscordNotificationPollOptions,
  key: string,
  eventId: string,
): Promise<boolean> {
  if (!options.redis) return true;

  try {
    const claimed = await options.redis.set(
      key,
      '1',
      'EX',
      DISCORD_NOTIFICATION_CONSTANTS.SUPPRESSION_TTL_SECONDS,
      'NX',
    );
    if (claimed === 'OK') return true;

    options.logger.debug(
      { eventId },
      'Discord notification delivery skipped because a previous attempt is still suppressed',
    );
    return false;
  } catch (error) {
    options.logger.warn({ error, eventId }, 'Discord notification suppression check failed');
    return true;
  }
}

async function releaseDelivery(
  options: DiscordNotificationPollOptions,
  key: string,
  eventId: string,
): Promise<void> {
  if (!options.redis) return;

  try {
    await options.redis.del(key);
  } catch (error) {
    options.logger.warn({ error, eventId }, 'Discord notification suppression release failed');
  }
}
