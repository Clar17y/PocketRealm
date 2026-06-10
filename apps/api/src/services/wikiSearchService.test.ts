import { describe, expect, it } from 'vitest';
import { searchWikiForDiscord } from './wikiSearchService';

describe('wikiSearchService', () => {
  it('returns Discord-ready wiki search results with absolute URLs', () => {
    expect(searchWikiForDiscord('forge', 'https://pocketrealm.example')).toMatchObject([
      { url: 'https://pocketrealm.example/wiki/items/forge' },
    ]);
  });

  it('handles a trailing slash on the web base URL', () => {
    expect(searchWikiForDiscord('forge', 'https://pocketrealm.example/')[0]?.url)
      .toBe('https://pocketrealm.example/wiki/items/forge');
  });
});
