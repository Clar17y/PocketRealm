import { searchWiki } from '@pocketrealm/shared/wiki/wikiSearch';

export function searchWikiForDiscord(query: string, webBaseUrl: string) {
  const base = webBaseUrl.replace(/\/$/, '');
  return searchWiki(query, { limit: 5 }).map((result) => ({
    title: result.label,
    section: result.section,
    snippet: result.snippet,
    url: `${base}${result.href}`,
  }));
}
