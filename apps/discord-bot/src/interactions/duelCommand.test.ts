import type { ButtonInteraction, ChatInputCommandInteraction, User } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import { handleDuelButton, handleDuelCommand } from './duelCommand.js';

const config = {
  duelsChannelId: '111111111111111111',
};

describe('handleDuelCommand', () => {
  it('rejects duel commands outside the configured duels channel ephemerally', async () => {
    const api = createApi();
    const reply = vi.fn<ChatInputCommandInteraction['reply']>();
    const interaction = createCommandInteraction({
      channelId: '222222222222222222',
      opponent: createUser('333333333333333333'),
      reply,
    });

    await handleDuelCommand(interaction, api, config);

    expect(api.post).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Use /duel in <#111111111111111111>.',
    });
  });

  it('rejects self challenges before calling the API', async () => {
    const api = createApi();
    const reply = vi.fn<ChatInputCommandInteraction['reply']>();
    const interaction = createCommandInteraction({
      opponent: createUser('123456789012345678'),
      userId: '123456789012345678',
      reply,
    });

    await handleDuelCommand(interaction, api, config);

    expect(api.post).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Challenge another player, not yourself.',
    });
  });

  it('rejects bot users before calling the API', async () => {
    const api = createApi();
    const reply = vi.fn<ChatInputCommandInteraction['reply']>();
    const interaction = createCommandInteraction({
      opponent: createUser('333333333333333333', true),
      reply,
    });

    await handleDuelCommand(interaction, api, config);

    expect(api.post).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Challenge a player, not a bot.',
    });
  });

  it('creates a public challenge with target acceptance buttons and records the message id when available', async () => {
    const api = createApi();
    vi.mocked(api.post).mockImplementation(async <T>(path: string): Promise<T> => {
      if (path.endsWith('/message')) return null as T;

      return {
        duel: {
          id: 'duel-123',
          status: 'pending',
          challengerUsername: 'Astra',
          targetUsername: 'Borin',
          expiresAt: '2026-06-04T12:15:00.000Z',
        },
      } as T;
    });
    const reply = vi.fn(async () => ({ id: 'discord-message-1' }));
    const interaction = createCommandInteraction({
      opponent: createUser('333333333333333333'),
      reply,
    });

    await handleDuelCommand(interaction, api, config);

    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/duels', {
      guildId: 'guild-123',
      channelId: '111111111111111111',
      challengerDiscordUserId: '123456789012345678',
      targetDiscordUserId: '333333333333333333',
    });
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({
      content: '<@333333333333333333>, <@123456789012345678> challenged you to a friendly simulation.',
      components: expect.any(Array),
    }));
    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/duels/duel-123/message', {
      messageId: 'discord-message-1',
    });
  });
});

