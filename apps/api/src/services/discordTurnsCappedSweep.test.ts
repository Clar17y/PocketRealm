import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TURN_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';

const mocks = vi.hoisted(() => ({
  prisma: {
    discordNotificationPreference: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    discordNotificationEvent: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    discordAccountLink: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  getTurnConfig: vi.fn(),
}));

vi.mock('@pocketrealm/database', () => ({ prisma: mocks.prisma }));
vi.mock('./turnBankService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./turnBankService')>()),
  getTurnConfig: mocks.getTurnConfig,
}));

import { runDiscordTurnsCappedSweep } from './discordTurnsCappedSweep';

const NOW = new Date('2026-06-12T12:00:00.000Z');
const GUILD_ID = '23456789012345678';
const USER_ID = '34567890123456789';
const CAP = TURN_CONSTANTS.BANK_CAP;

function preference(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pref-1',
    discordGuildId: GUILD_ID,
    discordUserId: USER_ID,
    type: 'turns_capped',
    enabled: true,
    armed: true,
    lastFiredAt: null,
    ...overrides,
  };
}

function linkWithTurnBank(overrides: Record<string, unknown> = {}) {
  return {
    account: {
      activePlayer: {
        id: 'player-1',
        username: 'Mira',
        turnBank: {
          currentTurns: CAP,
          lastRegenAt: new Date('2026-06-12T00:00:00.000Z'),
          regenProgress: 0,
          ...overrides,
        },
      },
    },
  };
}

describe('runDiscordTurnsCappedSweep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
    mocks.getTurnConfig.mockResolvedValue({ regenRate: TURN_CONSTANTS.REGEN_RATE, bankCap: CAP });
    mocks.prisma.discordAccountLink.findFirst.mockResolvedValue(linkWithTurnBank());
    mocks.prisma.discordNotificationEvent.createMany.mockResolvedValue({ count: 1 });
    mocks.prisma.discordNotificationEvent.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.discordNotificationPreference.update.mockResolvedValue(preference());
  });

  it('fires and disarms when an armed player is at cap', async () => {
    mocks.prisma.discordNotificationPreference.findMany.mockResolvedValue([preference()]);

    const summary = await runDiscordTurnsCappedSweep(NOW);

    expect(summary).toEqual({ checked: 1, fired: 1, rearmed: 0, skipped: 0 });
    expect(mocks.prisma.discordNotificationEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        discordGuildId: GUILD_ID,
        discordUserId: USER_ID,
        type: 'turns_capped',
        dedupKey: `turns_capped:player-1:${new Date('2026-06-12T00:00:00.000Z').getTime()}`,
        payload: { currentTurns: CAP, bankCap: CAP, username: 'Mira' },
      })],
      skipDuplicates: true,
    });
    expect(mocks.prisma.discordNotificationPreference.update).toHaveBeenCalledWith({
      where: { id: 'pref-1' },
      data: { armed: false, lastFiredAt: NOW },
    });
  });

  it('does not refire while disarmed at cap', async () => {
    mocks.prisma.discordNotificationPreference.findMany.mockResolvedValue([preference({ armed: false })]);

    const summary = await runDiscordTurnsCappedSweep(NOW);

    expect(summary).toEqual({ checked: 1, fired: 0, rearmed: 0, skipped: 0 });
    expect(mocks.prisma.discordNotificationEvent.createMany).not.toHaveBeenCalled();
  });

  it('re-arms when a disarmed player drops below cap', async () => {
    mocks.prisma.discordNotificationPreference.findMany.mockResolvedValue([preference({ armed: false })]);
    mocks.prisma.discordAccountLink.findFirst.mockResolvedValue(
      linkWithTurnBank({ currentTurns: 10, lastRegenAt: NOW }),
    );

    const summary = await runDiscordTurnsCappedSweep(NOW);

    expect(summary).toEqual({ checked: 1, fired: 0, rearmed: 1, skipped: 0 });
    expect(mocks.prisma.discordNotificationPreference.update).toHaveBeenCalledWith({
      where: { id: 'pref-1' },
      data: { armed: true },
    });
  });

  it('does not fire below cap when armed', async () => {
    mocks.prisma.discordNotificationPreference.findMany.mockResolvedValue([preference()]);
    mocks.prisma.discordAccountLink.findFirst.mockResolvedValue(
      linkWithTurnBank({ currentTurns: 10, lastRegenAt: NOW }),
    );

    const summary = await runDiscordTurnsCappedSweep(NOW);

    expect(summary).toEqual({ checked: 1, fired: 0, rearmed: 0, skipped: 0 });
    expect(mocks.prisma.discordNotificationEvent.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.discordNotificationPreference.update).not.toHaveBeenCalled();
  });

  it('uses the premium cap from getTurnConfig', async () => {
    mocks.prisma.discordNotificationPreference.findMany.mockResolvedValue([preference()]);
    mocks.getTurnConfig.mockResolvedValue({ regenRate: TURN_CONSTANTS.REGEN_RATE, bankCap: CAP * 2 });
    mocks.prisma.discordAccountLink.findFirst.mockResolvedValue(
      linkWithTurnBank({ currentTurns: CAP, lastRegenAt: NOW }),
    );

    const summary = await runDiscordTurnsCappedSweep(NOW);

    expect(summary.fired).toBe(0);
  });

  it('skips unlinked users and accounts without an active player or turn bank', async () => {
    mocks.prisma.discordNotificationPreference.findMany.mockResolvedValue([preference()]);
    mocks.prisma.discordAccountLink.findFirst.mockResolvedValue(null);

    const summary = await runDiscordTurnsCappedSweep(NOW);

    expect(summary).toEqual({ checked: 1, fired: 0, rearmed: 0, skipped: 1 });
  });

  it('prunes delivered events older than the retention window', async () => {
    mocks.prisma.discordNotificationPreference.findMany.mockResolvedValue([]);

    await runDiscordTurnsCappedSweep(NOW);

    expect(mocks.prisma.discordNotificationEvent.deleteMany).toHaveBeenCalledWith({
      where: { deliveredAt: { lt: new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000) } },
    });
  });
});
