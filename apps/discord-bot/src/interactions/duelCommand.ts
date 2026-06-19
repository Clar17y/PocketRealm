import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';

import { PocketRealmApiError } from '../api/pocketRealmApi.js';
import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
import {
  buildChallengeCard,
  buildDeclineCard,
  buildReplayCard,
  buildResultCard,
  type DuelCardPayload,
} from '../discord/duelCard.js';
import { parseDuelButtonId } from '../discord/components.js';
import type { DiscordEmojiMap } from '../discord/emojis.js';
import { statusCard, type V2CardPayload } from '../discord/v2Card.js';
import { isRecord } from '../utils.js';

type DuelApiClient = Pick<PocketRealmApiClient, 'get' | 'post'>;
type DuelCommandConfig = Pick<BotConfig, 'duelsChannelId' | 'emojiMap'>;
type DuelButtonConfig = Pick<BotConfig, 'emojiMap'>;

interface CreateDuelResponse {
  duel: {
    id: string;
    status: string;
    challengerUsername: string;
    targetUsername: string;
    expiresAt: string;
  };
}

interface DuelResultResponse {
  duel: {
    id: string;
    status: string;
    challengerUsername: string;
    targetUsername: string;
    winnerUsername: string | null;
    isDraw: boolean;
    expiresAt: string;
    summary: unknown;
    replay: unknown;
  };
}

interface DuelReplayResponse {
  replay: {
    id: string;
    status: string;
    page: number;
    pageSize: number;
    hasMore: boolean;
    summary: unknown;
    entries: unknown[];
  };
}

