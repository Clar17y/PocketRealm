import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import type { MessageMentionOptions } from 'discord.js';

import {
  compactStrings,
  formatPercent,
  isRecord,
  readNumber,
  readString,
  truncateText,
} from '../utils.js';
import {
  duelAcceptButtonId,
  duelBuildsButtonId,
  duelDeclineButtonId,
  duelRematchButtonId,
  duelReplayButtonId,
} from './components.js';
import {
  DEFAULT_DUEL_ACTION_ICONS,
  DEFAULT_DUEL_EMOJI,
  DEFAULT_DUEL_RESULT_ICONS,
  renderResourceBar,
  roundResourceValue,
  type DuelActionIcons,
  type DuelBarStyle,
  type DuelEmojiSet,
} from './duelEmoji.js';

const MAX_REPLAY_ENTRY_LENGTH = 240;
// Components V2 caps total text at 4000 chars across a message. Custom-emoji
// bars are ~30 chars per cell, so a full fighter block alone is ~2000 chars;
// this budget (header + fighters + log) stays under 4000 with a safety margin
// while still leaving ample room for the action log.
const MAX_REPLAY_CONTENT_LENGTH = 3_800;

const ACCENT_COLOR = {
  challenge: 0xd4af37,
  decline: 0xc0392b,
  result: 0xf1c40f,
  replay: 0x3b82f6,
} as const;

/** A Components V2 message payload, usable by send/update/editReply. */
export interface DuelCardPayload {
  flags: MessageFlags.IsComponentsV2;
  components: ContainerBuilder[];
  allowedMentions?: MessageMentionOptions;
}

// Cards that are not a fresh challenge must never ping: usernames are
// interpolated into text, so suppress all mention parsing defensively.
const SUPPRESS_MENTIONS: MessageMentionOptions = { parse: [] };

function v2Card(
  container: ContainerBuilder,
  allowedMentions: MessageMentionOptions = SUPPRESS_MENTIONS,
): DuelCardPayload {
  return { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions };
}

export interface DuelResultData {
  id: string;
  challengerUsername: string;
  targetUsername: string;
  winnerUsername: string | null;
  isDraw: boolean;
  summary: unknown;
}

export interface DuelReplayData {
  id: string;
  status: string;
  page: number;
  pageSize: number;
  hasMore: boolean;
  summary: unknown;
  entries: unknown[];
}

export function buildChallengeCard(input: {
  duelId: string;
  challengerMention: string;
  opponentMention: string;
  opponentDiscordUserId: string;
}): DuelCardPayload {
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR.challenge)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `⚔️ **Friendly Simulation Challenge**\n${input.opponentMention}, ${input.challengerMention} challenged you to a friendly simulation.`,
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(duelAcceptButtonId(input.duelId, input.opponentDiscordUserId))
          .setLabel('Accept')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(duelDeclineButtonId(input.duelId, input.opponentDiscordUserId))
          .setLabel('Decline')
          .setStyle(ButtonStyle.Secondary),
      ),
    );

  return v2Card(container, { users: [input.opponentDiscordUserId] });
}

export function buildDeclineCard(input: { declinerMention: string }): DuelCardPayload {
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR.decline)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`🚫 Friendly simulation declined by ${input.declinerMention}.`),
    );

  return v2Card(container);
}

export function buildResultCard(duel: DuelResultData): DuelCardPayload {
  const icons = DEFAULT_DUEL_RESULT_ICONS;
  const scoreboard = duel.isDraw
    ? [
      `${icons.draw} **${duel.challengerUsername}**`,
      `${icons.draw} **${duel.targetUsername}**`,
    ]
    : compactStrings([
      `${icons.victory} **${duel.winnerUsername ?? 'A player'}**`,
      loserName(duel) !== null ? `${icons.loss} ${loserName(duel)}` : null,
    ]);
  const summary = formatSummary(duel.summary);
  const lines = compactStrings(['⚔️ **Friendly Simulation Complete**', ...scoreboard, summary]);

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR.result)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
    .addActionRowComponents(buildResultRow(duel.id));

  return v2Card(container);
}

/** The non-winning fighter on a decisive result, or null if it can't be told. */
function loserName(duel: DuelResultData): string | null {
  if (duel.winnerUsername === duel.challengerUsername) {
    return duel.targetUsername;
  }
  if (duel.winnerUsername === duel.targetUsername) {
    return duel.challengerUsername;
  }
  return null;
}

export function buildReplayCard(
  replay: DuelReplayData,
  emoji: DuelEmojiSet = DEFAULT_DUEL_EMOJI,
): DuelCardPayload {
  const entries = replay.entries
    .slice(0, replay.pageSize)
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !isRedundantRegenEntry(entry));

  const header = `🎬 **Friendly Simulation — Replay** · Page ${replay.page}`;
  const container = new ContainerBuilder().setAccentColor(ACCENT_COLOR.replay);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(header));

  if (entries.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('No replay entries are available.'),
    );
    // Keep pagination so an all-filtered page can never strand the viewer.
    const emptyRow = buildReplayRow(replay);
    if (emptyRow) {
      container.addActionRowComponents(emptyRow);
    }
    return v2Card(container);
  }

  const fighters = formatFighterResources(entries[entries.length - 1]?.entry, replay.summary, emoji);
  let usedLength = header.length;
  if (fighters) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(fighters));
    container.addSeparatorComponents(new SeparatorBuilder());
    usedLength += fighters.length;
  }

  const logLines: string[] = [];
  for (const { entry, index } of entries) {
    const replayIndex = (replay.page - 1) * replay.pageSize + index + 1;
    const ko = isKnockout(entry) ? ` ${DEFAULT_DUEL_ACTION_ICONS.ko}` : '';
    const line = `${actionIcon(entry)} **#${replayIndex}** ${formatReplayEntry(entry)}${ko}`;
    if (usedLength + line.length > MAX_REPLAY_CONTENT_LENGTH) {
      logLines.push('_Replay page truncated for Discord._');
      break;
    }

    logLines.push(line);
    usedLength += line.length;
  }
  if (replay.hasMore) {
    logLines.push('_More replay pages are available._');
  }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(logLines.join('\n')));

  const row = buildReplayRow(replay);
  if (row) {
    container.addActionRowComponents(row);
  }

  return v2Card(container);
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

