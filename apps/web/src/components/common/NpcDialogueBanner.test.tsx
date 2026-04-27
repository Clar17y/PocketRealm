// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NPC_DIALOGUE_CONSTANTS, type NpcKey } from '@pocketrealm/shared';
import { getNpcActivityReaction } from '@/lib/api';
import { useNpcActivityReaction } from '../../hooks/useNpcActivityReaction';
import { NpcDialogueBanner } from './NpcDialogueBanner';

vi.mock('../../lib/npcLineRotation', () => ({
  getNextNpcLine: vi.fn(() => 'Normal line'),
}));

vi.mock('../../hooks/useSessionStorageToggle', () => ({
  useSessionStorageToggle: () => [true, vi.fn()] as const,
}));

vi.mock('../../hooks/useNpcActivityReaction', () => ({
  useNpcActivityReaction: vi.fn(() => null),
}));

vi.mock('@/lib/api', () => ({
  getNpcActivityReaction: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('NpcDialogueBanner', () => {
  it('renders an activity priority line before normal rotation', () => {
    render(
      <NpcDialogueBanner
        npcKey="millbrook-blacksmith"
        event="greeting"
        showDialogue
        activityLine="An Epic Steel Greatsword, was it? Good."
      />,
    );

    expect(screen.getByText(/Epic Steel Greatsword/)).toBeTruthy();
    expect(screen.queryByText(/Normal line/)).toBeNull();
    expect(vi.mocked(useNpcActivityReaction)).toHaveBeenCalledWith('millbrook-blacksmith', false);
  });

  it('clears a fetched activity line when the NPC key changes', async () => {
    const getNpcActivityReactionMock = vi.mocked(getNpcActivityReaction);
    const { useNpcActivityReaction } =
      await vi.importActual<typeof import('../../hooks/useNpcActivityReaction')>(
        '../../hooks/useNpcActivityReaction',
      );

    getNpcActivityReactionMock
      .mockResolvedValueOnce({
        data: { reaction: { activityId: 'activity-1', eventType: 'rare_loot', line: 'Blacksmith line' } },
      })
      .mockReturnValueOnce(new Promise(() => {}));

    const hook = renderHook(
      ({ npcKey }: { npcKey: NpcKey }) => useNpcActivityReaction(npcKey, true),
      { initialProps: { npcKey: 'millbrook-blacksmith' } },
    );

    await waitFor(() => expect(hook.result.current).toBe('Blacksmith line'));

    hook.rerender({ npcKey: 'millbrook-alchemist' });

    expect(hook.result.current).toBeNull();
  });

  it('clears a fetched activity line after the activity display window', async () => {
    vi.useFakeTimers();
    const getNpcActivityReactionMock = vi.mocked(getNpcActivityReaction);
    const { useNpcActivityReaction } =
      await vi.importActual<typeof import('../../hooks/useNpcActivityReaction')>(
        '../../hooks/useNpcActivityReaction',
      );

    getNpcActivityReactionMock.mockResolvedValue({
      data: { reaction: { activityId: 'activity-1', eventType: 'rare_loot', line: 'Temporary activity line' } },
    });

    const hook = renderHook(() => useNpcActivityReaction('millbrook-blacksmith', true));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hook.result.current).toBe('Temporary activity line');

    act(() => {
      vi.advanceTimersByTime(NPC_DIALOGUE_CONSTANTS.ACTION_DURATION_MS);
    });

    expect(hook.result.current).toBeNull();
  });
});
