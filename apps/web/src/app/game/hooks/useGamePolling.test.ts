import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGamePolling } from './useGamePolling';

const { getTurns, getHpState, getResources } = vi.hoisted(() => ({
  getTurns: vi.fn(),
  getHpState: vi.fn(),
  getResources: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  getTurns,
  getHpState,
  getResources,
}));

describe('useGamePolling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('polls turns, hp, and resources when the active screen needs them', async () => {
    getTurns.mockResolvedValue({ data: { currentTurns: 42 } });
    getHpState.mockResolvedValue({ data: { currentHp: 8, maxHp: 10, regenPerSecond: 1, isRecovering: false, recoveryCost: null } });
    getResources.mockResolvedValue({
      data: {
        stamina: { current: 5, max: 10, regenPerRound: 1, regenPerSecond: 1, restHealPerTurn: 1 },
        mana: { current: 4, max: 10, regenPerRound: 1, regenPerSecond: 1, restHealPerTurn: 1 },
      },
    });
    const setTurns = vi.fn();
    const setHpState = vi.fn();
    const setStaminaState = vi.fn();
    const setManaState = vi.fn();

    const { result } = renderHook(() => useGamePolling({
      activeScreenRef: { current: 'home' },
      hpStateRef: { current: { currentHp: 8, maxHp: 10 } },
      staminaStateRef: { current: { current: 5, max: 10 } },
      manaStateRef: { current: { current: 4, max: 10 } },
      setTurns,
      setHpState,
      setStaminaState,
      setManaState,
    }));

    await act(async () => {
      await result.current();
    });

    expect(setTurns).toHaveBeenCalledWith(42);
    expect(setHpState).toHaveBeenCalledWith({ currentHp: 8, maxHp: 10, regenPerSecond: 1, isRecovering: false, recoveryCost: null });
    expect(setStaminaState).toHaveBeenCalledWith({ current: 5, max: 10, regenPerRound: 1, regenPerSecond: 1, restHealPerTurn: 1 });
    expect(setManaState).toHaveBeenCalledWith({ current: 4, max: 10, regenPerRound: 1, regenPerSecond: 1, restHealPerTurn: 1 });
  });

  it('dispatches api error events when the turn poll fails', async () => {
    getTurns.mockResolvedValue({ error: { message: 'Offline', code: 'NETWORK_ERROR' } });
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

    const { result } = renderHook(() => useGamePolling({
      activeScreenRef: { current: 'home' },
      hpStateRef: { current: { currentHp: 10, maxHp: 10 } },
      staminaStateRef: { current: { current: 10, max: 10 } },
      manaStateRef: { current: { current: 10, max: 10 } },
      setTurns: vi.fn(),
      setHpState: vi.fn(),
      setStaminaState: vi.fn(),
      setManaState: vi.fn(),
    }));

    await act(async () => {
      await result.current();
    });

    expect(dispatchEventSpy).toHaveBeenCalledTimes(2);
    expect(dispatchEventSpy.mock.calls[0][0]).toMatchObject({
      type: 'api:reachable',
      detail: { ok: false },
    });
    expect(dispatchEventSpy.mock.calls[1][0]).toMatchObject({
      type: 'api:error',
      detail: { message: 'Offline', code: 'NETWORK_ERROR' },
    });
  });
});
