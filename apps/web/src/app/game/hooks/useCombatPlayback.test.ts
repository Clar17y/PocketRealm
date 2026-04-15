import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCombatPlayback } from './useCombatPlayback';

describe('useCombatPlayback', () => {
  it('refreshes zones after combat playback completes', async () => {
    const refreshPendingEncounters = vi.fn().mockResolvedValue(undefined);
    const reloadZones = vi.fn().mockResolvedValue(undefined);
    const hook = renderHook(() => useCombatPlayback({
      combatLogPrefetch: {
        fetchLog: vi.fn(),
        getLog: vi.fn(),
        prefetch: vi.fn(),
        clear: vi.fn(),
      } as never,
      setLastCombat: vi.fn(),
      setPlaybackActive: vi.fn(),
      refreshPendingEncounters,
      reloadZones,
      advanceTutorial: vi.fn().mockResolvedValue(undefined),
      activeZoneIdRef: { current: 'zone-forest' },
      activatePendingLootRef: { current: vi.fn().mockResolvedValue(undefined) },
    }));

    act(() => {
      hook.result.current.setCombatPlaybackQueue([
        {
          mobName: 'Rat',
          mobDisplayName: 'Rat',
          mobTemplateId: 'rat-basic',
          mobPrefix: null,
          outcome: 'victory',
          combatantAMaxHp: 100,
          combatantBMaxHp: 10,
          log: [],
          playerStartHp: 100,
          rewards: { xp: 0, loot: [], skillXpGrants: [] },
        },
      ]);
    });

    await act(async () => {
      await hook.result.current.handleCombatPlaybackComplete();
    });

    expect(refreshPendingEncounters).toHaveBeenCalledTimes(1);
    expect(reloadZones).toHaveBeenCalledTimes(1);
  });
});
