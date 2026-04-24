import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePlayerSettings } from './usePlayerSettings';

vi.mock('@/lib/api', () => ({
  updatePlayerSettings: vi.fn(),
}));

describe('usePlayerSettings', () => {
  it('keeps server hydration callback stable across hydrated settings updates', () => {
    const { result, rerender } = renderHook(() => usePlayerSettings());
    const hydrateFromServer = result.current.initSettingsFromServer;

    act(() => {
      hydrateFromServer({
        combatLogSpeedMs: 400,
        explorationSpeedMs: 500,
        autoSkipKnownCombat: true,
        defaultExploreTurns: 75,
        quickRestHealPercent: 50,
        defaultRefiningMax: true,
        lowHpWarning: false,
        confirmRarity: 'rare',
        lootRevealRarity: 'epic',
        forgeConfirmRarity: 'legendary',
        homeTownId: 'zone-town',
        showNpcDialogue: false,
        showItemFlavourText: false,
        showBestiaryLore: false,
        notifyPvpAttack: false,
        notifyPvpScout: false,
        notifyBossAppeared: false,
        notifyBossKilled: false,
        notifyTurnBankFull: false,
        notifyExpeditionStarted: false,
        notifyExpeditionFinished: false,
      });
    });

    expect(result.current.initSettingsFromServer).toBe(hydrateFromServer);

    rerender();

    expect(result.current.initSettingsFromServer).toBe(hydrateFromServer);
  });
});
