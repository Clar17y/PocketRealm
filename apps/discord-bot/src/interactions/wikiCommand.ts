import type { ChatInputCommandInteraction } from 'discord.js';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
import { botHeadline, botStatus } from '../discord/messageFormat.js';

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
type WikiConfig = Pick<BotConfig, 'webBaseUrl' | 'emojiMap'>;

export async function handleWikiCommand(
  interaction: ChatInputCommandInteraction,
  api: WikiApiClient,
  config: WikiConfig,
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
      content: botStatus(
        'error',
        'Wiki unavailable',
        'Unable to search the PocketRealm wiki right now. Please try again later.',
        config.emojiMap,
      ),
    });
    return;
  }

  const wikiBaseUrl = new URL(config.webBaseUrl);
  const results = response.results
    .map((result) => formatWikiResult(result, wikiBaseUrl))
    .filter((result): result is string => Boolean(result))
    .slice(0, MAX_WIKI_RESULTS);

  if (results.length === 0) {
    await interaction.editReply({
      content: botStatus('info', 'No wiki results', `No wiki results found for "${query}".`, config.emojiMap),
    });
    return;
  }

  await interaction.editReply({
    content: [
      botHeadline('wiki', `Wiki results for "${query}"`, config.emojiMap),
      ...results,
    ].join('\n'),
  });
}

function formatWikiResult(result: WikiResult, wikiBaseUrl: URL): string | null {
  const url = toAbsoluteWikiUrl(result.url, wikiBaseUrl);
  if (!url) {
    return null;
  }

  const title = result.section ? `${result.title} - ${result.section}` : result.title;
  const label = escapeMarkdownLinkLabel(title);
  const snippet = result.snippet ? ` - ${result.snippet}` : '';

  return `- [${label}](${url})${snippet}`;
}

function escapeMarkdownLinkLabel(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+.!|>])/g, '\\$1');
}

function toAbsoluteWikiUrl(url: string, wikiBaseUrl: URL): string | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url, wikiBaseUrl);
  } catch {
    return null;
  }

  if (parsedUrl.origin !== wikiBaseUrl.origin) {
    return null;
  }

  if (parsedUrl.pathname !== '/wiki' && !parsedUrl.pathname.startsWith('/wiki/')) {
    return null;
  }

  return parsedUrl.toString();
}
