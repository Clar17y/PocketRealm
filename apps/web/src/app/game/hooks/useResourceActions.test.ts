import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useResourceActions } from './useResourceActions';

const apiMock = vi.hoisted(() => ({
  allocatePlayerAttribute: vi.fn(),
  getHpState: vi.fn(),
  rest: vi.fn(),
  restEstimate: vi.fn(),
}));

const applyStateUpdatesMock = vi.hoisted(() => ({
  applyStateUpdates: vi.fn(),
}));

const analyticsMock = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}));

vi.mock('@/lib/analytics', () => analyticsMock);
vi.mock('@/lib/api', () => apiMock);
vi.mock('../applyStateUpdates', () => applyStateUpdatesMock);
vi.mock('./useActivityLog', () => ({
  nowStamp: () => '2026-06-22T12:00:00.000Z',
}));

const fullHpState = {
  currentHp: 100,
  maxHp: 100,
  regenPerSecond: 0.4,
  isRecovering: false,
  recoveryCost: null,
};

const fullStaminaState = {
  current: 100,
  max: 100,
  regenPerRound: 10,
  regenPerSecond: 1,
  restHealPerTurn: 5,
};

const fullManaState = {
  current: 50,
  max: 50,
  regenPerRound: 5,
  regenPerSecond: 0.5,
  restHealPerTurn: 3,
};

function buildHook({
  hpState = fullHpState,
  staminaState = fullStaminaState,
  manaState = fullManaState,
  turns = 100,
} = {}) {
  const pushLog = vi.fn();
  const setTurns = vi.fn();
  const setActionError = vi.fn();

  const hook = renderHook(() => useResourceActions({
    hpState,
    staminaState,
    manaState,
    turns,
    quickRestHealPercent: 100,
    tutorialStep: 0,
    runAction: async (_name, fn) => { await fn(); },
    pushLog,
    setTurns,
    setActionError,
    setCharacterProgression: vi.fn(),
    setHpState: vi.fn(),
    stateSetters: {} as never,
    advanceTutorial: vi.fn(),
  }));

  return {
    ...hook,
    pushLog,
    setActionError,
    setTurns,
  };
}

describe('useResourceActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.restEstimate.mockResolvedValue({ data: { healPerTurn: 2 } });
    apiMock.rest.mockResolvedValue({
      data: {
        previousHp: 100,
        healedAmount: 0,
        currentHp: 100,
        maxHp: 100,
        turnsSpent: 30,
        turns: { currentTurns: 70 },
        tax: null,
        stateUpdates: {
          resources: {
            stamina: { ...fullStaminaState },
            mana: { ...fullManaState },
          },
        },
      },
    });
  });

  it('rests when HP is full but stamina is missing and spends enough turns to refill stamina', async () => {
    const hook = buildHook({
      staminaState: { ...fullStaminaState, current: 20 },
    });

    await act(async () => {
      await hook.result.current.handleQuickRest();
    });

    expect(apiMock.rest).toHaveBeenCalledWith(20);
  });

  it('rests when HP is full but mana is missing and spends enough turns to refill mana', async () => {
    const hook = buildHook({
      manaState: { ...fullManaState, current: 5 },
    });

    await act(async () => {
      await hook.result.current.handleQuickRest();
    });

    expect(apiMock.rest).toHaveBeenCalledWith(20);
  });

  it('inflates requested turns so taxed quick rest still has enough effective turns', async () => {
    apiMock.restEstimate.mockResolvedValueOnce({ data: { healPerTurn: 2, taxRate: 10 } });
    const hook = buildHook({
      staminaState: { ...fullStaminaState, current: 0 },
    });

    await act(async () => {
      await hook.result.current.handleQuickRest();
    });

    expect(apiMock.restEstimate).toHaveBeenCalledWith(10);
    expect(apiMock.rest).toHaveBeenCalledWith(30);
  });

  it('uses the largest rounded turn need across HP, stamina, and mana', async () => {
    const hook = buildHook({
      hpState: { ...fullHpState, currentHp: 80 },
      staminaState: { ...fullStaminaState, current: 0 },
      manaState: { ...fullManaState, current: 5 },
    });

    await act(async () => {
      await hook.result.current.handleQuickRest();
    });

    expect(apiMock.rest).toHaveBeenCalledWith(20);
  });

  it('logs and tracks server-reported turns spent', async () => {
    apiMock.rest.mockResolvedValueOnce({
      data: {
        previousHp: 100,
        healedAmount: 0,
        currentHp: 100,
        maxHp: 100,
        turnsSpent: 12,
        turns: { currentTurns: 88 },
        tax: null,
        stateUpdates: {},
      },
    });
    const hook = buildHook({
      staminaState: { ...fullStaminaState, current: 20 },
    });

    await act(async () => {
      await hook.result.current.handleQuickRest();
    });

    expect(hook.pushLog).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Rested 12 turns, healed 0 HP',
    }));
    expect(analyticsMock.trackEvent).toHaveBeenCalledWith('action', { type: 'rest', turns: 12 });
  });
});
