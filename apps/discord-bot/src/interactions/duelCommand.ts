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
import {
  compactStrings,
  formatPercent,
  isRecord,
  readNumber,
  readString,
  truncateText,
} from '../utils.js';

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
    replyResult = await interaction.followUp({
      content: `<@${opponent.id}>, ${interaction.user} challenged you to a friendly simulation.`,
      components: [buildChallengeRow(response.duel.id, opponent.id)],
    });
  } catch {
    await interaction.editReply({
      content: 'Could not post the public duel challenge. Please run /duel again.',
    });
    return;
  }

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
    content: compactStrings([
      `Friendly simulation complete: ${outcome}`,
      summary,
    ]).join('\n'),
    components: [buildResultRow(duel.id)],
  };
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
    await interaction.editReply({
      content: formatReplay(response.replay),
      components: buildReplayRows(response.replay),
    });
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

function formatReplay(replay: DuelReplayResponse['replay']): string {
  const entries = replay.entries
    .slice(0, replay.pageSize)
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !isRedundantRegenEntry(entry));
  if (entries.length === 0) {
    return `Friendly simulation replay page ${replay.page}: no replay entries are available.`;
  }

  const lines: string[] = [];
  const resourceLines = formatReplayResourceLines(entries[entries.length - 1]?.entry, replay.summary);
  lines.push(...resourceLines);
  if (resourceLines.length > 0) {
    lines.push('');
  }

  for (const { entry, index } of entries) {
    const replayIndex = (replay.page - 1) * replay.pageSize + index + 1;
    const line = `#${replayIndex} ${formatReplayEntry(entry)}`;
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
