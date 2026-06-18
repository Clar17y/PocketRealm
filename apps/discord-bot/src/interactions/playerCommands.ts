import type { ChatInputCommandInteraction } from 'discord.js';

import { PocketRealmApiError } from '../api/pocketRealmApi.js';
import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
import type { DiscordEmojiMap } from '../discord/emojis.js';
import { statusCard, textCard, type V2CardPayload } from '../discord/v2Card.js';
import { INVALID_RANK_CATEGORY_COPY, resolveRankCategory } from '../rankCategories.js';
import { formatDiscordTimestamp } from '../utils.js';

interface ProfileResponse {
  profile: {
    username: string;
    characterLevel: number;
    activeTitle?: string;
    realmLabel?: string;
  };
}

interface TurnsResponse {
  turns: {
    currentTurns: number;
    timeToCapMs?: number;
    lastRegenAt?: string;
  };
}

interface SkillsResponse {
  skills: Array<{
    skillType: string;
    level: number;
    xp: number;
  }>;
}

interface RankResponse {
  rank: {
    category: string;
    rank: number | null;
    score: number | null;
    totalPlayers?: number;
    lastRefreshedAt?: string;
  };
}

type PlayerApiClient = Pick<PocketRealmApiClient, 'get'>;
type PlayerCommandConfig = Pick<BotConfig, 'guildId' | 'emojiMap'>;

const LINK_SELF_COPY = 'Link your PocketRealm account first with /link.';
const LINK_OTHER_COPY = 'That Discord user needs to link their PocketRealm account with /link first.';
const PLAYER_NOT_FOUND_COPY = 'Linked PocketRealm account has no active player.';

export async function handleProfileCommand(
  interaction: ChatInputCommandInteraction,
  api: PlayerApiClient,
  config: PlayerCommandConfig,
): Promise<void> {
  const selectedUser = interaction.options.getUser('user');
  const targetUser = selectedUser ?? interaction.user;
  const isSelectedUser = Boolean(selectedUser);

  await interaction.deferReply({ ephemeral: true });

  let response: ProfileResponse;
  try {
    response = await api.get<ProfileResponse>(playerPath(targetUser.id, 'profile', config.guildId));
  } catch (error) {
    await editPlayerErrorReply(interaction, error, isSelectedUser, config.emojiMap);
    return;
  }

  await interaction.editReply(buildProfileCard(response.profile, config.emojiMap));
}

export async function handleTurnsCommand(
  interaction: ChatInputCommandInteraction,
  api: PlayerApiClient,
  config: PlayerCommandConfig,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  let response: TurnsResponse;
  try {
    response = await api.get<TurnsResponse>(playerPath(interaction.user.id, 'turns', config.guildId));
  } catch (error) {
    await editPlayerErrorReply(interaction, error, false, config.emojiMap);
    return;
  }

  await interaction.editReply(buildTurnsCard(response.turns, config.emojiMap));
}

export async function handleSkillsCommand(
  interaction: ChatInputCommandInteraction,
  api: PlayerApiClient,
  config: PlayerCommandConfig,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  let response: SkillsResponse;
  try {
    response = await api.get<SkillsResponse>(playerPath(interaction.user.id, 'skills', config.guildId));
  } catch (error) {
    await editPlayerErrorReply(interaction, error, false, config.emojiMap);
    return;
  }

  await interaction.editReply(buildSkillsCard(response.skills, config.emojiMap));
}

export async function handleRankCommand(
  interaction: ChatInputCommandInteraction,
  api: PlayerApiClient,
  config: PlayerCommandConfig,
): Promise<void> {
  const rawCategory = interaction.options.getString('category', true);
  const category = resolveRankCategory(rawCategory);

  await interaction.deferReply({ ephemeral: true });

  if (!category) {
    await interaction.editReply(statusCard('warning', 'Unknown rank', INVALID_RANK_CATEGORY_COPY, config.emojiMap));
    return;
  }

  let response: RankResponse;
  try {
    response = await api.get<RankResponse>(
      `/api/v1/discord/users/${encodeURIComponent(interaction.user.id)}/rank/${encodeURIComponent(category)}?guildId=${encodeURIComponent(config.guildId)}`,
    );
  } catch (error) {
    await editPlayerErrorReply(interaction, error, false, config.emojiMap);
    return;
  }

  await interaction.editReply(buildRankCard(response.rank, config.emojiMap));
}

