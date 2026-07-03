import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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

type BossEncounterApiResult = Awaited<ReturnType<typeof getBossEncounter>>;
type BossEncounterPanelProps = React.ComponentProps<typeof BossEncounterPanel>;

function bossEncounterResponse(currentHp: number): BossEncounterApiResult {
  return {
    data: {
      encounter: {
        id: 'enc-1',
        eventId: 'evt-1',
        mobTemplateId: 'mob-alpha',
        currentHp,
        maxHp: 1000,
        baseHp: 1000,
        roundNumber: 3,
        nextRoundAt: null,
        status: 'in_progress' as const,
        killedBy: null,
        killedByUsername: null,
        mobName: 'Alpha Wolf',
        mobLevel: 10,
        bossEffects: [],
        roundSummaries: null,
      },
      participants: [],
      myRewards: null,
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

function bossPanelProps(overrides: Partial<BossEncounterPanelProps> = {}): BossEncounterPanelProps {
  return {
    encounterId: 'enc-1',
    playerId: 'player-1',
    refreshSignal: 0,
    ...overrides,
  };
}

describe('BossEncounterPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveTemplate).mockResolvedValue({ data: { slots: [] }, error: null } as never);
    vi.mocked(getTemplates).mockResolvedValue({ data: { templates: [] }, error: null } as never);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('refetches boss encounter details when the parent refresh signal changes', async () => {
    vi.mocked(getBossEncounter)
      .mockResolvedValueOnce(bossEncounterResponse(900))
      .mockResolvedValueOnce(bossEncounterResponse(600));

    const initialProps = bossPanelProps();

    const { rerender } = render(<BossEncounterPanel {...initialProps} />);

    await waitFor(() => expect(getBossEncounter).toHaveBeenCalledTimes(1));
    expect(screen.getByText('90%')).toBeTruthy();

    rerender(
      <BossEncounterPanel
        {...initialProps}
        refreshSignal={1}
      />,
    );

    await waitFor(() => expect(getBossEncounter).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('60%')).toBeTruthy());
    expect(startLoadMock).toHaveBeenLastCalledWith(true);
    expect(endLoadMock).toHaveBeenLastCalledWith(true);
  });

  it('does not let an older boss detail response overwrite a newer refresh response', async () => {
    const initialRequest = createDeferred<BossEncounterApiResult>();
    const refreshRequest = createDeferred<BossEncounterApiResult>();
    vi.mocked(getBossEncounter)
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(refreshRequest.promise);

    const initialProps = bossPanelProps();

    const { rerender } = render(<BossEncounterPanel {...initialProps} />);

    await waitFor(() => expect(getBossEncounter).toHaveBeenCalledTimes(1));

    rerender(
      <BossEncounterPanel
        {...initialProps}
        refreshSignal={1}
      />,
    );

    await waitFor(() => expect(getBossEncounter).toHaveBeenCalledTimes(2));

    await act(async () => {
      refreshRequest.resolve(bossEncounterResponse(600));
      await Promise.resolve();
    });
    expect(screen.getByText('60%')).toBeTruthy();

    await act(async () => {
      initialRequest.resolve(bossEncounterResponse(900));
      await Promise.resolve();
    });

    expect(screen.getByText('60%')).toBeTruthy();
    expect(screen.queryByText('90%')).toBeNull();
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
