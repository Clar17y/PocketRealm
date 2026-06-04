import type { ChatInputCommandInteraction, Interaction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import { routeInteraction } from './interactionRouter.js';

describe('routeInteraction', () => {
  it('replies ephemerally for a known registered command without an implementation', async () => {
    const reply = vi.fn<ChatInputCommandInteraction['reply']>();
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'wiki',
      reply,
    } as unknown as Interaction;
    const post = vi.fn(async <T>(): Promise<T> => null as T) as unknown as Pick<
      PocketRealmApiClient,
      'post'
    >['post'];

    await routeInteraction(interaction, { api: { post } });

    expect(reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'The /wiki command is not available yet.',
    });
  });

  it('ignores unknown chat input commands', async () => {
    const reply = vi.fn<ChatInputCommandInteraction['reply']>();
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'unknown',
      reply,
    } as unknown as Interaction;
    const post = vi.fn(async <T>(): Promise<T> => null as T) as unknown as Pick<
      PocketRealmApiClient,
      'post'
    >['post'];

    await routeInteraction(interaction, { api: { post } });

    expect(reply).not.toHaveBeenCalled();
  });
});
