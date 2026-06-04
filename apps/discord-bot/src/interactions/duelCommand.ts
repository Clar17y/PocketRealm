import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  InteractionUpdateOptions,
} from 'discord.js';

import { PocketRealmApiError } from '../api/pocketRealmApi.js';
import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
import {
  duelAcceptButtonId,
  duelBuildsButtonId,
  duelDeclineButtonId,
  duelRematchButtonId,
  duelReplayButtonId,
  parseDuelButtonId,
} from '../discord/components.js';

type DuelApiClient = Pick<PocketRealmApiClient, 'get' | 'post'>;
type DuelCommandConfig = Pick<BotConfig, 'duelsChannelId'>;

const MAX_REPLAY_CONTENT_LENGTH = 1_800;
const MAX_REPLAY_ENTRY_LENGTH = 240;

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

  const replyResult = await interaction.followUp({
    content: `<@${opponent.id}>, ${interaction.user} challenged you to a friendly simulation.`,
    components: [buildChallengeRow(response.duel.id, opponent.id)],
  });
  await interaction.editReply({ content: 'Friendly simulation challenge posted.' });
  await recordDuelMessage(api, interaction, response.duel.id, replyResult);
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
      await interaction.update({
        content: `Friendly simulation declined by <@${interaction.user.id}>.`,
        components: [],
      });
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

function buildChallengeRow(duelId: string, targetDiscordUserId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(duelAcceptButtonId(duelId, targetDiscordUserId))
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(duelDeclineButtonId(duelId, targetDiscordUserId))
      .setLabel('Decline')
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildResultRow(duelId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(duelReplayButtonId(duelId, 1))
      .setLabel('Show Replay')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(duelBuildsButtonId(duelId))
      .setLabel('Show Builds')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(duelRematchButtonId(duelId))
      .setLabel('Rematch')
      .setStyle(ButtonStyle.Primary),
  );
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

  await interaction.editReply(buildDuelResultMessage(response));
}

function buildDuelResultMessage(response: DuelResultResponse): InteractionUpdateOptions {
  const duel = response.duel;
  const outcome = duel.isDraw
    ? `${duel.challengerUsername} and ${duel.targetUsername} fought to a draw.`
    : `${duel.winnerUsername ?? 'A player'} won the simulation.`;
  const summary = formatSummary(duel.summary);

  return {
    content: [
      `Friendly simulation complete: ${outcome}`,
      summary,
    ].filter((line): line is string => Boolean(line)).join('\n'),
    components: [buildResultRow(duel.id)],
  };
}

async function showReplay(
  interaction: ButtonInteraction,
  api: Pick<PocketRealmApiClient, 'get'>,
  duelId: string,
  page: number,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const response = await api.get<DuelReplayResponse>(
      `/api/v1/discord/duels/${encodeURIComponent(duelId)}/replay?page=${page}`,
    );
    await interaction.editReply({
      content: formatReplay(response.replay),
      components: buildReplayRows(response.replay),
    });
  } catch {
    await interaction.editReply({
      content: 'Unable to load the friendly simulation replay right now.',
    });
  }
}

function formatReplay(replay: DuelReplayResponse['replay']): string {
  const entries = replay.entries.slice(0, replay.pageSize);
  if (entries.length === 0) {
    return `Friendly simulation replay page ${replay.page}: no replay entries are available.`;
  }

  const lines: string[] = [];
  for (const [index, entry] of entries.entries()) {
    const line = `${index + 1}. ${formatReplayEntry(entry)}`;
    if (`Friendly simulation replay page ${replay.page}\n${[...lines, line].join('\n')}`.length > MAX_REPLAY_CONTENT_LENGTH) {
      lines.push('Replay page truncated for Discord.');
      break;
    }

    lines.push(line);
  }
  if (replay.hasMore) {
    lines.push('More replay pages are available.');
  }

  return `Friendly simulation replay page ${replay.page}\n${lines.join('\n')}`;
}

function buildReplayRows(replay: DuelReplayResponse['replay']): ActionRowBuilder<ButtonBuilder>[] {
  if (!replay.hasMore) {
    return [];
  }

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(duelReplayButtonId(replay.id, replay.page + 1))
        .setLabel('Next Replay Page')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function formatSummary(summary: unknown): string | null {
  if (typeof summary === 'string') {
    return summary.trim() || null;
  }

  if (!isRecord(summary)) {
    return null;
  }

  const parts = [
    typeof summary.totalRounds === 'number' ? `${summary.totalRounds} rounds` : null,
    typeof summary.challengerHpRemaining === 'number' ? `${summary.challengerHpRemaining} challenger HP left` : null,
    typeof summary.targetHpRemaining === 'number' ? `${summary.targetHpRemaining} target HP left` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(' · ') : null;
}

function formatReplayEntry(entry: unknown): string {
  if (typeof entry === 'string') {
    return truncateText(entry, MAX_REPLAY_ENTRY_LENGTH);
  }

  if (!isRecord(entry)) {
    return truncateText(JSON.stringify(entry), MAX_REPLAY_ENTRY_LENGTH);
  }

  const message = typeof entry.message === 'string' ? entry.message : null;
  if (message) {
    return truncateText(message, MAX_REPLAY_ENTRY_LENGTH);
  }

  const round = typeof entry.round === 'number' ? `Round ${entry.round}` : null;
  const actionName = typeof entry.actionName === 'string' ? entry.actionName : null;
  const damage = typeof entry.damageDealt === 'number' ? `${entry.damageDealt} damage` : null;
  const parts = [round, actionName, damage].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(' · ') : 'Replay event details unavailable.';
}

async function recordDuelMessage(
  api: Pick<PocketRealmApiClient, 'post'>,
  interaction: ChatInputCommandInteraction,
  duelId: string,
  replyResult: unknown,
): Promise<void> {
  const messageId = readMessageId(replyResult) ?? (await fetchReplyMessageId(interaction));
  if (!messageId) return;

  try {
    await api.post(`/api/v1/discord/duels/${encodeURIComponent(duelId)}/message`, {
      messageId,
    });
  } catch {
    // Message mapping is helpful for later sync, but the public challenge has already succeeded.
  }
}

async function fetchReplyMessageId(interaction: ChatInputCommandInteraction): Promise<string | null> {
  if (typeof interaction.fetchReply !== 'function') {
    return null;
  }

  try {
    return readMessageId(await interaction.fetchReply());
  } catch {
    return null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}
