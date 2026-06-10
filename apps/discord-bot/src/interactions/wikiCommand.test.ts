import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import { handleWikiCommand } from './wikiCommand.js';

const wikiConfig = { webBaseUrl: 'https://pocketrealm.app' };

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
    const reply = editReply.mock.calls[0]?.[0];
    expect(reply).toEqual({
      content: expect.stringContaining('Forge Guide 1'),
    });
    const content = typeof reply === 'object' && 'content' in reply ? reply.content : '';
    expect(content).toContain('https://pocketrealm.app/wiki/forge-1');
    expect(content).toContain('https://pocketrealm.app/wiki/forge-5');
    expect(content).not.toContain('Forge Guide 6');
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
      content: 'No wiki results found for "missing topic".',
    });
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
      { webBaseUrl: 'https://pocketrealm.example' },
    );

    expect(editReply).toHaveBeenCalledOnce();
    const reply = editReply.mock.calls[0]?.[0];
    const content = typeof reply === 'object' && 'content' in reply ? reply.content : '';
    expect(content).toContain('https://pocketrealm.example/wiki/forge');
    expect(content).toContain('https://pocketrealm.example/wiki/forge-tools');
    expect(content).not.toContain('https://pocketrealm.app/wiki/forge');
  });
});
