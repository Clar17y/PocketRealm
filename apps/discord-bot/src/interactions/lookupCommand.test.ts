import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import { cardText, expectV2Card } from '../test/v2CardAssertions.js';
import { handleItemCommand, handleMobCommand } from './lookupCommand.js';

const config = { emojiMap: {} };

function makeInteraction(query: string) {
  const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
  const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
  const interaction = {
    options: { getString: vi.fn(() => query) },
    deferReply,
    editReply,
  } as unknown as ChatInputCommandInteraction;
  return { interaction, deferReply, editReply };
}

describe('handleItemCommand', () => {
  it('defers publicly and renders an item card on a match', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({
      match: {
        name: 'Iron Ingot', itemType: 'resource', slot: null, tier: 2, weightClass: null,
        requiredSkill: null, requiredLevel: 1, sellPrice: 10, flavorText: null,
        season: null, stats: [], sources: { drops: [], craft: null },
      },
      suggestions: [],
    }) as T);
    const { interaction, deferReply, editReply } = makeInteraction('iron ingot');

    await handleItemCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: false });
    expect(get).toHaveBeenCalledWith('/api/v1/discord/items/lookup?q=iron%20ingot');
    const payload = editReply.mock.calls[0]?.[0];
    expectV2Card(payload);
    expect(cardText(payload)).toContain('Iron Ingot');
  });

  it('renders a suggestion card when there is no match', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({ match: null, suggestions: ['Spider Silk'] }) as T);
    const { interaction, editReply } = makeInteraction('spider');

    await handleItemCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    expect(cardText(editReply.mock.calls[0]?.[0])).toContain('Spider Silk');
  });

  it('renders a not-found card when there are no suggestions', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({ match: null, suggestions: [] }) as T);
    const { interaction, editReply } = makeInteraction('zzz');

    await handleItemCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    expect(cardText(editReply.mock.calls[0]?.[0])).toContain('No item found');
  });

  it('renders an error card when the API is unavailable', async () => {
    const get = vi.fn(async (): Promise<never> => { throw new Error('down'); });
    const { interaction, editReply } = makeInteraction('iron');

    await handleItemCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    const payload = editReply.mock.calls[0]?.[0];
    expectV2Card(payload);
    expect(cardText(payload)).toContain('unavailable');
  });
});

describe('handleMobCommand', () => {
  it('renders a mob card on a match', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({
      match: { name: 'Warg', isBoss: false, isExpeditionMob: false, season: null, zones: ['Whispering Plains'], flavorAppearance: null, drops: [] },
      suggestions: [],
    }) as T);
    const { interaction, deferReply, editReply } = makeInteraction('warg');

    await handleMobCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: false });
    expect(get).toHaveBeenCalledWith('/api/v1/discord/mobs/lookup?q=warg');
    expect(cardText(editReply.mock.calls[0]?.[0])).toContain('Whispering Plains');
  });
});

describe('empty query handling', () => {
  it('skips the API call and shows a not-found card for a whitespace-only query', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({ match: null, suggestions: [] }) as T);
    const { interaction, deferReply, editReply } = makeInteraction('   ');

    await handleItemCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: false });
    expect(get).not.toHaveBeenCalled();
    expect(cardText(editReply.mock.calls[0]?.[0])).toContain('No item found');
  });
});
