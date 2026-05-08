import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouletteRound } from './useRouletteRound';

const { getRouletteRound, getRouletteHistory, getRouletteStats } = vi.hoisted(() => ({
  getRouletteRound: vi.fn(),
  getRouletteHistory: vi.fn(),
  getRouletteStats: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  getRouletteRound,
  getRouletteHistory,
  getRouletteStats,
}));

const originalVisibilityStateDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
let focused = true;

function restoreVisibilityState(): void {
  if (originalVisibilityStateDescriptor) {
    Object.defineProperty(document, 'visibilityState', originalVisibilityStateDescriptor);
  } else {
    delete (document as Document & { visibilityState?: DocumentVisibilityState }).visibilityState;
  }
}

describe('useRouletteRound', () => {
  beforeEach(() => {
    focused = true;
    vi.clearAllMocks();
    getRouletteRound.mockResolvedValue({
      data: {
        roundId: 'round-1',
        phase: 'betting',
        timeRemainingMs: 12000,
        result: null,
        bets: [],
      },
    });
    getRouletteHistory.mockResolvedValue({
      data: {
        history: [{ spinNumber: 1, result: 7 }],
      },
    });
    getRouletteStats.mockResolvedValue({
      data: {
        stats: [{ number: 7, count: 4 }],
      },
    });
  });

  afterEach(() => {
    restoreVisibilityState();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('loads the round state and history on mount', async () => {
    const { result } = renderHook(() => useRouletteRound());

    await waitFor(() => {
      expect(result.current.roundState?.roundId).toBe('round-1');
      expect(result.current.history).toEqual([{ spinNumber: 1, result: 7 }]);
    });

    expect(getRouletteRound).toHaveBeenCalledTimes(1);
    expect(getRouletteHistory).toHaveBeenCalledTimes(1);
  });

  it('loads and clears heat-map stats when toggled', async () => {
    const { result } = renderHook(() => useRouletteRound());

    await waitFor(() => {
      expect(result.current.roundState?.roundId).toBe('round-1');
    });

    act(() => {
      result.current.setShowHeatMap(true);
    });

    await waitFor(() => {
      expect(getRouletteStats).toHaveBeenCalledTimes(1);
      expect(result.current.numberStats).toEqual([{ number: 7, count: 4 }]);
    });

    act(() => {
      result.current.setShowHeatMap(false);
    });

    expect(result.current.numberStats).toBeNull();
  });

  it('does not keep polling roulette rounds while the window is blurred', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T12:00:00.000Z'));
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });

    renderHook(() => useRouletteRound());

    await act(async () => {
      await Promise.resolve();
    });
    expect(getRouletteRound).toHaveBeenCalledTimes(1);

    focused = false;
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(getRouletteRound).toHaveBeenCalledTimes(1);
  });
});
