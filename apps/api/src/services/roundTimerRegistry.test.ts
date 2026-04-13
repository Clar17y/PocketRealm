import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { roundTimerRegistry } from './roundTimerRegistry';

vi.mock('@pocketrealm/database', () => ({
  prisma: {
    bossEncounter: { findMany: vi.fn().mockResolvedValue([]) },
    guildExpedition: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./bossEncounterService', () => ({
  resolveDueBossEncounter: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./expeditionRoundService', () => ({
  resolveDueExpeditionStep: vi.fn().mockResolvedValue(undefined),
}));

describe('roundTimerRegistry', () => {
  const noIo = () => null;

  beforeEach(() => {
    vi.useFakeTimers();
    roundTimerRegistry.clearAll();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('schedule fires resolver at the given time', async () => {
    const { resolveDueBossEncounter } = (await import('./bossEncounterService.js')) as any;
    const at = new Date(Date.now() + 1000);
    roundTimerRegistry.schedule('bossEncounter', 'boss-1', at, noIo);
    expect(roundTimerRegistry.size()).toBe(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(resolveDueBossEncounter).toHaveBeenCalledWith('boss-1', null);
    expect(roundTimerRegistry.size()).toBe(0);
  });

  it('cancel prevents resolver from firing', async () => {
    const { resolveDueBossEncounter } = (await import('./bossEncounterService.js')) as any;
    const at = new Date(Date.now() + 1000);
    roundTimerRegistry.schedule('bossEncounter', 'boss-1', at, noIo);
    roundTimerRegistry.cancel('bossEncounter', 'boss-1');

    await vi.advanceTimersByTimeAsync(2000);
    expect(resolveDueBossEncounter).not.toHaveBeenCalled();
    expect(roundTimerRegistry.size()).toBe(0);
  });

  it('rescheduling the same key clears the first timer', async () => {
    const { resolveDueBossEncounter } = (await import('./bossEncounterService.js')) as any;
    roundTimerRegistry.schedule('bossEncounter', 'boss-1', new Date(Date.now() + 500), noIo);
    roundTimerRegistry.schedule('bossEncounter', 'boss-1', new Date(Date.now() + 2000), noIo);

    await vi.advanceTimersByTimeAsync(600);
    expect(resolveDueBossEncounter).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1500);
    expect(resolveDueBossEncounter).toHaveBeenCalledTimes(1);
  });

  it('past-due delay fires immediately', async () => {
    const { resolveDueBossEncounter } = (await import('./bossEncounterService.js')) as any;
    const at = new Date(Date.now() - 10_000);
    roundTimerRegistry.schedule('bossEncounter', 'boss-1', at, noIo);

    await vi.advanceTimersByTimeAsync(0);
    expect(resolveDueBossEncounter).toHaveBeenCalledWith('boss-1', null);
  });

  it('expedition kind routes to expedition resolver', async () => {
    const { resolveDueExpeditionStep } = (await import('./expeditionRoundService.js')) as any;
    roundTimerRegistry.schedule('guildExpedition', 'exp-1', new Date(Date.now() + 100), noIo);

    await vi.advanceTimersByTimeAsync(100);
    expect(resolveDueExpeditionStep).toHaveBeenCalledWith('exp-1', null);
  });

  it('size() and keys() reflect current state', () => {
    roundTimerRegistry.schedule('bossEncounter', 'boss-1', new Date(Date.now() + 1000), noIo);
    roundTimerRegistry.schedule('guildExpedition', 'exp-1', new Date(Date.now() + 1000), noIo);
    expect(roundTimerRegistry.size()).toBe(2);
    expect(roundTimerRegistry.keys().sort()).toEqual(['bossEncounter:boss-1', 'guildExpedition:exp-1']);
  });
});

describe('roundTimerRegistry.rehydrate', () => {
  const noIo = () => null;

  beforeEach(() => {
    vi.useFakeTimers();
    roundTimerRegistry.clearAll();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('rehydrates pending boss and expedition rows from DB', async () => {
    const { prisma } = await import('@pocketrealm/database');
    const { resolveDueBossEncounter } = (await import('./bossEncounterService.js')) as any;
    const { resolveDueExpeditionStep } = (await import('./expeditionRoundService.js')) as any;

    const futureBoss = new Date(Date.now() + 5_000);
    const pastExp = new Date(Date.now() - 1_000);
    (prisma.bossEncounter.findMany as any).mockResolvedValueOnce([
      { id: 'boss-future', nextRoundAt: futureBoss },
    ]);
    (prisma.guildExpedition.findMany as any).mockResolvedValueOnce([
      { id: 'exp-past', nextRoundAt: pastExp },
    ]);

    await roundTimerRegistry.rehydrate(noIo);
    expect(roundTimerRegistry.size()).toBe(2);

    await vi.advanceTimersByTimeAsync(0);
    expect(resolveDueExpeditionStep).toHaveBeenCalledWith('exp-past', null);

    expect(resolveDueBossEncounter).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(resolveDueBossEncounter).toHaveBeenCalledWith('boss-future', null);
  });

  it('resolver error triggers bounded backoff retry', async () => {
    const { resolveDueBossEncounter } = (await import('./bossEncounterService.js')) as any;
    (resolveDueBossEncounter as any)
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(undefined);

    roundTimerRegistry.schedule('bossEncounter', 'boss-retry', new Date(Date.now() + 100), noIo);

    await vi.advanceTimersByTimeAsync(100);
    expect(resolveDueBossEncounter).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(resolveDueBossEncounter).toHaveBeenCalledTimes(2);
    expect(roundTimerRegistry.size()).toBe(0);
  });

  it('resolver error gives up after MAX_RETRY_ATTEMPTS', async () => {
    const { resolveDueBossEncounter } = (await import('./bossEncounterService.js')) as any;
    (resolveDueBossEncounter as any).mockRejectedValue(new Error('permanent'));

    roundTimerRegistry.schedule('bossEncounter', 'boss-dead', new Date(Date.now() + 100), noIo);

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(resolveDueBossEncounter).toHaveBeenCalledTimes(3);
    expect(roundTimerRegistry.size()).toBe(0);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(resolveDueBossEncounter).toHaveBeenCalledTimes(3);
  });
});