export async function handleDuelCommand(
  interaction: ChatInputCommandInteraction,
  api: DuelApiClient,
  config: DuelCommandConfig,
): Promise<void> {
  if (interaction.channelId !== config.duelsChannelId) {
    await interaction.reply({
      ...statusCard(
        'warning',
        'Wrong channel',
        `Use /duel in <#${config.duelsChannelId}>.`,
        config.emojiMap,
        { ephemeral: true },
      ),
    });
    return;
  }

  if (!interaction.guildId) {
    await interaction.reply({
      ...statusCard(
        'warning',
        'Server only',
        '/duel only works in the PocketRealm Discord server.',
        config.emojiMap,
        { ephemeral: true },
      ),
    });
    return;
  }

  const opponent = interaction.options.getUser('opponent', true);
  if (opponent.id === interaction.user.id) {
    await interaction.reply({
      ...statusCard(
        'warning',
        'Choose an opponent',
        'Challenge another player, not yourself.',
        config.emojiMap,
        { ephemeral: true },
      ),
    });
    return;
  }

  if (opponent.bot) {
    await interaction.reply({
      ...statusCard(
        'warning',
        'Choose a player',
        'Challenge a player, not a bot.',
        config.emojiMap,
        { ephemeral: true },
      ),
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // The public challenge is posted with channel.send(), which (unlike the previous
  // interaction follow-up) requires the bot to hold SendMessages in this channel.
  // isSendable() only checks the channel type, so verify the permission too, and bail
  // before creating the duel so a misconfigured channel never leaves an orphaned record.
  const channel = interaction.channel;
  if (!channel?.isSendable() || !interaction.appPermissions?.has(PermissionFlagsBits.SendMessages)) {
    await interaction.editReply(
      formatDuelPostFailure(
        'Could not post the public duel challenge. Make sure the bot can send messages in this channel, then run /duel again.',
        config.emojiMap,
      ),
    );
    return;
  }

  let response: CreateDuelResponse;
  try {
    response = await api.post<CreateDuelResponse>('/api/v1/discord/duels', {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      challengerDiscordUserId: interaction.user.id,
      targetDiscordUserId: opponent.id,
    });
  } catch (error) {
    await interaction.editReply(createDuelErrorCopy(error, config.emojiMap));
    return;
  }

  let replyResult: unknown;
  try {
    replyResult = await channel.send(buildChallengeCard({
      duelId: response.duel.id,
      challengerMention: `${interaction.user}`,
      opponentMention: `<@${opponent.id}>`,
      opponentDiscordUserId: opponent.id,
    }));
  } catch {
    await interaction.editReply(
      formatDuelPostFailure(
        'Could not post the public duel challenge. Please run /duel again.',
        config.emojiMap,
      ),
    );
    return;
  }

  await interaction.editReply(
    statusCard('success', 'Posted', 'Friendly simulation challenge posted.', config.emojiMap),
  );
  await recordDuelMessage(api, response.duel.id, replyResult);
}

export async function handleDuelButton(
  interaction: ButtonInteraction,
  api: DuelApiClient,
  config: DuelButtonConfig,
): Promise<void> {
  const parsed = parseDuelButtonId(interaction.customId);
  if (!parsed) return;

  if (parsed.action === 'accept' || parsed.action === 'decline') {
    if (interaction.user.id !== parsed.targetDiscordUserId) {
      await interaction.reply({
        ...statusCard(
          'warning',
          'Wrong player',
          'Only the challenged player can use this duel button.',
          config.emojiMap,
          { ephemeral: true },
        ),
      });
      return;
    }

    if (parsed.action === 'decline') {
      await applyDuelCardOrNotice(
        interaction,
        buildDeclineCard({ declinerMention: `<@${interaction.user.id}>` }),
        'update',
        config.emojiMap,
      );
      return;
    }

    await acceptDuel(interaction, api, parsed.duelId, config.emojiMap);
    return;
  }

  if (parsed.action === 'replay') {
    await showReplay(interaction, api, parsed.duelId, parsed.page, config.emojiMap);
    return;
  }

  if (parsed.action === 'builds') {
    await interaction.reply({
      ...statusCard(
        'info',
        'Builds unavailable',
        'Build previews are not available for friendly simulations yet.',
        config.emojiMap,
        { ephemeral: true },
      ),
    });
    return;
  }

  await interaction.reply({
    ...statusCard('info', 'Rematch', 'Use /duel to start a rematch for now.', config.emojiMap, { ephemeral: true }),
  });
}

async function acceptDuel(
  interaction: ButtonInteraction,
  api: Pick<PocketRealmApiClient, 'post'>,
  duelId: string,
  emojiMap: DiscordEmojiMap,
): Promise<void> {
  await interaction.deferUpdate();

  let response: DuelResultResponse;
  try {
    response = await api.post<DuelResultResponse>(`/api/v1/discord/duels/${encodeURIComponent(duelId)}/resolve`, {
      acceptedByDiscordUserId: interaction.user.id,
    });
  } catch (error) {
    await interaction.followUp(resolveDuelErrorCopy(error, emojiMap, { ephemeral: true }));
    return;
  }

  await applyDuelCardOrNotice(interaction, buildResultCard(response.duel), 'editReply', emojiMap);
}

const STALE_DUEL_NOTICE =
  'This duel was started before a bot update and can no longer be updated here. Run /duel to start a fresh one.';

// How a duel card reaches the message: a fresh `update` response (interaction
// not yet acknowledged) or an `editReply` after deferUpdate (acknowledged).
// The delivery mode also dictates the correct stale-message fallback, so the
// two can never drift out of sync.
type DuelCardDelivery = 'update' | 'editReply';

async function applyDuelCardOrNotice(
  interaction: ButtonInteraction,
  card: DuelCardPayload,
  delivery: DuelCardDelivery,
  emojiMap: DiscordEmojiMap,
): Promise<void> {
  try {
    if (delivery === 'update') {
      await interaction.update(card);
    } else {
      await interaction.editReply(card);
    }
  } catch (error) {
    // A message created before Components V2 shipped cannot be edited into a
    // V2 card (the flag is fixed at creation) — that is the only failure we
    // turn into a stale notice. If the message is already V2, the edit should
    // have worked, so any failure is transient (Discord outage, rate limit);
    // re-throw it to the top-level handler, which logs it, rather than telling
    // the user their healthy duel is stale.
    if (interaction.message.flags.has(MessageFlags.IsComponentsV2)) {
      throw error;
    }
    await sendStaleDuelNotice(interaction, delivery, emojiMap);
  }
}

async function sendStaleDuelNotice(
  interaction: ButtonInteraction,
  delivery: DuelCardDelivery,
  emojiMap: DiscordEmojiMap,
): Promise<void> {
  const payload = statusCard('warning', 'Duel unavailable', STALE_DUEL_NOTICE, emojiMap, { ephemeral: true });
  try {
    if (delivery === 'update') {
      await interaction.reply(payload);
    } else {
      await interaction.followUp(payload);
    }
  } catch {
    // Nothing more we can safely do if the fallback delivery also fails.
  }
}

async function showReplay(
  interaction: ButtonInteraction,
  api: Pick<PocketRealmApiClient, 'get'>,
  duelId: string,
  page: number,
  emojiMap: DiscordEmojiMap,
): Promise<void> {
  await interaction.deferUpdate();

  try {
    const response = await api.get<DuelReplayResponse>(
      `/api/v1/discord/duels/${encodeURIComponent(duelId)}/replay?page=${page}`,
    );
    await interaction.editReply(buildReplayCard(response.replay));
  } catch {
    await sendReplayLoadError(interaction, emojiMap);
  }
}

async function sendReplayLoadError(interaction: ButtonInteraction, emojiMap: DiscordEmojiMap): Promise<void> {
  try {
    await interaction.followUp({
      ...statusCard(
        'error',
        'Replay unavailable',
        'Unable to load the friendly simulation replay right now.',
        emojiMap,
        { ephemeral: true },
      ),
    });
  } catch {
    // The public duel message is already preserved; there is no safe fallback if follow-up delivery fails.
  }
}

async function recordDuelMessage(
  api: Pick<PocketRealmApiClient, 'post'>,
  duelId: string,
  replyResult: unknown,
): Promise<void> {
  const messageId = readMessageId(replyResult);
  if (!messageId) return;

  try {
    await api.post(`/api/v1/discord/duels/${encodeURIComponent(duelId)}/message`, {
      messageId,
    });
  } catch {
    // Message mapping is helpful for later sync, but the public challenge has already succeeded.
  }
}

function readMessageId(value: unknown): string | null {
  if (!isRecord(value)) return null;

  if (typeof value.id === 'string') {
    return value.id;
  }

  if (isRecord(value.resource) && isRecord(value.resource.message)) {
    const { id } = value.resource.message;
    return typeof id === 'string' ? id : null;
  }

  return null;
}

function formatDuelPostFailure(detail: string, emojiMap: DiscordEmojiMap): V2CardPayload {
  return statusCard('warning', 'Post failed', detail, emojiMap);
}

function createDuelErrorCopy(error: unknown, emojiMap: DiscordEmojiMap): V2CardPayload {
  if (error instanceof PocketRealmApiError) {
    if (
      error.code === 'DISCORD_LINK_REQUIRED'
      || error.code === 'DISCORD_DUEL_CHALLENGER_LINK_REQUIRED'
      || error.code === 'DISCORD_DUEL_TARGET_LINK_REQUIRED'
    ) {
      return statusCard(
        'warning',
        'Link required',
        'Both players need linked PocketRealm accounts before dueling.',
        emojiMap,
      );
    }

    if (
      error.code === 'DISCORD_PLAYER_NOT_FOUND'
      || error.code === 'DISCORD_DUEL_CHALLENGER_PLAYER_NOT_FOUND'
      || error.code === 'DISCORD_DUEL_TARGET_PLAYER_NOT_FOUND'
    ) {
      return statusCard(
        'warning',
        'Character missing',
        'Both players need active PocketRealm characters before dueling.',
        emojiMap,
      );
    }

    if (error.code === 'DISCORD_SELF_CHALLENGE' || error.code === 'DISCORD_DUEL_SELF_CHALLENGE') {
      return statusCard(
        'warning',
        'Choose an opponent',
        'Challenge another player, not yourself.',
        emojiMap,
      );
    }
  }

  return statusCard(
    'error',
    'Duel unavailable',
    'Unable to create a friendly duel right now. Please try again later.',
    emojiMap,
  );
}

function resolveDuelErrorCopy(
  error: unknown,
  emojiMap: DiscordEmojiMap,
  options: { ephemeral?: boolean } = {},
): V2CardPayload {
  if (error instanceof PocketRealmApiError) {
    if (
      error.code === 'DISCORD_LINK_REQUIRED'
      || error.code === 'DISCORD_DUEL_CHALLENGER_LINK_REQUIRED'
      || error.code === 'DISCORD_DUEL_TARGET_LINK_REQUIRED'
    ) {
      return statusCard(
        'warning',
        'Link required',
        'Link your PocketRealm account first with /link.',
        emojiMap,
        options,
      );
    }

    if (
      error.status === 404
      || error.status === 409
      || error.status === 410
      || error.code === 'DISCORD_DUEL_EXPIRED'
      || error.code === 'DISCORD_DUEL_NOT_PENDING'
      || error.code === 'DISCORD_DUEL_NOT_FOUND'
    ) {
      return statusCard(
        'warning',
        'Duel unavailable',
        'That friendly duel is no longer available. Start a new /duel.',
        emojiMap,
        options,
      );
    }
  }

  return statusCard(
    'error',
    'Duel failed',
    'Unable to resolve that friendly duel right now. Please try again later.',
    emojiMap,
    options,
  );
}