function playerPath(discordUserId: string, resource: string, guildId: string): string {
  return `/api/v1/discord/users/${encodeURIComponent(discordUserId)}/${resource}?guildId=${encodeURIComponent(guildId)}`;
}

async function editPlayerErrorReply(
  interaction: ChatInputCommandInteraction,
  error: unknown,
  isSelectedUser: boolean,
  emojiMap: DiscordEmojiMap,
): Promise<void> {
  if (isUnlinkedError(error)) {
    await interaction.editReply(
      statusCard('warning', 'Link required', isSelectedUser ? LINK_OTHER_COPY : LINK_SELF_COPY, emojiMap),
    );
    return;
  }

  if (isPlayerNotFoundError(error)) {
    await interaction.editReply(statusCard('warning', 'Character missing', PLAYER_NOT_FOUND_COPY, emojiMap));
    return;
  }

  if (isInvalidCategoryError(error)) {
    await interaction.editReply(statusCard('warning', 'Unknown rank', INVALID_RANK_CATEGORY_COPY, emojiMap));
    return;
  }

  await interaction.editReply(
    statusCard(
      'error',
      'Player data unavailable',
      'Unable to load PocketRealm player data right now. Please try again later.',
      emojiMap,
    ),
  );
}

function isUnlinkedError(error: unknown): boolean {
  return error instanceof PocketRealmApiError
    && error.code === 'DISCORD_LINK_REQUIRED';
}

function isPlayerNotFoundError(error: unknown): boolean {
  return error instanceof PocketRealmApiError
    && error.code === 'DISCORD_PLAYER_NOT_FOUND';
}

function isInvalidCategoryError(error: unknown): boolean {
  return error instanceof PocketRealmApiError
    && error.code === 'INVALID_CATEGORY';
}

function buildProfileCard(profile: ProfileResponse['profile'], emojiMap: DiscordEmojiMap): V2CardPayload {
  const details = [
    `Level ${profile.characterLevel}`,
    profile.activeTitle,
    profile.realmLabel,
  ].filter((value): value is string => Boolean(value));

  return textCard({
    emojiKey: 'profile',
    title: profile.username,
    emojiMap,
    lines: [details.join(' | ')],
  });
}

function buildTurnsCard(turns: TurnsResponse['turns'], emojiMap: DiscordEmojiMap): V2CardPayload {
  const lines = [`${turns.currentTurns} turns available.`];

  if (typeof turns.timeToCapMs === 'number') {
    lines.push(`Time to cap: ${formatDuration(turns.timeToCapMs)}.`);
  }

  if (turns.lastRegenAt) {
    lines.push(`Last regenerated: ${formatDiscordTimestamp(turns.lastRegenAt, 'R', 'unknown')}.`);
  }

  return textCard({
    emojiKey: 'turns',
    title: 'Turns',
    emojiMap,
    lines,
  });
}

function buildSkillsCard(skills: SkillsResponse['skills'], emojiMap: DiscordEmojiMap): V2CardPayload {
  if (skills.length === 0) {
    return statusCard('info', 'Skills', 'No PocketRealm skills found yet.', emojiMap);
  }

  return textCard({
    emojiKey: 'skills',
    title: 'Skills',
    emojiMap,
    lines: skills.map((skill) => `${formatLabel(skill.skillType)} Lv ${skill.level} (${skill.xp} XP)`),
  });
}

function buildRankCard(rank: RankResponse['rank'], emojiMap: DiscordEmojiMap): V2CardPayload {
  const lines: string[] = [];

  if (rank.rank === null) {
    lines.push('Rank: Unranked');
  } else {
    lines.push(`Rank: #${rank.rank}${rank.totalPlayers ? ` of ${rank.totalPlayers}` : ''}`);
  }

  if (rank.score !== null) {
    lines.push(`Score: ${rank.score}`);
  }

  if (rank.lastRefreshedAt) {
    lines.push(`Updated: ${formatDiscordTimestamp(rank.lastRefreshedAt, 'R', 'unknown')}`);
  }

  return textCard({
    emojiKey: 'victory',
    title: `${formatLabel(rank.category)} Rank`,
    emojiMap,
    lines,
  });
}

function formatLabel(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
