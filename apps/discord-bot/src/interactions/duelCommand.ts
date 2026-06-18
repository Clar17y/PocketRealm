import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
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
import type { DiscordEmojiMap } from '../discord/emojis.js';
import { botHeadline, botStatus, compactLines } from '../discord/messageFormat.js';
import {
  compactStrings,
  formatPercent,
  isRecord,
  readNumber,
  readString,
  truncateText,
} from '../utils.js';

type DuelApiClient = Pick<PocketRealmApiClient, 'get' | 'post'>;
type DuelCommandConfig = Pick<BotConfig, 'duelsChannelId' | 'emojiMap'>;
type DuelButtonConfig = Pick<BotConfig, 'emojiMap'>;

const MAX_REPLAY_CONTENT_LENGTH = 1_800;
const MAX_REPLAY_ENTRY_LENGTH = 240;
const REPLAY_HAS_MORE_COPY = 'More replay pages are available.';
const REPLAY_TRUNCATED_COPY = 'Replay page truncated for Discord.';

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
      content: botStatus('warning', 'Wrong channel', `Use /duel in <#${config.duelsChannelId}>.`, config.emojiMap),
    });
    return;
  }

  if (!interaction.guildId) {
    await interaction.reply({
      ephemeral: true,
      content: botStatus('warning', 'Server only', '/duel only works in the PocketRealm Discord server.', config.emojiMap),
    });
    return;
  }

  const opponent = interaction.options.getUser('opponent', true);
  if (opponent.id === interaction.user.id) {
    await interaction.reply({
      ephemeral: true,
      content: botStatus('warning', 'Choose an opponent', 'Challenge another player, not yourself.', config.emojiMap),
    });
    return;
  }

  if (opponent.bot) {
    await interaction.reply({
      ephemeral: true,
      content: botStatus('warning', 'Choose a player', 'Challenge a player, not a bot.', config.emojiMap),
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
      content: formatDuelPostFailure(
        'Could not post the public duel challenge. Make sure the bot can send messages in this channel, then run /duel again.',
        config.emojiMap,
      ),
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
      content: createDuelErrorCopy(error, config.emojiMap),
    });
    return;
  }

  let replyResult: unknown;
  try {
    replyResult = await channel.send({
      content: [
        botHeadline('duel', 'Friendly simulation challenge', config.emojiMap),
        `<@${opponent.id}>, ${interaction.user} challenged you to a friendly simulation.`,
      ].join('\n'),
      components: [buildChallengeRow(response.duel.id, opponent.id)],
    });
  } catch {
    await interaction.editReply({
      content: formatDuelPostFailure(
        'Could not post the public duel challenge. Please run /duel again.',
        config.emojiMap,
      ),
    });
    return;
  }

  await interaction.editReply({
    content: botStatus('success', 'Posted', 'Friendly simulation challenge posted.', config.emojiMap),
  });
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
        ephemeral: true,
        content: botStatus(
          'warning',
          'Wrong player',
          'Only the challenged player can use this duel button.',
          config.emojiMap,
        ),
      });
      return;
    }

    if (parsed.action === 'decline') {
      await interaction.update({
        content: botStatus(
          'warning',
          'Declined',
          `Friendly simulation declined by <@${interaction.user.id}>.`,
          config.emojiMap,
        ),
        components: [],
      });
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
      ephemeral: true,
      content: botStatus(
        'info',
        'Builds unavailable',
        'Build previews are not available for friendly simulations yet.',
        config.emojiMap,
      ),
    });
    return;
  }

  await interaction.reply({
    ephemeral: true,
    content: botStatus('info', 'Rematch', 'Use /duel to start a rematch for now.', config.emojiMap),
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
  emojiMap: DiscordEmojiMap,
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
      content: resolveDuelErrorCopy(error, emojiMap),
    });
    return;
  }

  await interaction.editReply(buildDuelResultMessage(response, emojiMap));
}

