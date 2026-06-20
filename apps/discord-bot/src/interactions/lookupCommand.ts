import type { ChatInputCommandInteraction } from 'discord.js';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
import { statusCard } from '../discord/v2Card.js';
import {
  buildItemCard,
  buildMobCard,
  buildNotFoundCard,
  buildSuggestionCard,
  type ItemCardData,
  type MobCardData,
} from '../discord/lookupCard.js';

type LookupApiClient = Pick<PocketRealmApiClient, 'get'>;
type LookupConfig = Pick<BotConfig, 'emojiMap'>;

interface ItemLookupResponse { match: ItemCardData | null; suggestions: string[]; }
interface MobLookupResponse { match: MobCardData | null; suggestions: string[]; }

export async function handleItemCommand(
  interaction: ChatInputCommandInteraction,
  api: LookupApiClient,
  config: LookupConfig,
): Promise<void> {
  const query = interaction.options.getString('query', true).trim();
  await interaction.deferReply({ ephemeral: false });

  let response: ItemLookupResponse;
  try {
    response = await api.get<ItemLookupResponse>(
      `/api/v1/discord/items/lookup?q=${encodeURIComponent(query)}`,
    );
  } catch {
    await interaction.editReply(unavailableCard('item', config));
    return;
  }

  if (response.match) {
    await interaction.editReply(buildItemCard(response.match, config.emojiMap));
    return;
  }
  if (response.suggestions.length) {
    await interaction.editReply(buildSuggestionCard(query, response.suggestions, 'item', config.emojiMap));
    return;
  }
  await interaction.editReply(buildNotFoundCard(query, 'item', config.emojiMap));
}

export async function handleMobCommand(
  interaction: ChatInputCommandInteraction,
  api: LookupApiClient,
  config: LookupConfig,
): Promise<void> {
  const query = interaction.options.getString('query', true).trim();
  await interaction.deferReply({ ephemeral: false });

  let response: MobLookupResponse;
  try {
    response = await api.get<MobLookupResponse>(
      `/api/v1/discord/mobs/lookup?q=${encodeURIComponent(query)}`,
    );
  } catch {
    await interaction.editReply(unavailableCard('mob', config));
    return;
  }

  if (response.match) {
    await interaction.editReply(buildMobCard(response.match, config.emojiMap));
    return;
  }
  if (response.suggestions.length) {
    await interaction.editReply(buildSuggestionCard(query, response.suggestions, 'mob', config.emojiMap));
    return;
  }
  await interaction.editReply(buildNotFoundCard(query, 'mob', config.emojiMap));
}

function unavailableCard(kind: 'item' | 'mob', config: LookupConfig) {
  return statusCard(
    'error',
    'Lookup unavailable',
    `Unable to look up that ${kind} right now. Please try again later.`,
    config.emojiMap,
  );
}
