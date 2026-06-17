import { PermissionFlagsBits } from 'discord.js';
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
} from '../discord/duelCard.js';
import { parseDuelButtonId } from '../discord/components.js';
import { isRecord } from '../utils.js';

type DuelApiClient = Pick<PocketRealmApiClient, 'get' | 'post'>;
type DuelCommandConfig = Pick<BotConfig, 'duelsChannelId'>;

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
      ephemeral: true,
      content: `Use /duel in <#${config.duelsChannelId}>.`,
    });
    return;
  }

  if (!interaction.guildId) {
    await interaction.reply({
      ephemeral: true,
      content: '/duel only works in the PocketRealm Discord server.',
    });
    return;
  }

  const opponent = interaction.options.getUser('opponent', true);
  if (opponent.id === interaction.user.id) {
    await interaction.reply({
      ephemeral: true,
      content: 'Challenge another player, not yourself.',
    });
    return;
  }

  if (opponent.bot) {
    await interaction.reply({
      ephemeral: true,
      content: 'Challenge a player, not a bot.',
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
    await interaction.editReply({
      content: 'Could not post the public duel challenge. Make sure the bot can send messages in this channel, then run /duel again.',
    });
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
    await interaction.editReply({
      content: createDuelErrorCopy(error),
    });
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
    await interaction.editReply({
      content: 'Could not post the public duel challenge. Please run /duel again.',
    });
    return;
  }

  await interaction.editReply({ content: 'Friendly simulation challenge posted.' });
  await recordDuelMessage(api, response.duel.id, replyResult);
}

export async function handleDuelButton(
  interaction: ButtonInteraction,
  api: DuelApiClient,
): Promise<void> {
  const parsed = parseDuelButtonId(interaction.customId);
  if (!parsed) return;

  if (parsed.action === 'accept' || parsed.action === 'decline') {
    if (interaction.user.id !== parsed.targetDiscordUserId) {
      await interaction.reply({
        ephemeral: true,
        content: 'Only the challenged player can use this duel button.',
      });
      return;
    }

    if (parsed.action === 'decline') {
      await interaction.update(buildDeclineCard({
        declinerMention: `<@${interaction.user.id}>`,
      }));
      return;
    }

    await acceptDuel(interaction, api, parsed.duelId);
    return;
  }

  if (parsed.action === 'replay') {
    await showReplay(interaction, api, parsed.duelId, parsed.page);
    return;
  }

  if (parsed.action === 'builds') {
    await interaction.reply({
      ephemeral: true,
      content: 'Build previews are not available for friendly simulations yet.',
    });
    return;
  }

  await interaction.reply({
    ephemeral: true,
    content: 'Use /duel to start a rematch for now.',
  });
}

async function acceptDuel(
  interaction: ButtonInteraction,
  api: Pick<PocketRealmApiClient, 'post'>,
  duelId: string,
): Promise<void> {
  await interaction.deferUpdate();

  let response: DuelResultResponse;
  try {
    response = await api.post<DuelResultResponse>(`/api/v1/discord/duels/${encodeURIComponent(duelId)}/resolve`, {
      acceptedByDiscordUserId: interaction.user.id,
    });
  } catch (error) {
    await interaction.followUp({
      ephemeral: true,
      content: resolveDuelErrorCopy(error),
    });
    return;
  }

  await interaction.editReply(buildResultCard(response.duel));
}

async function showReplay(
  interaction: ButtonInteraction,
  api: Pick<PocketRealmApiClient, 'get'>,
  duelId: string,
  page: number,
): Promise<void> {
  await interaction.deferUpdate();

  try {
    const response = await api.get<DuelReplayResponse>(
      `/api/v1/discord/duels/${encodeURIComponent(duelId)}/replay?page=${page}`,
    );
    await interaction.editReply(buildReplayCard(response.replay));
  } catch {
    await sendReplayLoadError(interaction);
  }
}

async function sendReplayLoadError(interaction: ButtonInteraction): Promise<void> {
  try {
    await interaction.followUp({
      ephemeral: true,
      content: 'Unable to load the friendly simulation replay right now.',
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

function createDuelErrorCopy(error: unknown): string {
  if (error instanceof PocketRealmApiError) {
    if (
      error.code === 'DISCORD_LINK_REQUIRED'
      || error.code === 'DISCORD_DUEL_CHALLENGER_LINK_REQUIRED'
      || error.code === 'DISCORD_DUEL_TARGET_LINK_REQUIRED'
    ) {
      return 'Both players need linked PocketRealm accounts before dueling.';
    }

    if (
      error.code === 'DISCORD_PLAYER_NOT_FOUND'
      || error.code === 'DISCORD_DUEL_CHALLENGER_PLAYER_NOT_FOUND'
      || error.code === 'DISCORD_DUEL_TARGET_PLAYER_NOT_FOUND'
    ) {
      return 'Both players need active PocketRealm characters before dueling.';
    }

    if (error.code === 'DISCORD_SELF_CHALLENGE' || error.code === 'DISCORD_DUEL_SELF_CHALLENGE') {
      return 'Challenge another player, not yourself.';
    }
  }

  return 'Unable to create a friendly duel right now. Please try again later.';
}

function resolveDuelErrorCopy(error: unknown): string {
  if (error instanceof PocketRealmApiError) {
    if (
      error.code === 'DISCORD_LINK_REQUIRED'
      || error.code === 'DISCORD_DUEL_CHALLENGER_LINK_REQUIRED'
      || error.code === 'DISCORD_DUEL_TARGET_LINK_REQUIRED'
    ) {
      return 'Link your PocketRealm account first with /link.';
    }

    if (
      error.status === 404
      || error.status === 409
      || error.status === 410
      || error.code === 'DISCORD_DUEL_EXPIRED'
      || error.code === 'DISCORD_DUEL_NOT_PENDING'
      || error.code === 'DISCORD_DUEL_NOT_FOUND'
    ) {
      return 'That friendly duel is no longer available. Start a new /duel.';
    }
  }

  return 'Unable to resolve that friendly duel right now. Please try again later.';
}