function buildDuelResultMessage(
  response: DuelResultResponse,
  emojiMap: DiscordEmojiMap,
): InteractionUpdateOptions {
  const duel = response.duel;
  const outcome = duel.isDraw
    ? `${duel.challengerUsername} and ${duel.targetUsername} fought to a draw.`
    : `${duel.winnerUsername ?? 'A player'} won the simulation.`;
  const summary = formatSummary(duel.summary);

  return {
    content: compactLines([
      botHeadline(duel.isDraw ? 'duel' : 'victory', 'Friendly simulation complete', emojiMap),
      outcome,
      summary,
    ]),
    components: [buildResultRow(duel.id)],
  };
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
    await interaction.editReply({
      content: formatReplay(response.replay, emojiMap),
      components: buildReplayRows(response.replay),
    });
  } catch {
    await sendReplayLoadError(interaction, emojiMap);
  }
}

async function sendReplayLoadError(interaction: ButtonInteraction, emojiMap: DiscordEmojiMap): Promise<void> {
  try {
    await interaction.followUp({
      ephemeral: true,
      content: botStatus(
        'error',
        'Replay unavailable',
        'Unable to load the friendly simulation replay right now.',
        emojiMap,
      ),
    });
  } catch {
    // The public duel message is already preserved; there is no safe fallback if follow-up delivery fails.
  }
}

function formatReplay(replay: DuelReplayResponse['replay'], emojiMap: DiscordEmojiMap): string {
  const header = botHeadline('duel', `Friendly simulation replay - page ${replay.page}`, emojiMap);
  const entries = replay.entries
    .slice(0, replay.pageSize)
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !isRedundantRegenEntry(entry));
  if (entries.length === 0) {
    return compactLines([header, 'No replay entries are available.']);
  }

  const lines: string[] = [];
  const reservedTailLines = replay.hasMore ? [REPLAY_HAS_MORE_COPY] : [];
  const resourceLines = formatReplayResourceLines(entries[entries.length - 1]?.entry, replay.summary);
  lines.push(...resourceLines);
  if (resourceLines.length > 0) {
    lines.push('');
  }

  for (const { entry, index } of entries) {
    const replayIndex = (replay.page - 1) * replay.pageSize + index + 1;
    const line = `#${replayIndex} ${formatReplayEntry(entry)}`;
    if (!fitsReplayContent(header, [...lines, line, ...reservedTailLines])) {
      while (
        lines.length > 0
        && !fitsReplayContent(header, [...lines, REPLAY_TRUNCATED_COPY, ...reservedTailLines])
      ) {
        lines.pop();
      }

      if (fitsReplayContent(header, [...lines, REPLAY_TRUNCATED_COPY, ...reservedTailLines])) {
        lines.push(REPLAY_TRUNCATED_COPY);
      }
      break;
    }

    lines.push(line);
  }
  if (replay.hasMore) {
    lines.push(REPLAY_HAS_MORE_COPY);
  }

  return formatReplayContent(header, lines);
}

function fitsReplayContent(header: string, lines: string[]): boolean {
  return formatReplayContent(header, lines).length <= MAX_REPLAY_CONTENT_LENGTH;
}

function formatReplayContent(header: string, lines: string[]): string {
  return `${header}\n${lines.join('\n')}`;
}

function buildReplayRows(replay: DuelReplayResponse['replay']): ActionRowBuilder<ButtonBuilder>[] {
  const buttons: ButtonBuilder[] = [];

  if (replay.page > 1) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(duelReplayButtonId(replay.id, replay.page - 1))
        .setLabel('Previous Replay Page')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  if (replay.hasMore) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(duelReplayButtonId(replay.id, replay.page + 1))
        .setLabel('Next Replay Page')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  if (buttons.length === 0) {
    return [];
  }

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
  ];
}

function formatSummary(summary: unknown): string | null {
  if (typeof summary === 'string') {
    return summary.trim() || null;
  }

  if (!isRecord(summary)) {
    return null;
  }

  const parts = compactStrings([
    typeof summary.totalRounds === 'number' ? `${summary.totalRounds} rounds` : null,
    typeof summary.challengerHpRemaining === 'number' ? `${summary.challengerHpRemaining} challenger HP left` : null,
    typeof summary.targetHpRemaining === 'number' ? `${summary.targetHpRemaining} target HP left` : null,
  ]);

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
  const structured = formatStructuredReplayEntry(entry);
  if (structured) {
    return truncateText(structured, MAX_REPLAY_ENTRY_LENGTH);
  }

  if (message) {
    return truncateText(message, MAX_REPLAY_ENTRY_LENGTH);
  }

  const round = typeof entry.round === 'number' ? `Round ${entry.round}` : null;
  const actionName = typeof entry.actionName === 'string' ? entry.actionName : null;
  const damage = typeof entry.damageDealt === 'number' ? `${entry.damageDealt} damage` : null;
  const parts = compactStrings([round, actionName, damage]);

  return parts.length > 0 ? parts.join(' · ') : 'Replay event details unavailable.';
}

