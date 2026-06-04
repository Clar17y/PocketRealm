import { EmbedBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

import { PocketRealmApiError } from '../api/pocketRealmApi.js';
import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';

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
    rank: number;
    score: number;
    totalPlayers?: number;
    lastRefreshedAt?: string;
  };
}

type PlayerApiClient = Pick<PocketRealmApiClient, 'get'>;
type PlayerCommandConfig = Pick<BotConfig, 'guildId'>;

const LINK_SELF_COPY = 'Link your PocketRealm account first with /link.';
const LINK_OTHER_COPY = 'That Discord user needs to link their PocketRealm account with /link first.';

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
    await editPlayerErrorReply(interaction, error, isSelectedUser);
    return;
  }

  await interaction.editReply({
    embeds: [buildProfileEmbed(response.profile)],
  });
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
    await editPlayerErrorReply(interaction, error, false);
    return;
  }

  await interaction.editReply({
    content: formatTurns(response.turns),
  });
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
    await editPlayerErrorReply(interaction, error, false);
    return;
  }

  await interaction.editReply({
    content: formatSkills(response.skills),
  });
}

export async function handleRankCommand(
  interaction: ChatInputCommandInteraction,
  api: PlayerApiClient,
  config: PlayerCommandConfig,
): Promise<void> {
  const category = interaction.options.getString('category', true);

  await interaction.deferReply({ ephemeral: true });

  let response: RankResponse;
  try {
    response = await api.get<RankResponse>(
      `/api/v1/discord/users/${encodeURIComponent(interaction.user.id)}/rank/${encodeURIComponent(category)}?guildId=${encodeURIComponent(config.guildId)}`,
    );
  } catch (error) {
    await editPlayerErrorReply(interaction, error, false);
    return;
  }

  await interaction.editReply({
    embeds: [buildRankEmbed(response.rank)],
  });
}

function playerPath(discordUserId: string, resource: string, guildId: string): string {
  return `/api/v1/discord/users/${encodeURIComponent(discordUserId)}/${resource}?guildId=${encodeURIComponent(guildId)}`;
}

async function editPlayerErrorReply(
  interaction: ChatInputCommandInteraction,
  error: unknown,
  isSelectedUser: boolean,
): Promise<void> {
  if (isUnlinkedError(error)) {
    await interaction.editReply({
      content: isSelectedUser ? LINK_OTHER_COPY : LINK_SELF_COPY,
    });
    return;
  }

  await interaction.editReply({
    content: 'Unable to load PocketRealm player data right now. Please try again later.',
  });
}

function isUnlinkedError(error: unknown): boolean {
  return error instanceof PocketRealmApiError
    && (error.code === 'DISCORD_LINK_REQUIRED' || error.status === 404);
}

function buildProfileEmbed(profile: ProfileResponse['profile']): EmbedBuilder {
  const details = [
    `Level ${profile.characterLevel}`,
    profile.activeTitle,
    profile.realmLabel,
  ].filter((value): value is string => Boolean(value));

  return new EmbedBuilder()
    .setTitle(profile.username)
    .setDescription(details.join(' | '));
}

function formatTurns(turns: TurnsResponse['turns']): string {
  const lines = [`${turns.currentTurns} turns available.`];

  if (typeof turns.timeToCapMs === 'number') {
    lines.push(`Time to cap: ${formatDuration(turns.timeToCapMs)}.`);
  }

  if (turns.lastRegenAt) {
    lines.push(`Last regenerated: ${formatDiscordTimestamp(turns.lastRegenAt)}.`);
  }

  return lines.join('\n');
}

function formatSkills(skills: SkillsResponse['skills']): string {
  if (skills.length === 0) {
    return 'No PocketRealm skills found yet.';
  }

  return skills
    .map((skill) => `${formatLabel(skill.skillType)} Lv ${skill.level} (${skill.xp} XP)`)
    .join('\n');
}

function buildRankEmbed(rank: RankResponse['rank']): EmbedBuilder {
  const lines = [
    `Rank: #${rank.rank}${rank.totalPlayers ? ` of ${rank.totalPlayers}` : ''}`,
    `Score: ${rank.score}`,
  ];

  if (rank.lastRefreshedAt) {
    lines.push(`Updated: ${formatDiscordTimestamp(rank.lastRefreshedAt)}`);
  }

  return new EmbedBuilder()
    .setTitle(`${formatLabel(rank.category)} Rank`)
    .setDescription(lines.join('\n'));
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

function formatDiscordTimestamp(value: string): string {
  const timestamp = Math.floor(new Date(value).getTime() / 1000);
  if (!Number.isFinite(timestamp)) {
    return 'unknown';
  }

  return `<t:${timestamp}:R>`;
}
