import type { ButtonInteraction, ChatInputCommandInteraction, User } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { PocketRealmApiError } from '../api/pocketRealmApi.js';
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
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const followUp = vi.fn(async () => ({ id: 'discord-message-1' }));
    const interaction = createCommandInteraction({
      opponent: createUser('333333333333333333'),
      deferReply,
      editReply,
      followUp,
    });

    await handleDuelCommand(interaction, api, config);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/duels', {
      guildId: 'guild-123',
      channelId: '111111111111111111',
      challengerDiscordUserId: '123456789012345678',
      targetDiscordUserId: '333333333333333333',
    });
    expect(followUp).toHaveBeenCalledWith(expect.objectContaining({
      content: '<@333333333333333333>, <@123456789012345678> challenged you to a friendly simulation.',
      components: expect.any(Array),
    }));
    expect(editReply).toHaveBeenCalledWith({ content: 'Friendly simulation challenge posted.' });
    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/duels/duel-123/message', {
      messageId: 'discord-message-1',
    });
  });

  it('edits the deferred reply with a failure message when the public follow-up cannot be posted', async () => {
    const api = createApi();
    vi.mocked(api.post).mockResolvedValue({
      duel: {
        id: 'duel-123',
        status: 'pending',
        challengerUsername: 'Astra',
        targetUsername: 'Borin',
        expiresAt: '2026-06-04T12:15:00.000Z',
      },
    });
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const followUp = vi.fn(async () => {
      throw new Error('Missing Permissions');
    });
    const interaction = createCommandInteraction({
      opponent: createUser('333333333333333333'),
      deferReply,
      editReply,
      followUp,
    });

    await handleDuelCommand(interaction, api, config);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(editReply).toHaveBeenCalledTimes(1);
    expect(editReply).toHaveBeenCalledWith({
      content: 'Could not post the public duel challenge. Please run /duel again.',
    });
    expect(api.post).not.toHaveBeenCalledWith(
      '/api/v1/discord/duels/duel-123/message',
      expect.anything(),
    );
  });

  it('edits the deferred command response for duel-specific create errors', async () => {
    const api = createApi();
    vi.mocked(api.post).mockRejectedValue(
      new PocketRealmApiError('Target link required', 404, 'DISCORD_DUEL_TARGET_LINK_REQUIRED', {}),
    );
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = createCommandInteraction({
      opponent: createUser('333333333333333333'),
      deferReply,
      editReply,
    });

    await handleDuelCommand(interaction, api, config);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(editReply).toHaveBeenCalledWith({
      content: 'Both players need linked PocketRealm accounts before dueling.',
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
    const deferUpdate = vi.fn<ButtonInteraction['deferUpdate']>();
    const editReply = vi.fn<ButtonInteraction['editReply']>();
    const interaction = createButtonInteraction({
      customId: 'duel:accept:duel-123:333333333333333333',
      userId: '333333333333333333',
      deferUpdate,
      editReply,
    });

    await handleDuelButton(interaction, api);

    expect(deferUpdate).toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/duels/duel-123/resolve', {
      acceptedByDiscordUserId: '333333333333333333',
    });
    expect(editReply).toHaveBeenCalledWith(expect.objectContaining({
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

  it('sends an ephemeral follow-up for expired accepted duels after deferring update', async () => {
    const api = createApi();
    vi.mocked(api.post).mockRejectedValue(
      new PocketRealmApiError('Expired', 410, 'DISCORD_DUEL_EXPIRED', {}),
    );
    const deferUpdate = vi.fn<ButtonInteraction['deferUpdate']>();
    const followUp = vi.fn<ButtonInteraction['followUp']>();
    const interaction = createButtonInteraction({
      customId: 'duel:accept:duel-123:333333333333333333',
      userId: '333333333333333333',
      deferUpdate,
      followUp,
    });

    await handleDuelButton(interaction, api);

    expect(deferUpdate).toHaveBeenCalled();
    expect(followUp).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'That friendly duel is no longer available. Start a new /duel.',
    });
  });

  it('updates the existing message with replay details from the replay route', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      replay: {
        id: 'duel-123',
        status: 'resolved',
        page: 1,
        pageSize: 3,
        hasMore: true,
        summary: {
          challengerUsername: 'Astra',
          targetUsername: 'Borin',
          challengerMaxHp: 100,
          targetMaxHp: 100,
          challengerMaxStamina: 100,
          targetMaxStamina: 100,
          challengerMaxMana: 50,
          targetMaxMana: 50,
        },
        entries: [
          {
            round: 1,
            actor: 'combatantA',
            actorName: 'Astra',
            actionName: 'Crippling Shot',
            damage: 12,
            hitChance: 0.75,
            hitRollValue: 0.1,
            attackerHitScore: 55,
            defenderAvoidScore: 20,
            combatantAHpAfter: 80,
            combatantBHpAfter: 88,
            combatantAStaminaAfter: 65,
            combatantBStaminaAfter: 20,
            combatantAManaAfter: 35,
            combatantBManaAfter: 15,
          },
          {
            round: 2,
            actor: 'combatantA',
            actorName: 'Astra',
            action: 'regen',
            message: 'Resources regenerate.',
            combatantAHpAfter: 80,
            combatantBHpAfter: 88,
            combatantAStaminaAfter: 75,
            combatantBStaminaAfter: 30,
            combatantAManaAfter: 40,
            combatantBManaAfter: 20,
          },
        ],
      },
    });
    const deferReply = vi.fn<ButtonInteraction['deferReply']>();
    const deferUpdate = vi.fn<ButtonInteraction['deferUpdate']>();
    const editReply = vi.fn<ButtonInteraction['editReply']>();
    const interaction = createButtonInteraction({
      customId: 'duel:replay:duel-123:1',
      deferUpdate,
      deferReply,
      editReply,
    });

    await handleDuelButton(interaction, api);

    expect(deferUpdate).toHaveBeenCalled();
    expect(deferReply).not.toHaveBeenCalled();
    expect(api.get).toHaveBeenCalledWith('/api/v1/discord/duels/duel-123/replay?page=1');
    expect(editReply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('Astra HP [########--] 80/100 MP [#######---] 35/50 STA [#######---] 65/100'),
      components: expect.any(Array),
    }));
    expect(editReply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('#1 R1 Astra Crippling Shot: 12 damage HIT 75% (roll 10%, 55 hit vs 20 avoid)'),
    }));
    expect(editReply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.not.stringContaining('Resources regenerate.'),
    }));
    const replayPayload = editReply.mock.calls[0]?.[0] as { components: Array<{ toJSON: () => unknown }> };
    expect(JSON.stringify(replayPayload.components[0]?.toJSON())).toContain('duel:replay:duel-123:2');
  });

  it('keeps replay pagination in the same message with previous and next buttons', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      replay: {
        id: 'duel-123',
        status: 'resolved',
        page: 2,
        pageSize: 3,
        hasMore: true,
        entries: [{ round: 4, message: 'Borin makes a final stand.' }],
      },
    });
    const deferUpdate = vi.fn<ButtonInteraction['deferUpdate']>();
    const editReply = vi.fn<ButtonInteraction['editReply']>();
    const interaction = createButtonInteraction({
      customId: 'duel:replay:duel-123:2',
      deferUpdate,
      editReply,
    });

    await handleDuelButton(interaction, api);

    expect(deferUpdate).toHaveBeenCalled();
    expect(api.get).toHaveBeenCalledWith('/api/v1/discord/duels/duel-123/replay?page=2');
    expect(editReply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('Friendly simulation replay page 2'),
      components: expect.any(Array),
    }));
    const replayPayload = editReply.mock.calls[0]?.[0] as { components: Array<{ toJSON: () => unknown }> };
    const componentJson = JSON.stringify(replayPayload.components[0]?.toJSON());
    expect(componentJson).toContain('duel:replay:duel-123:1');
    expect(componentJson).toContain('duel:replay:duel-123:3');
  });

  it('keeps the public duel message intact when replay loading fails', async () => {
    const api = createApi();
    vi.mocked(api.get).mockRejectedValue(new Error('api unavailable'));
    const deferUpdate = vi.fn<ButtonInteraction['deferUpdate']>();
    const editReply = vi.fn<ButtonInteraction['editReply']>();
    const followUp = vi.fn<ButtonInteraction['followUp']>();
    const interaction = createButtonInteraction({
      customId: 'duel:replay:duel-123:1',
      deferUpdate,
      editReply,
      followUp,
    });

    await handleDuelButton(interaction, api);

    expect(deferUpdate).toHaveBeenCalled();
    expect(api.get).toHaveBeenCalledWith('/api/v1/discord/duels/duel-123/replay?page=1');
    expect(editReply).not.toHaveBeenCalled();
    expect(followUp).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Unable to load the friendly simulation replay right now.',
    });
  });

  it('preserves meaningful replay messages when structured fields lack outcome details', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      replay: {
        id: 'duel-123',
        status: 'resolved',
        page: 1,
        pageSize: 3,
        hasMore: false,
        entries: [
          {
            round: 3,
            actor: 'combatantA',
            actorName: 'Astra',
            actionName: 'Crippling Shot',
            message: 'Borin falls defeated!',
          },
        ],
      },
    });
    const editReply = vi.fn<ButtonInteraction['editReply']>();
    const interaction = createButtonInteraction({
      customId: 'duel:replay:duel-123:1',
      editReply,
    });

    await handleDuelButton(interaction, api);

    expect(editReply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('Borin falls defeated!'),
    }));
    expect(editReply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.not.stringContaining('#1 R3 Astra Crippling Shot\n'),
    }));
  });

  it('bounds long replay entries for Discord message limits', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      replay: {
        id: 'duel-123',
        status: 'resolved',
        page: 1,
        pageSize: 10,
        hasMore: false,
        entries: [
          { round: 1, message: 'A'.repeat(2_500) },
          { internalState: 'B'.repeat(2_500) },
        ],
      },
    });
    const editReply = vi.fn<ButtonInteraction['editReply']>();
    const interaction = createButtonInteraction({
      customId: 'duel:replay:duel-123:1',
      editReply,
    });

    await handleDuelButton(interaction, api);

    const payload = editReply.mock.calls[0]?.[0] as { content: string };
    expect(payload.content.length).toBeLessThanOrEqual(1_800);
    expect(payload.content).toContain('Replay event details unavailable.');
    expect(payload.content).not.toContain('internalState');
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
  reply?: ReturnType<typeof vi.fn>;
  deferReply?: ReturnType<typeof vi.fn>;
  editReply?: ReturnType<typeof vi.fn>;
  followUp?: ReturnType<typeof vi.fn>;
}): ChatInputCommandInteraction {
  const userId = input.userId ?? '123456789012345678';

  return {
    guildId: input.guildId ?? 'guild-123',
    channelId: input.channelId ?? config.duelsChannelId,
    user: createUser(userId),
    options: {
      getUser: vi.fn(() => input.opponent),
    },
    reply: input.reply ?? vi.fn(),
    deferReply: input.deferReply ?? vi.fn(),
    editReply: input.editReply ?? vi.fn(),
    followUp: input.followUp ?? vi.fn(),
  } as unknown as ChatInputCommandInteraction;
}

function createButtonInteraction(input: {
  customId: string;
  userId?: string;
  reply?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
  deferUpdate?: ReturnType<typeof vi.fn>;
  deferReply?: ReturnType<typeof vi.fn>;
  editReply?: ReturnType<typeof vi.fn>;
  followUp?: ReturnType<typeof vi.fn>;
}): ButtonInteraction {
  return {
    customId: input.customId,
    user: { id: input.userId ?? '333333333333333333' },
    reply: input.reply ?? vi.fn(),
    update: input.update ?? vi.fn(),
    deferUpdate: input.deferUpdate ?? vi.fn(),
    deferReply: input.deferReply ?? vi.fn(),
    editReply: input.editReply ?? vi.fn(),
    followUp: input.followUp ?? vi.fn(),
  } as unknown as ButtonInteraction;
}