function formatStructuredReplayEntry(entry: Record<string, unknown>): string | null {
  const round = typeof entry.round === 'number' ? `R${entry.round}` : null;
  const actorName = typeof entry.actorName === 'string' ? entry.actorName : null;
  const actionName = typeof entry.actionName === 'string'
    ? entry.actionName
    : typeof entry.spellName === 'string'
      ? entry.spellName
      : null;

  if (!round && !actorName && !actionName) {
    return null;
  }

  const damage = readNumber(entry, 'damage') ?? readNumber(entry, 'damageDealt');
  const healAmount = readNumber(entry, 'healAmount');
  const outcomeParts = compactStrings([
    damage !== null ? `${damage} damage` : null,
    healAmount !== null ? `+${healAmount} HP` : null,
    formatHitBreakdown(entry),
    entry.isCritical === true ? 'CRIT' : null,
    formatForcedAction(entry),
    formatEffectsApplied(entry),
  ]);

  const label = compactStrings([round, actorName, actionName]).join(' ');
  return outcomeParts.length > 0 ? `${label}: ${outcomeParts.join(' ')}` : null;
}

function formatForcedAction(entry: Record<string, unknown>): string | null {
  return entry.forcedActionReason === 'pinned' ? 'Pinned -> Defend' : null;
}

function formatEffectsApplied(entry: Record<string, unknown>): string | null {
  if (!Array.isArray(entry.effectsApplied) || entry.effectsApplied.length === 0) {
    return null;
  }

  const effectNames = entry.effectsApplied
    .map((effect) => {
      if (!isRecord(effect)) return null;
      return typeof effect.stat === 'string' ? effect.stat : null;
    });
  const displayNames = compactStrings(effectNames);

  return displayNames.length > 0 ? `applies ${displayNames.join(', ')}` : null;
}

function formatHitBreakdown(entry: Record<string, unknown>): string | null {
  const hitChance = readNumber(entry, 'hitChance');
  const hitRollValue = readNumber(entry, 'hitRollValue');
  const attackerHitScore = readNumber(entry, 'attackerHitScore');
  const defenderAvoidScore = readNumber(entry, 'defenderAvoidScore');
  if (
    hitChance === null
    || hitRollValue === null
    || attackerHitScore === null
    || defenderAvoidScore === null
  ) {
    return null;
  }

  const result = hitRollValue < hitChance ? 'HIT' : 'MISS';
  return `${result} ${formatPercent(hitChance)} (roll ${formatPercent(hitRollValue)}, ${attackerHitScore} hit vs ${defenderAvoidScore} avoid)`;
}

function formatReplayResourceLines(entry: unknown, summary: unknown): string[] {
  if (!isRecord(entry)) {
    return [];
  }

  const summaryRecord = isRecord(summary) ? summary : {};
  const challengerName = readString(summaryRecord, 'challengerUsername') ?? 'Challenger';
  const targetName = readString(summaryRecord, 'targetUsername') ?? 'Target';
  const challengerLine = formatFighterResources(challengerName, {
    hp: readNumber(entry, 'combatantAHpAfter'),
    maxHp: readNumber(summaryRecord, 'challengerMaxHp'),
    mana: readNumber(entry, 'combatantAManaAfter'),
    maxMana: readNumber(summaryRecord, 'challengerMaxMana'),
    stamina: readNumber(entry, 'combatantAStaminaAfter'),
    maxStamina: readNumber(summaryRecord, 'challengerMaxStamina'),
  });
  const targetLine = formatFighterResources(targetName, {
    hp: readNumber(entry, 'combatantBHpAfter'),
    maxHp: readNumber(summaryRecord, 'targetMaxHp'),
    mana: readNumber(entry, 'combatantBManaAfter'),
    maxMana: readNumber(summaryRecord, 'targetMaxMana'),
    stamina: readNumber(entry, 'combatantBStaminaAfter'),
    maxStamina: readNumber(summaryRecord, 'targetMaxStamina'),
  });

  return compactStrings([challengerLine, targetLine]);
}

