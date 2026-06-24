import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BossEncounterPanel } from './BossEncounterPanel';
import { getActiveTemplate, getBossEncounter, getTemplates } from '@/lib/api';

const { startLoadMock, endLoadMock } = vi.hoisted(() => ({
  startLoadMock: vi.fn(),
  endLoadMock: vi.fn(),
}));

vi.mock('@/hooks/useSilentRefresh', () => ({
  useSilentRefresh: () => ({
    loading: false,
    refreshing: false,
    startLoad: startLoadMock,
    endLoad: endLoadMock,
  }),
}));

vi.mock('@/lib/api', () => ({
  getBossEncounter: vi.fn(),
  getActiveTemplate: vi.fn(),
  getTemplates: vi.fn(),
  signUpForBoss: vi.fn(),
}));

describe('BossEncounterPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveTemplate).mockResolvedValue({ data: { slots: [] }, error: null } as never);
    vi.mocked(getTemplates).mockResolvedValue({ data: { templates: [] }, error: null } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('notifies parent to refresh inventory when defeated boss rewards load', async () => {
    vi.mocked(getBossEncounter).mockResolvedValue({
      data: {
        encounter: {
          id: 'enc-1',
          eventId: 'evt-1',
          mobTemplateId: 'mob-alpha',
          currentHp: 0,
          maxHp: 1000,
          baseHp: 1000,
          roundNumber: 80,
          nextRoundAt: null,
          status: 'defeated',
          killedBy: 'barbarian',
          killedByUsername: 'Barbarian',
          mobName: 'Alpha Wolf',
          mobLevel: 10,
          bossEffects: [],
          roundSummaries: null,
        },
        participants: [],
        myRewards: {
          loot: [{ itemTemplateId: 'fang-template', quantity: 2, rarity: 'common', itemName: 'Alpha Wolf Fang' }],
        },
      },
      error: null,
    } as never);

    const onRewardsLoaded = vi.fn();
    const { rerender } = render(
      <BossEncounterPanel
        encounterId="enc-1"
        playerId="player-1"
        onRewardsLoaded={onRewardsLoaded}
      />,
    );

    await waitFor(() => expect(onRewardsLoaded).toHaveBeenCalledTimes(1));

    rerender(
      <BossEncounterPanel
        encounterId="enc-1"
        playerId="player-1"
        onRewardsLoaded={onRewardsLoaded}
      />,
    );

    expect(onRewardsLoaded).toHaveBeenCalledTimes(1);
  });

  it('retries reward inventory sync when the first refresh fails', async () => {
    vi.useFakeTimers();
    vi.mocked(getBossEncounter).mockResolvedValue({
      data: {
        encounter: {
          id: 'enc-1',
          eventId: 'evt-1',
          mobTemplateId: 'mob-alpha',
          currentHp: 0,
          maxHp: 1000,
          baseHp: 1000,
          roundNumber: 80,
          nextRoundAt: null,
          status: 'defeated',
          killedBy: 'barbarian',
          killedByUsername: 'Barbarian',
          mobName: 'Alpha Wolf',
          mobLevel: 10,
          bossEffects: [],
          roundSummaries: null,
        },
        participants: [],
        myRewards: {
          loot: [{ itemTemplateId: 'fang-template', quantity: 2, rarity: 'common', itemName: 'Alpha Wolf Fang' }],
        },
      },
      error: null,
    } as never);

    const onRewardsLoaded = vi.fn()
      .mockRejectedValueOnce(new Error('inventory refresh failed'))
      .mockResolvedValueOnce(undefined);

    render(
      <BossEncounterPanel
        encounterId="enc-1"
        playerId="player-1"
        onRewardsLoaded={onRewardsLoaded}
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onRewardsLoaded).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });

    expect(onRewardsLoaded).toHaveBeenCalledTimes(2);
  });
});
