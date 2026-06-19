import type { DiscordEmojiMap } from '../discord/emojis.js';
import { buildTriageCard, type UnpostedTicketsResponse } from './triageCards.js';

const TRIAGE_POST_SUPPRESSION_SECONDS = 60 * 60;

interface SupportTriageApi {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
}

interface SentTriageMessage {
  id: string;
  delete(): Promise<unknown>;
}

interface SendableChannel {
  isSendable(): boolean;
  send(payload: unknown): Promise<SentTriageMessage>;
}

interface ReadyClientLike {
  channels: {
    fetch(channelId: string): Promise<unknown>;
  };
}

interface LoggerLike {
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

interface TriageSuppressionStore {
  set(
    key: string,
    value: string,
    expiryMode: 'EX',
    seconds: number,
    setMode: 'NX',
  ): Promise<'OK' | string | null>;
  del(key: string): Promise<unknown>;
}

export interface SupportTriagePollOptions {
  api: SupportTriageApi;
  config: {
    guildId: string;
    supportTriageChannelId: string;
    emojiMap?: DiscordEmojiMap;
  };
  logger: LoggerLike;
  readyClient: ReadyClientLike;
  redis?: TriageSuppressionStore;
}

export async function pollSupportTriageTickets(options: SupportTriagePollOptions): Promise<void> {
  const channel = await options.readyClient.channels.fetch(options.config.supportTriageChannelId);
  if (!isSendableChannel(channel)) {
    options.logger.warn(
      { channelId: options.config.supportTriageChannelId },
      'Discord support triage channel is not sendable',
    );
    return;
  }

  const { tickets } = await options.api.get<UnpostedTicketsResponse>(
    '/api/v1/discord/support/tickets/unposted',
  );

  for (const ticket of tickets) {
    const suppressionKey = triagePostingSuppressionKey(ticket.publicId);
    if (!await claimTriagePosting(options, suppressionKey, ticket.publicId)) {
      continue;
    }

    let sentMessage: SentTriageMessage | null = null;
    try {
      sentMessage = await channel.send(buildTriageCard(ticket, options.config.emojiMap));
      await options.api.post(`/api/v1/discord/support/tickets/${ticket.publicId}/triage-message`, {
        guildId: options.config.guildId,
        triageChannelId: options.config.supportTriageChannelId,
        triageMessageId: sentMessage.id,
      });
      await releaseTriagePosting(options, suppressionKey, ticket.publicId);
    } catch (error) {
      if (!sentMessage) {
        await releaseTriagePosting(options, suppressionKey, ticket.publicId);
        options.logger.warn({ error, publicId: ticket.publicId }, 'Failed to post Discord support triage card');
        continue;
      }

      await rollbackUnregisteredTriageCard(options, suppressionKey, ticket.publicId, sentMessage, error);
    }
  }
}

/**
 * The card was posted to Discord but could not be registered with the API.
 * Best effort: delete the posted card so the suppression key can be released
 * for a clean retry. If the delete also fails, keep the key suppressed so the
 * card is not duplicated, and flag the ticket for manual repair.
 */
async function rollbackUnregisteredTriageCard(
  options: SupportTriagePollOptions,
  suppressionKey: string,
  publicId: string,
  sentMessage: SentTriageMessage,
  error: unknown,
): Promise<void> {
  try {
    await sentMessage.delete();
  } catch (deleteError) {
    options.logger.error(
      { error, deleteError, publicId, messageId: sentMessage.id },
      'Discord support triage card was posted but could not be registered or deleted; requires manual repair (delete the card or register the triage message)',
    );
    return;
  }

  await releaseTriagePosting(options, suppressionKey, publicId);
  options.logger.warn(
    { error, publicId, messageId: sentMessage.id },
    'Discord support triage card registration failed; deleted the posted card so the next poll can retry',
  );
}

function triagePostingSuppressionKey(publicId: string): string {
  return `discord:support-triage:posting:${publicId}`;
}

async function claimTriagePosting(
  options: SupportTriagePollOptions,
  key: string,
  publicId: string,
): Promise<boolean> {
  if (!options.redis) return true;

  try {
    const claimed = await options.redis.set(
      key,
      '1',
      'EX',
      TRIAGE_POST_SUPPRESSION_SECONDS,
      'NX',
    );
    if (claimed === 'OK') return true;

    options.logger.debug(
      { publicId },
      'Discord support triage card skipped because a previous post attempt is still suppressed',
    );
    return false;
  } catch (error) {
    options.logger.warn(
      { error, publicId },
      'Discord support triage suppression check failed',
    );
    return true;
  }
}

async function releaseTriagePosting(
  options: SupportTriagePollOptions,
  key: string,
  publicId: string,
): Promise<void> {
  if (!options.redis) return;

  try {
    await options.redis.del(key);
  } catch (error) {
    options.logger.warn(
      { error, publicId },
      'Discord support triage suppression release failed',
    );
  }
}

function isSendableChannel(channel: unknown): channel is SendableChannel {
  return hasSendableChannelShape(channel) && channel.isSendable();
}

function hasSendableChannelShape(channel: unknown): channel is SendableChannel {
  return Boolean(
    channel &&
      typeof channel === 'object' &&
      'isSendable' in channel &&
      typeof channel.isSendable === 'function' &&
      'send' in channel &&
      typeof channel.send === 'function',
  );
}
