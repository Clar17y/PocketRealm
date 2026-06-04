import type { ChatInputCommandInteraction } from 'discord.js';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';

const WIKI_BASE_URL = 'https://pocketrealm.app';
const MAX_WIKI_RESULTS = 5;

interface WikiSearchResponse {
  results: WikiResult[];
}

interface WikiResult {
  title: string;
  section?: string;
  snippet?: string;
  url: string;
}

type WikiApiClient = Pick<PocketRealmApiClient, 'get'>;

export async function handleWikiCommand(
  interaction: ChatInputCommandInteraction,
  api: WikiApiClient,
): Promise<void> {
  const query = interaction.options.getString('query', true).trim();

  await interaction.deferReply({ ephemeral: false });

  let response: WikiSearchResponse;
  try {
    response = await api.get<WikiSearchResponse>(
      `/api/v1/discord/wiki/search?q=${encodeURIComponent(query)}`,
    );
  } catch {
    await interaction.editReply({
      content: 'Unable to search the PocketRealm wiki right now. Please try again later.',
    });
    return;
  }

  const results = response.results.slice(0, MAX_WIKI_RESULTS);
  if (results.length === 0) {
    await interaction.editReply({
      content: `No wiki results found for "${query}".`,
    });
    return;
  }

  await interaction.editReply({
    content: [
      `Wiki results for "${query}":`,
      ...results.map(formatWikiResult),
    ].join('\n'),
  });
}

function formatWikiResult(result: WikiResult): string {
  const title = result.section ? `${result.title} - ${result.section}` : result.title;
  const snippet = result.snippet ? ` - ${result.snippet}` : '';

  return `- ${title}: ${toAbsoluteWikiUrl(result.url)}${snippet}`;
}

function toAbsoluteWikiUrl(url: string): string {
  return new URL(url, WIKI_BASE_URL).toString();
}