function buildReplayRow(replay: DuelReplayData): ActionRowBuilder<ButtonBuilder> | null {
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
    return null;
  }

  return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
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

  const effectNames = entry.effectsApplied.map((effect) => {
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

function formatFighterResources(entry: unknown, summary: unknown, emoji: DuelEmojiSet): string | null {
  if (!isRecord(entry)) {
    return null;
  }

  const summaryRecord = isRecord(summary) ? summary : {};
  const challengerName = readString(summaryRecord, 'challengerUsername') ?? 'Challenger';
  const targetName = readString(summaryRecord, 'targetUsername') ?? 'Target';

  const challengerBlock = formatFighterBlock(challengerName, {
    hp: readNumber(entry, 'combatantAHpAfter'),
    maxHp: readNumber(summaryRecord, 'challengerMaxHp'),
    mana: readNumber(entry, 'combatantAManaAfter'),
    maxMana: readNumber(summaryRecord, 'challengerMaxMana'),
    stamina: readNumber(entry, 'combatantAStaminaAfter'),
    maxStamina: readNumber(summaryRecord, 'challengerMaxStamina'),
  }, emoji);
  const targetBlock = formatFighterBlock(targetName, {
    hp: readNumber(entry, 'combatantBHpAfter'),
    maxHp: readNumber(summaryRecord, 'targetMaxHp'),
    mana: readNumber(entry, 'combatantBManaAfter'),
    maxMana: readNumber(summaryRecord, 'targetMaxMana'),
    stamina: readNumber(entry, 'combatantBStaminaAfter'),
    maxStamina: readNumber(summaryRecord, 'targetMaxStamina'),
  }, emoji);

  const blocks = compactStrings([challengerBlock, targetBlock]);
  return blocks.length > 0 ? blocks.join('\n\n') : null;
}

function formatFighterBlock(
  name: string,
  resources: {
    hp: number | null;
    maxHp: number | null;
    mana: number | null;
    maxMana: number | null;
    stamina: number | null;
    maxStamina: number | null;
  },
  emoji: DuelEmojiSet,
): string | null {
  const meters = compactStrings([
    formatMeter('❤️', resources.hp, resources.maxHp, emoji.hp),
    formatMeter('🔷', resources.mana, resources.maxMana, emoji.mp),
    formatMeter('⚡', resources.stamina, resources.maxStamina, emoji.sta),
  ]);

  return meters.length > 0 ? `**${name}**\n${meters.join('\n')}` : null;
}

function formatMeter(
  icon: string,
  current: number | null,
  max: number | null,
  style: DuelBarStyle,
): string | null {
  if (current === null) {
    return null;
  }

  const value = roundResourceValue(current);
  if (max === null || max <= 0) {
    return `${icon} ${value}`;
  }

  return `${icon} ${renderResourceBar(current, max, style)} ${value}/${max}`;
}

/** Pick the leading log-line icon for an entry, by action kind. */
export function actionIcon(
  entry: unknown,
  icons: DuelActionIcons = DEFAULT_DUEL_ACTION_ICONS,
): string {
  return icons[classifyActionKind(entry)];
}

function classifyActionKind(entry: unknown): keyof DuelActionIcons {
  if (!isRecord(entry)) {
    return 'physical';
  }

  const action = typeof entry.action === 'string' ? entry.action : null;

  if (readNumber(entry, 'healAmount') !== null || action === 'heal') {
    const resource = entry.healResourceType;
    if (resource === 'stamina') return 'heal_sta';
    if (resource === 'mana') return 'heal_mp';
    return 'heal_hp';
  }
  if (action === 'defend' || entry.forcedActionReason === 'pinned') {
    return 'defend';
  }
  if (action === 'counter') {
    return 'counter';
  }
  if (action === 'ward') {
    return 'ward';
  }
  if (action === 'potion') {
    return 'potion';
  }
  if (action === 'cleanse') {
    return 'cleanse';
  }
  if (entry.isCritical === true) {
    return 'crit';
  }
  if (action === 'attack' && isMiss(entry)) {
    return 'miss';
  }
  if (isMagicAction(entry, action)) {
    return 'magic';
  }

  return 'physical';
}

function isMagicAction(entry: Record<string, unknown>, action: string | null): boolean {
  if (action === 'spell') {
    return true;
  }
  if (typeof entry.spellName === 'string') {
    return true;
  }
  // Damage resolution records magic defence only for magic hits, physical
  // defence only for physical hits — use that to tell the two apart.
  return readNumber(entry, 'targetMagicDefence') !== null && readNumber(entry, 'targetDefence') === null;
}

function isMiss(entry: Record<string, unknown>): boolean {
  const hitChance = readNumber(entry, 'hitChance');
  const hitRollValue = readNumber(entry, 'hitRollValue');
  return hitChance !== null && hitRollValue !== null && hitRollValue >= hitChance;
}

/** True when this entry brings either fighter to 0 HP (a knockout blow). */
export function isKnockout(entry: unknown): boolean {
  if (!isRecord(entry)) {
    return false;
  }

  return readNumber(entry, 'combatantAHpAfter') === 0 || readNumber(entry, 'combatantBHpAfter') === 0;
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
