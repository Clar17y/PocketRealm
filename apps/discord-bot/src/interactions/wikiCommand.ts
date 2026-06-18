import type { ChatInputCommandInteraction } from 'discord.js';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
import { statusCard, textCard } from '../discord/v2Card.js';

const MAX_WIKI_RESULTS = 5;
const PUBLIC_REPLY_OPTIONS = {
  allowedMentions: { parse: [] },
} as const;

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
      ...statusCard(
        'error',
        'Wiki unavailable',
        'Unable to search the PocketRealm wiki right now. Please try again later.',
        config.emojiMap,
        PUBLIC_REPLY_OPTIONS,
      ),
    });
    return;
  }

  const escapedQuery = escapeWikiDisplayText(query);
  const wikiBaseUrl = new URL(config.webBaseUrl);
  const results: string[] = [];
  for (const result of response.results) {
    const formatted = formatWikiResult(result, wikiBaseUrl);
    if (formatted) {
      results.push(formatted);
    }
    if (results.length >= MAX_WIKI_RESULTS) {
      break;
    }
  }

  if (results.length === 0) {
    await interaction.editReply({
      ...statusCard(
        'info',
        'No wiki results',
        `No wiki results found for "${escapedQuery}".`,
        config.emojiMap,
        PUBLIC_REPLY_OPTIONS,
      ),
    });
    return;
  }

  await interaction.editReply(textCard({
    emojiKey: 'wiki',
    title: `Wiki results for "${escapedQuery}"`,
    emojiMap: config.emojiMap,
    lines: results,
    ...PUBLIC_REPLY_OPTIONS,
  }));
}

function formatWikiResult(result: WikiResult, wikiBaseUrl: URL): string | null {
  const url = toAbsoluteWikiUrl(result.url, wikiBaseUrl);
  if (!url) {
    return null;
  }

  const title = result.section ? `${result.title} - ${result.section}` : result.title;
  const label = escapeMarkdownLinkLabel(title);
  const snippet = result.snippet ? ` - ${escapeWikiDisplayText(result.snippet)}` : '';

  return `- [${label}](${url})${snippet}`;
}

function escapeWikiDisplayText(value: string): string {
  return value
    .replace(/@/g, '@\u200B')
    .replace(/([\\`*_{}\[\]()#+.!|><~-])/g, '\\$1');
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

  const pathWithQueryAndHash = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  return `${parsedUrl.origin}${escapeMarkdownLinkDestination(pathWithQueryAndHash)}`;
}

function escapeMarkdownLinkDestination(value: string): string {
  return value.replace(/[()[\]<>:]/g, encodeMarkdownDestinationCharacter);
}

function encodeMarkdownDestinationCharacter(character: string): string {
  return `%${character.charCodeAt(0).toString(16).toUpperCase()}`;
}