function formatFighterResources(
  name: string,
  resources: {
    hp: number | null;
    maxHp: number | null;
    mana: number | null;
    maxMana: number | null;
    stamina: number | null;
    maxStamina: number | null;
  },
): string | null {
  const parts = compactStrings([
    formatMeter('HP', resources.hp, resources.maxHp),
    formatMeter('MP', resources.mana, resources.maxMana),
    formatMeter('STA', resources.stamina, resources.maxStamina),
  ]);

  return parts.length > 0 ? `${name} ${parts.join(' ')}` : null;
}

function formatMeter(label: string, current: number | null, max: number | null): string | null {
  if (current === null) {
    return null;
  }

  if (max === null || max <= 0) {
    return `${label} ${current}`;
  }

  return `${label} [${formatBar(current, max)}] ${current}/${max}`;
}

function formatBar(current: number, max: number): string {
  const width = 10;
  const filled = Math.max(0, Math.min(width, Math.round((current / max) * width)));
  return `${'#'.repeat(filled)}${'-'.repeat(width - filled)}`;
}

function isRedundantRegenEntry(entry: unknown): boolean {
  if (!isRecord(entry)) {
    return false;
  }

  const hasEffects = Array.isArray(entry.effectsApplied) && entry.effectsApplied.length > 0;
  return entry.action === 'regen'
    && readNumber(entry, 'damage') === null
    && readNumber(entry, 'healAmount') === null
    && !hasEffects;
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

function formatDuelPostFailure(detail: string, emojiMap: DiscordEmojiMap): string {
  return botStatus('warning', 'Post failed', detail, emojiMap);
}

function createDuelErrorCopy(error: unknown, emojiMap: DiscordEmojiMap): string {
  if (error instanceof PocketRealmApiError) {
    if (
      error.code === 'DISCORD_LINK_REQUIRED'
      || error.code === 'DISCORD_DUEL_CHALLENGER_LINK_REQUIRED'
      || error.code === 'DISCORD_DUEL_TARGET_LINK_REQUIRED'
    ) {
      return botStatus(
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
      return botStatus(
        'warning',
        'Character missing',
        'Both players need active PocketRealm characters before dueling.',
        emojiMap,
      );
    }

    if (error.code === 'DISCORD_SELF_CHALLENGE' || error.code === 'DISCORD_DUEL_SELF_CHALLENGE') {
      return botStatus('warning', 'Choose an opponent', 'Challenge another player, not yourself.', emojiMap);
    }
  }

  return botStatus(
    'error',
    'Duel unavailable',
    'Unable to create a friendly duel right now. Please try again later.',
    emojiMap,
  );
}

function resolveDuelErrorCopy(error: unknown, emojiMap: DiscordEmojiMap): string {
  if (error instanceof PocketRealmApiError) {
    if (
      error.code === 'DISCORD_LINK_REQUIRED'
      || error.code === 'DISCORD_DUEL_CHALLENGER_LINK_REQUIRED'
      || error.code === 'DISCORD_DUEL_TARGET_LINK_REQUIRED'
    ) {
      return botStatus('warning', 'Link required', 'Link your PocketRealm account first with /link.', emojiMap);
    }

    if (
      error.status === 404
      || error.status === 409
      || error.status === 410
      || error.code === 'DISCORD_DUEL_EXPIRED'
      || error.code === 'DISCORD_DUEL_NOT_PENDING'
      || error.code === 'DISCORD_DUEL_NOT_FOUND'
    ) {
      return botStatus(
        'warning',
        'Duel unavailable',
        'That friendly duel is no longer available. Start a new /duel.',
        emojiMap,
      );
    }
  }

  return botStatus(
    'error',
    'Duel failed',
    'Unable to resolve that friendly duel right now. Please try again later.',
    emojiMap,
  );
}
