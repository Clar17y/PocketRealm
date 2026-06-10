import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runTemplateCombat: vi.fn(),
  buildPvpCombatant: vi.fn(),
  mapTemplateCombatLog: vi.fn(),
}));

vi.mock('@pocketrealm/game-engine', () => ({
  runTemplateCombat: mocks.runTemplateCombat,
}));

vi.mock('./pvpCombatantBuilder', () => ({
  buildPvpCombatant: mocks.buildPvpCombatant,
}));

vi.mock('./combatLogMapper', () => ({
  mapTemplateCombatLog: mocks.mapTemplateCombatLog,
}));

import { mockPrisma } from '../__test__/setup';
import { buildPvpCombatant } from './pvpCombatantBuilder';
import { runTemplateCombat } from '@pocketrealm/game-engine';
import {
  createPendingDiscordDuel,
  getDiscordDuelReplay,
  recordDiscordDuelMessage,
  resolveDiscordDuel,
} from './discordDuelService';

const GUILD_ID = '23456789012345678';
const CHANNEL_ID = '34567890123456789';
const CHALLENGER_DISCORD_ID = '12345678901234567';
const TARGET_DISCORD_ID = '45678901234567890';
const DUEL_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '56789012345678901';
const NOW = new Date('2026-06-04T12:00:00.000Z');

function mockModel() {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
}

const GAMEPLAY_WRITE_DELEGATES = [
  'turnBank',
  'pvpRating',
  'player',
  'playerSkill',
  'playerEquipment',
  'item',
  'activityLog',
  'playerAchievement',
  'playerStats',
  'playerCrown',
  'playerQuest',
  'playerQuestState',
  'playerBuff',
  'playerShopPurchase',
  'playerRecipe',
  'playerZoneDiscovery',
  'playerZoneExploration',
  'playerResourceNode',
  'playerBestiary',
  'playerBestiaryPrefix',
  'playerBossRotation',
  'persistedMob',
  'pvpCooldown',
  'pvpMatch',
  'pvpScoutLog',
  'combatTemplate',
  'combatTemplateSlot',
  'skillPointAllocation',
  'guildExpedition',
  'guildExpeditionMember',
  'playerExpeditionBestiary',
  'expeditionCooldown',
] as const;

const WRITE_METHODS = [
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
] as const;

function expectNoGameplayWrites() {
  for (const delegateName of GAMEPLAY_WRITE_DELEGATES) {
    const delegate = mockPrisma[delegateName] as Record<string, unknown> | undefined;

    for (const method of WRITE_METHODS) {
      const operation = delegate?.[method];
      if (vi.isMockFunction(operation)) {
        expect(operation, `${delegateName}.${method}`).not.toHaveBeenCalled();
      }
    }
  }
}

function linkedPlayer(playerId: string, username: string) {
  return {
    account: {
      activePlayerId: playerId,
      activePlayer: { id: playerId, username },
    },
  };
}

function pendingDuel(overrides: Record<string, unknown> = {}) {
  return {
    id: DUEL_ID,
    guildId: GUILD_ID,
    channelId: CHANNEL_ID,
    messageId: null,
    challengerDiscordUserId: CHALLENGER_DISCORD_ID,
    targetDiscordUserId: TARGET_DISCORD_ID,
    challengerPlayerId: 'player-1',
    targetPlayerId: 'player-2',
    status: 'pending',
    winnerPlayerId: null,
    isDraw: false,
    combatLog: null,
    summary: null,
    createdAt: NOW,
    acceptedAt: null,
    completedAt: null,
    expiresAt: new Date(NOW.getTime() + 60_000),
    challenger: { username: 'Mira' },
    target: { username: 'Theo' },
    winner: null,
    ...overrides,
  };
}

function combatant(id: string, name: string) {
  return {
    id,
    name,
    stats: {
      hp: 4,
      maxHp: 100,
      attack: 15,
      defence: 10,
      magicPower: 0,
      magicDefence: 5,
      accuracy: 60,
      dodge: 10,
      speed: 5,
      damageMin: 5,
      damageMax: 15,
      critChance: 0.05,
      critDamage: 1.5,
      evasion: 5,
      damageType: 'physical',
    },
    template: [{ actionId: 'light_attack' }],
    stamina: 3,
    maxStamina: 100,
    staminaRegenPerRound: 10,
    mana: 2,
    maxMana: 50,
    manaRegenPerRound: 5,
    actionDefinitions: {},
  };
}