describe('handleDuelButton', () => {
  it('target accept calls the resolve route and updates with a compact friendly result', async () => {
    const api = createApi();
    vi.mocked(api.post).mockResolvedValue({
      duel: {
        id: 'duel-123',
        status: 'resolved',
        challengerUsername: 'Astra',
        targetUsername: 'Borin',
        winnerUsername: 'Astra',
        isDraw: false,
        expiresAt: '2026-06-04T12:15:00.000Z',
        summary: {
          totalRounds: 3,
          challengerHpRemaining: 42,
          targetHpRemaining: 0,
        },
        replay: {
          id: 'duel-123',
          status: 'resolved',
          page: 1,
          pageSize: 10,
          hasMore: false,
          entries: [],
        },
      },
    });
    const update = vi.fn<ButtonInteraction['update']>();
    const interaction = createButtonInteraction({
      customId: 'duel:accept:duel-123:333333333333333333',
      userId: '333333333333333333',
      update,
    });

    await handleDuelButton(interaction, api);

    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/duels/duel-123/resolve', {
      acceptedByDiscordUserId: '333333333333333333',
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('Friendly simulation'),
    }));
  });

  it('rejects non-target accept clicks ephemerally', async () => {
    const api = createApi();
    const reply = vi.fn<ButtonInteraction['reply']>();
    const update = vi.fn<ButtonInteraction['update']>();
    const interaction = createButtonInteraction({
      customId: 'duel:accept:duel-123:333333333333333333',
      userId: '444444444444444444',
      reply,
      update,
    });

    await handleDuelButton(interaction, api);

    expect(api.post).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Only the challenged player can use this duel button.',
    });
  });

  it('loads replay pages ephemerally from the replay route', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      replay: {
        id: 'duel-123',
        status: 'resolved',
        page: 1,
        pageSize: 3,
        hasMore: true,
        entries: [
          { round: 1, message: 'Astra opens with a careful strike.' },
          { round: 2, actionName: 'Counter', damageDealt: 7 },
        ],
      },
    });
    const deferReply = vi.fn<ButtonInteraction['deferReply']>();
    const editReply = vi.fn<ButtonInteraction['editReply']>();
    const interaction = createButtonInteraction({
      customId: 'duel:replay:duel-123:1',
      deferReply,
      editReply,
    });

    await handleDuelButton(interaction, api);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(api.get).toHaveBeenCalledWith('/api/v1/discord/duels/duel-123/replay?page=1');
    expect(editReply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('Astra opens with a careful strike.'),
      components: expect.any(Array),
    }));
    expect(editReply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('Round 2 · Counter · 7 damage'),
    }));
    const replayPayload = editReply.mock.calls[0]?.[0] as { components: Array<{ toJSON: () => unknown }> };
    expect(JSON.stringify(replayPayload.components[0]?.toJSON())).toContain('duel:replay:duel-123:2');
  });

  it('loads later replay pages from replay pagination buttons', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      replay: {
        id: 'duel-123',
        status: 'resolved',
        page: 2,
        pageSize: 3,
        hasMore: false,
        entries: [{ round: 4, message: 'Borin makes a final stand.' }],
      },
    });
    const deferReply = vi.fn<ButtonInteraction['deferReply']>();
    const editReply = vi.fn<ButtonInteraction['editReply']>();
    const interaction = createButtonInteraction({
      customId: 'duel:replay:duel-123:2',
      deferReply,
      editReply,
    });

    await handleDuelButton(interaction, api);

    expect(api.get).toHaveBeenCalledWith('/api/v1/discord/duels/duel-123/replay?page=2');
    expect(editReply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('Friendly simulation replay page 2'),
      components: [],
    }));
  });
});

function createApi(): Pick<PocketRealmApiClient, 'get' | 'post'> {
  return {
    get: vi.fn(),
    post: vi.fn(),
  } as Pick<PocketRealmApiClient, 'get' | 'post'>;
}

function createUser(id: string, bot = false): User {
  return {
    id,
    bot,
    toString: () => `<@${id}>`,
  } as unknown as User;
}

function createCommandInteraction(input: {
  channelId?: string;
  guildId?: string | null;
  opponent: User;
  userId?: string;
  reply: ReturnType<typeof vi.fn>;
}): ChatInputCommandInteraction {
  const userId = input.userId ?? '123456789012345678';

  return {
    guildId: input.guildId ?? 'guild-123',
    channelId: input.channelId ?? config.duelsChannelId,
    user: createUser(userId),
    options: {
      getUser: vi.fn(() => input.opponent),
    },
    reply: input.reply,
  } as unknown as ChatInputCommandInteraction;
}

function createButtonInteraction(input: {
  customId: string;
  userId?: string;
  reply?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
  deferReply?: ReturnType<typeof vi.fn>;
  editReply?: ReturnType<typeof vi.fn>;
}): ButtonInteraction {
  return {
    customId: input.customId,
    user: { id: input.userId ?? '333333333333333333' },
    reply: input.reply ?? vi.fn(),
    update: input.update ?? vi.fn(),
    deferReply: input.deferReply ?? vi.fn(),
    editReply: input.editReply ?? vi.fn(),
  } as unknown as ButtonInteraction;
}
