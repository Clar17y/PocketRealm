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

import type { DiscordEmojiMap } from '../discord/emojis.js';
import { textCard, type V2CardPayload } from '../discord/v2Card.js';

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
  emojiMap?: DiscordEmojiMap;
  redis?: DeliverySuppressionStore;
}

interface PendingNotificationsResponse {
  events: DiscordNotificationEventView[];
}

function gameLink(webBaseUrl: string, path: string): string {
  return `${webBaseUrl.replace(/\/$/, '')}${path}`;
}

export function buildNotificationCard(
  event: DiscordNotificationEventView,
  webBaseUrl: string,
  emojiMap: DiscordEmojiMap = {},
): V2CardPayload {
  switch (event.type) {
    case 'pvp_attack': {
      const p = event.payload as DiscordPvpAttackPayload;
      return textCard({
        emojiKey: 'duel',
        title: p.attackerName,
        emojiMap,
        lines: [`challenged you in the arena! [Fight back ->](${gameLink(webBaseUrl, '/game?screen=arena')})`],
      });
    }
    case 'pvp_scout': {
      const p = event.payload as DiscordPvpScoutPayload;
      return textCard({
        emojiKey: 'scout',
        title: p.scouterName,
        emojiMap,
        lines: [`is sizing you up in the arena. [Check the arena ->](${gameLink(webBaseUrl, '/game?screen=arena')})`],
      });
    }
    case 'boss_appeared': {
      const p = event.payload as DiscordBossAppearedPayload;
      return textCard({
        emojiKey: 'boss',
        title: p.bossName,
        emojiMap,
        lines: [`has appeared in **${p.zoneName}**! [Join the fight ->](${gameLink(webBaseUrl, '/game?screen=worldEvents')})`],
      });
    }
    case 'boss_defeated': {
      const p = event.payload as DiscordBossDefeatedPayload;
      return textCard({
        emojiKey: 'victory',
        title: p.bossName,
        emojiMap,
        lines: [`has been slain! [Claim your spoils ->](${gameLink(webBaseUrl, '/game?screen=worldEvents')})`],
      });
    }
    case 'expedition_recruiting': {
      const p = event.payload as DiscordExpeditionRecruitingPayload;
      return textCard({
        emojiKey: 'expedition',
        title: `Tier ${p.tier} expedition`,
        emojiMap,
        lines: [`A guild expedition is recruiting. [Sign up ->](${gameLink(webBaseUrl, '/game?screen=guild&tab=expeditions')})`],
      });
    }
    case 'expedition_finished': {
      const p = event.payload as DiscordExpeditionFinishedPayload;
      const expeditions = gameLink(webBaseUrl, '/game?screen=guild&tab=expeditions');
      return p.outcome === 'victory'
        ? textCard({
          emojiKey: 'success',
          title: `Tier ${p.tier} expedition`,
          emojiMap,
          lines: [`Your expedition was victorious! [Collect rewards ->](${expeditions})`],
        })
        : textCard({
          emojiKey: 'warning',
          title: `Tier ${p.tier} expedition failed`,
          emojiMap,
          lines: [`Failed after ${p.attempts} attempts. [View expeditions ->](${expeditions})`],
        });
    }
    case 'turns_capped': {
      const p = event.payload as DiscordTurnsCappedPayload;
      const turns = p.currentTurns.toLocaleString('en-US');
      const cap = p.bankCap.toLocaleString('en-US');
      return textCard({
        emojiKey: 'turns',
        title: 'Turns capped',
        emojiMap,
        lines: [`${p.username}, your turns are full (${turns}/${cap})! Regen is going to waste - time for an adventure.`],
      });
    }
    default: {
      return textCard({
        emojiKey: 'info',
        title: 'PocketRealm notification',
        emojiMap,
        lines: [`You have a new PocketRealm notification. ${gameLink(webBaseUrl, '/game')}`],
      });
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
      await user.send(buildNotificationCard(event, options.webBaseUrl, options.emojiMap));
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