describe('discordDuelService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(NOW);
    mockPrisma.discordDuel = mockModel();
    mockPrisma.discordAccountLink = mockModel();
    mockPrisma.turnBank = mockPrisma.turnBank ?? mockModel();
    mockPrisma.pvpRating = mockPrisma.pvpRating ?? mockModel();
    mockPrisma.player = mockPrisma.player ?? mockModel();
    mockPrisma.discordAccountLink.findFirst
      .mockResolvedValueOnce(linkedPlayer('player-1', 'Mira'))
      .mockResolvedValueOnce(linkedPlayer('player-2', 'Theo'));
    mockPrisma.discordDuel.create.mockResolvedValue(pendingDuel());
    mockPrisma.discordDuel.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.discordDuel.update.mockResolvedValue(pendingDuel({
      status: 'completed',
      winnerPlayerId: 'player-1',
      isDraw: false,
      summary: { outcome: 'victory', totalRounds: 3 },
      combatLog: [{ round: 1, message: 'Mira hits Theo.' }],
      completedAt: NOW,
      acceptedAt: NOW,
    }));
    mocks.buildPvpCombatant
      .mockResolvedValueOnce(combatant('player-1', 'Mira'))
      .mockResolvedValueOnce(combatant('player-2', 'Theo'));
    mocks.runTemplateCombat.mockReturnValue({
      outcome: 'victory',
      log: [{ round: 1, message: 'Mira hits Theo.' }],
      combatantAMaxHp: 100,
      combatantBMaxHp: 100,
      combatantAHpRemaining: 80,
      combatantBHpRemaining: 0,
      combatantAMaxStamina: 100,
      combatantBMaxStamina: 100,
      combatantAStaminaRemaining: 65,
      combatantBStaminaRemaining: 20,
      combatantAMaxMana: 50,
      combatantBMaxMana: 50,
      combatantAManaRemaining: 35,
      combatantBManaRemaining: 15,
      potionsConsumed: [],
      totalRounds: 3,
    });
    mocks.mapTemplateCombatLog.mockImplementation((log: unknown[]) => log);
  });

  it('rejects self challenges before resolving account links', async () => {
    await expect(createPendingDiscordDuel({
      guildId: GUILD_ID,
      channelId: CHANNEL_ID,
      challengerDiscordUserId: '12345678901234567',
      targetDiscordUserId: '12345678901234567',
    })).rejects.toMatchObject({ code: 'DISCORD_DUEL_SELF_CHALLENGE' });

    expect(mockPrisma.discordAccountLink.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.discordDuel.create).not.toHaveBeenCalled();
  });

  it('creates a pending duel for two linked active players in the same guild', async () => {
    const result = await createPendingDiscordDuel({
      guildId: GUILD_ID,
      channelId: CHANNEL_ID,
      challengerDiscordUserId: CHALLENGER_DISCORD_ID,
      targetDiscordUserId: TARGET_DISCORD_ID,
    });

    expect(mockPrisma.discordAccountLink.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { discordGuildId: GUILD_ID, discordUserId: CHALLENGER_DISCORD_ID, unlinkedAt: null },
    }));
    expect(mockPrisma.discordAccountLink.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { discordGuildId: GUILD_ID, discordUserId: TARGET_DISCORD_ID, unlinkedAt: null },
    }));
    expect(mockPrisma.discordDuel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        guildId: GUILD_ID,
        channelId: CHANNEL_ID,
        challengerDiscordUserId: CHALLENGER_DISCORD_ID,
        targetDiscordUserId: TARGET_DISCORD_ID,
        challengerPlayerId: 'player-1',
        targetPlayerId: 'player-2',
        status: 'pending',
      }),
      include: expect.any(Object),
    });
    expect(result).toEqual(expect.objectContaining({
      id: DUEL_ID,
      status: 'pending',
      challengerUsername: 'Mira',
      targetUsername: 'Theo',
      expiresAt: expect.any(Date),
    }));
  });

  it('rejects a resolve attempt from anyone except the target Discord user', async () => {
    mockPrisma.discordDuel.findUnique.mockResolvedValue(pendingDuel());

    await expect(resolveDiscordDuel(DUEL_ID, CHALLENGER_DISCORD_ID))
      .rejects.toMatchObject({ code: 'DISCORD_DUEL_NOT_TARGET' });

    expect(buildPvpCombatant).not.toHaveBeenCalled();
    expect(runTemplateCombat).not.toHaveBeenCalled();
    expect(mockPrisma.discordDuel.update).not.toHaveBeenCalled();
  });

  it('rejects an expired pending duel', async () => {
    mockPrisma.discordDuel.findUnique.mockResolvedValue(pendingDuel({
      expiresAt: new Date(NOW.getTime() - 1),
    }));

    await expect(resolveDiscordDuel(DUEL_ID, TARGET_DISCORD_ID))
      .rejects.toMatchObject({ code: 'DISCORD_DUEL_EXPIRED' });

    expect(runTemplateCombat).not.toHaveBeenCalled();
    expect(mockPrisma.discordDuel.update).not.toHaveBeenCalled();
  });

  it('rejects a duel that is no longer pending', async () => {
    mockPrisma.discordDuel.findUnique.mockResolvedValue(pendingDuel({ status: 'completed' }));

    await expect(resolveDiscordDuel(DUEL_ID, TARGET_DISCORD_ID))
      .rejects.toMatchObject({ code: 'DISCORD_DUEL_NOT_PENDING' });

    expect(runTemplateCombat).not.toHaveBeenCalled();
    expect(mockPrisma.discordDuel.update).not.toHaveBeenCalled();
  });

  it('resolves a Discord duel without mutating gameplay state', async () => {
    mockPrisma.discordDuel.findUnique
      .mockResolvedValueOnce(pendingDuel())
      .mockResolvedValueOnce(pendingDuel({
        status: 'completed',
        winnerPlayerId: 'player-1',
        isDraw: false,
        summary: { outcome: 'victory', totalRounds: 3 },
        combatLog: [{ round: 1, message: 'Mira hits Theo.' }],
        completedAt: NOW,
        acceptedAt: NOW,
      }));
    mockPrisma.discordDuel.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await resolveDiscordDuel(DUEL_ID, TARGET_DISCORD_ID);

    expect(buildPvpCombatant).toHaveBeenCalledWith('player-1', 'Mira', false, { readOnlySkillAllocation: true });
    expect(buildPvpCombatant).toHaveBeenCalledWith('player-2', 'Theo', false, { readOnlySkillAllocation: true });
    expect(runTemplateCombat).toHaveBeenCalledWith(
      expect.objectContaining({ stamina: 100, mana: 50, stats: expect.objectContaining({ hp: 100 }) }),
      expect.objectContaining({ stamina: 100, mana: 50, stats: expect.objectContaining({ hp: 100 }) }),
      { combatMode: 'pvp' },
    );
    expectNoGameplayWrites();
    expect(mockPrisma.discordDuel.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: DUEL_ID,
        status: 'pending',
        expiresAt: { gt: NOW },
        targetDiscordUserId: TARGET_DISCORD_ID,
      },
      data: {
        status: 'resolving',
        acceptedAt: NOW,
      },
    });
    expect(mockPrisma.discordDuel.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: {
        id: DUEL_ID,
        status: 'resolving',
        acceptedAt: NOW,
        targetDiscordUserId: TARGET_DISCORD_ID,
      },
      data: expect.objectContaining({
        status: 'completed',
        winnerPlayerId: 'player-1',
        isDraw: false,
        combatLog: [{ round: 1, message: 'Mira hits Theo.' }],
      }),
    }));
    expect(mockPrisma.discordDuel.update).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      id: DUEL_ID,
      status: 'completed',
      winnerUsername: 'Mira',
      isDraw: false,
      summary: expect.objectContaining({ outcome: 'victory', totalRounds: 3 }),
      replay: expect.objectContaining({ page: 1, hasMore: false }),
    }));
  });

  it('does not simulate combat when the atomic duel claim fails', async () => {
    mockPrisma.discordDuel.findUnique
      .mockResolvedValueOnce(pendingDuel())
      .mockResolvedValueOnce(pendingDuel({ status: 'completed' }));
    mockPrisma.discordDuel.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(resolveDiscordDuel(DUEL_ID, TARGET_DISCORD_ID))
      .rejects.toMatchObject({ code: 'DISCORD_DUEL_NOT_PENDING' });

    expect(buildPvpCombatant).not.toHaveBeenCalled();
    expect(runTemplateCombat).not.toHaveBeenCalled();
    expect(mockPrisma.discordDuel.updateMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.discordDuel.update).not.toHaveBeenCalled();
  });

  it('restores a pending duel claim when simulation fails after the atomic claim', async () => {
    const error = new Error('template unavailable');
    mockPrisma.discordDuel.findUnique.mockResolvedValue(pendingDuel());
    mockPrisma.discordDuel.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    mocks.buildPvpCombatant.mockReset();
    mocks.buildPvpCombatant.mockRejectedValueOnce(error);

    await expect(resolveDiscordDuel(DUEL_ID, TARGET_DISCORD_ID)).rejects.toBe(error);

    expect(runTemplateCombat).not.toHaveBeenCalled();
    expect(mockPrisma.discordDuel.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: DUEL_ID,
        status: 'resolving',
        acceptedAt: NOW,
        targetDiscordUserId: TARGET_DISCORD_ID,
      },
      data: {
        status: 'pending',
        acceptedAt: null,
      },
    });
  });

  it('does not restore the claim when the post-completion read fails', async () => {
    const readError = new Error('transient read failure');
    mockPrisma.discordDuel.findUnique
      .mockResolvedValueOnce(pendingDuel())
      .mockRejectedValueOnce(readError);
    mockPrisma.discordDuel.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(resolveDiscordDuel(DUEL_ID, TARGET_DISCORD_ID)).rejects.toBe(readError);

    // Claim + completion only — no third updateMany restoring the pending claim.
    expect(mockPrisma.discordDuel.updateMany).toHaveBeenCalledTimes(2);
    expect(mockPrisma.discordDuel.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'pending', acceptedAt: null },
    }));
  });

  it('records the Discord message id for a duel', async () => {
    mockPrisma.discordDuel.findUnique.mockResolvedValue(pendingDuel({ messageId: MESSAGE_ID }));
    mockPrisma.discordDuel.updateMany.mockResolvedValue({ count: 1 });

    const result = await recordDiscordDuelMessage(DUEL_ID, MESSAGE_ID);

    expect(mockPrisma.discordDuel.updateMany).toHaveBeenCalledWith({
      where: {
        id: DUEL_ID,
        OR: [
          { messageId: null },
          { messageId: MESSAGE_ID },
        ],
      },
      data: { messageId: MESSAGE_ID },
    });
    expect(mockPrisma.discordDuel.findUnique).toHaveBeenCalledWith({
      where: { id: DUEL_ID },
      select: { id: true, messageId: true },
    });
    expect(mockPrisma.discordDuel.update).not.toHaveBeenCalled();
    expect(result).toEqual({ id: DUEL_ID, messageId: MESSAGE_ID });
  });

  it('allows retrying the same Discord message id for a duel', async () => {
    mockPrisma.discordDuel.findUnique.mockResolvedValue(pendingDuel({ messageId: MESSAGE_ID }));
    mockPrisma.discordDuel.updateMany.mockResolvedValue({ count: 1 });

    await expect(recordDiscordDuelMessage(DUEL_ID, MESSAGE_ID))
      .resolves.toEqual({ id: DUEL_ID, messageId: MESSAGE_ID });
  });

  it('rejects recording a different Discord message id for a duel', async () => {
    mockPrisma.discordDuel.findUnique.mockResolvedValue(pendingDuel({ messageId: '67890123456789012' }));
    mockPrisma.discordDuel.updateMany.mockResolvedValue({ count: 0 });

    await expect(recordDiscordDuelMessage(DUEL_ID, MESSAGE_ID))
      .rejects.toMatchObject({ code: 'DISCORD_DUEL_MESSAGE_CONFLICT' });

    expect(mockPrisma.discordDuel.update).not.toHaveBeenCalled();
  });

  it('returns bounded replay pages with hasMore', async () => {
    const combatLog = Array.from({ length: 22 }, (_, index) => ({ round: index + 1 }));
    mockPrisma.discordDuel.findUnique.mockResolvedValue(pendingDuel({
      status: 'completed',
      combatLog,
      winnerPlayerId: 'player-1',
      winner: { username: 'Mira' },
    }));

    const replay = await getDiscordDuelReplay(DUEL_ID, 2);

    expect(replay).toEqual({
      id: DUEL_ID,
      status: 'completed',
      page: 2,
      pageSize: 10,
      hasMore: true,
      entries: combatLog.slice(10, 20),
    });
  });

  it('returns a controlled error for missing duels', async () => {
    mockPrisma.discordDuel.findUnique.mockResolvedValue(null);

    await expect(getDiscordDuelReplay(DUEL_ID, 1))
      .rejects.toMatchObject({ code: 'DISCORD_DUEL_NOT_FOUND' });
  });
});
