import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import { handleWikiCommand } from './wikiCommand.js';

const wikiConfig = { webBaseUrl: 'https://pocketrealm.app', emojiMap: {} };
const disabledMentions = { allowedMentions: { parse: [] } } as const;
const unsafeWikiText = '@everyone **bad** [x](https://evil.example)';
const escapedUnsafeWikiText = '@\u200Beveryone \\*\\*bad\\*\\* \\[x\\]\\(https://evil\\.example\\)';

describe('handleWikiCommand', () => {
  it('returns up to 5 absolute wiki links for a search query', async () => {
    const results = Array.from({ length: 6 }, (_, index) => ({
      title: `Forge Guide ${index + 1}`,
      section: index === 0 ? 'Crafting' : undefined,
      snippet: `Snippet ${index + 1}`,
      url: `/wiki/forge-${index + 1}`,
    }));
    const get = vi.fn(async <T>(): Promise<T> => ({ results }) as T);
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      options: {
        getString: vi.fn(() => 'forge'),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleWikiCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, wikiConfig);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: false });
    expect(get).toHaveBeenCalledWith('/api/v1/discord/wiki/search?q=forge');
    const payload = editReply.mock.calls[0]?.[0];
    const content = typeof payload === 'object' && 'content' in payload && typeof payload.content === 'string'
      ? payload.content
      : '';
    expect(content).toContain('📖 **Wiki results for "forge"**');
    expect(content).toContain('[Forge Guide 1 - Crafting]');
    expect(content).toContain('https://pocketrealm.app/wiki/forge-1');
    expect(content).toContain('https://pocketrealm.app/wiki/forge-5');
    expect(content).not.toContain('Forge Guide 6');
    expect(payload).toMatchObject(disabledMentions);
  });

  it('responds safely when no wiki results are found', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({ results: [] }) as T);
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      options: {
        getString: vi.fn(() => 'missing topic'),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleWikiCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, wikiConfig);

    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('ℹ️ **No wiki results**'),
      ...disabledMentions,
    });
  });

  it('disables mentions when wiki search is unavailable', async () => {
    const get = vi.fn(async (): Promise<never> => {
      throw new Error('unavailable');
    });
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      options: {
        getString: vi.fn(() => 'forge'),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleWikiCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, wikiConfig);

    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('❌ **Wiki unavailable**'),
      ...disabledMentions,
    });
  });

  it('escapes unsafe query text in public no-results replies and disables mentions', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({ results: [] }) as T);
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      options: {
        getString: vi.fn(() => unsafeWikiText),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleWikiCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, wikiConfig);

    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining(`No wiki results found for "${escapedUnsafeWikiText}".`),
      ...disabledMentions,
    });
    const reply = editReply.mock.calls[0]?.[0];
    const content = typeof reply === 'object' && 'content' in reply ? reply.content : '';
    expect(content).not.toContain('@everyone');
    expect(content).not.toContain('**bad**');
    expect(content).not.toContain('[x](https://evil.example)');
  });

  it('skips malformed and unsafe wiki result URLs while still replying', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({
      results: [
        { title: 'Bad Absolute', url: 'https://evil.example/wiki/forge' },
        { title: 'Script Link', url: 'javascript:alert(1)' },
        { title: 'Malformed Link', url: 'https://[bad-url' },
        { title: 'PocketRealm Guide', url: 'https://pocketrealm.app/wiki/forge' },
        { title: 'Relative Guide', url: '/wiki/forge-tools' },
      ],
    }) as T);
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      options: {
        getString: vi.fn(() => 'forge'),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleWikiCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, wikiConfig);

    expect(editReply).toHaveBeenCalledOnce();
    const reply = editReply.mock.calls[0]?.[0];
    const content = typeof reply === 'object' && 'content' in reply ? reply.content : '';
    expect(content).toContain('https://pocketrealm.app/wiki/forge');
    expect(content).toContain('https://pocketrealm.app/wiki/forge-tools');
    expect(content).not.toContain('evil.example');
    expect(content).not.toContain('javascript:');
    expect(content).not.toContain('https://[bad-url');
  });

  it('escapes wiki result labels before rendering markdown links', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({
      results: [
        {
          title: 'Guide](https://evil.example) [',
          section: 'Crafting](https://bad.example) [',
          snippet: 'Safe snippet',
          url: '/wiki/safe-guide',
        },
      ],
    }) as T);
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      options: {
        getString: vi.fn(() => 'forge'),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleWikiCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, wikiConfig);

    const reply = editReply.mock.calls[0]?.[0];
    const content = typeof reply === 'object' && 'content' in reply ? reply.content : '';
    expect(content).toContain(
      String.raw`[Guide\]\(https://evil\.example\) \[ - Crafting\]\(https://bad\.example\) \[]`,
    );
    expect(content).toContain('https://pocketrealm.app/wiki/safe-guide');
    expect(content).not.toContain('https://evil.example');
    expect(content).not.toContain('https://bad.example');
  });

  it('escapes unsafe query text in public results headings and disables mentions', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({
      results: [
        {
          title: 'Safe Guide',
          snippet: 'Safe snippet',
          url: '/wiki/safe-guide',
        },
      ],
    }) as T);
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      options: {
        getString: vi.fn(() => unsafeWikiText),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleWikiCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, wikiConfig);

    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining(`📖 **Wiki results for "${escapedUnsafeWikiText}"**`),
      ...disabledMentions,
    });
    const reply = editReply.mock.calls[0]?.[0];
    const content = typeof reply === 'object' && 'content' in reply ? reply.content : '';
    expect(content).not.toContain('@everyone');
    expect(content).not.toContain('**bad**');
    expect(content).not.toContain('[x](https://evil.example)');
  });

  it('escapes unsafe snippet text in public wiki results and disables mentions', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({
      results: [
        {
          title: 'Safe Guide',
          snippet: unsafeWikiText,
          url: '/wiki/safe-guide',
        },
      ],
    }) as T);
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      options: {
        getString: vi.fn(() => 'forge'),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleWikiCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, wikiConfig);

    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining(
        `- [Safe Guide](https://pocketrealm.app/wiki/safe-guide) - ${escapedUnsafeWikiText}`,
      ),
      ...disabledMentions,
    });
    const reply = editReply.mock.calls[0]?.[0];
    const content = typeof reply === 'object' && 'content' in reply ? reply.content : '';
    expect(content).toContain('[Safe Guide](https://pocketrealm.app/wiki/safe-guide)');
    expect(content).not.toContain('@everyone');
    expect(content).not.toContain('[x](https://evil.example)');
    expect(content).not.toContain('**bad**');
  });

  it('escapes wiki result destinations before rendering markdown links', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({
      results: [
        {
          title: 'Safe Guide',
          url: '/wiki/a) [evil](https://evil.example)',
        },
      ],
    }) as T);
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      options: {
        getString: vi.fn(() => 'forge'),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleWikiCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, wikiConfig);

    const reply = editReply.mock.calls[0]?.[0];
    const content = typeof reply === 'object' && 'content' in reply ? reply.content : '';
    expect(content).toContain('https://pocketrealm.app/wiki/a%29%20%5Bevil%5D%28https%3A//evil.example%29');
    expect(content).not.toContain('https://evil.example');
    expect(content).not.toContain('[evil](https://evil.example)');
  });

  it('uses the configured web origin for wiki result URLs', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({
      results: [
        { title: 'Configured Guide', url: 'https://pocketrealm.example/wiki/forge' },
        { title: 'Relative Guide', url: '/wiki/forge-tools' },
        { title: 'Off Site Guide', url: 'https://pocketrealm.app/wiki/forge' },
      ],
    }) as T);
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      options: {
        getString: vi.fn(() => 'forge'),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleWikiCommand(
      interaction,
      { get } as Pick<PocketRealmApiClient, 'get'>,
      { webBaseUrl: 'https://pocketrealm.example', emojiMap: {} },
    );

    expect(editReply).toHaveBeenCalledOnce();
    const reply = editReply.mock.calls[0]?.[0];
    const content = typeof reply === 'object' && 'content' in reply ? reply.content : '';
    expect(content).toContain('https://pocketrealm.example/wiki/forge');
    expect(content).toContain('https://pocketrealm.example/wiki/forge-tools');
    expect(content).not.toContain('https://pocketrealm.app/wiki/forge');
  });
});
