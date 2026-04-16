import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExplorationPlayback } from './ExplorationPlayback';

describe('ExplorationPlayback external pauses', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('uses the latest external pause callbacks after a rerender', () => {
    const initialPauseSpy = vi.fn();
    const latestPauseSpy = vi.fn();
    const onComplete = vi.fn();

    const props = {
      totalTurns: 10,
      label: 'Exploring Forest Edge',
      events: [{
        turn: 4,
        type: 'zone_exit',
        description: 'You discovered a path leading to **Ancient Grove**.',
        details: {
          discoveredZoneId: 'zone-grove',
          discoveredZoneName: 'Ancient Grove',
        },
      }],
      aborted: false,
      refundedTurns: 0,
      onEventRevealed: vi.fn(),
      onCombatStart: vi.fn(),
      onComplete,
      onSkip: vi.fn(),
    };

    const { rerender } = render(
      React.createElement(ExplorationPlayback, {
        ...props,
        shouldPauseOnEvent: () => false,
        onEventPause: initialPauseSpy,
      }),
    );

    rerender(
      React.createElement(ExplorationPlayback, {
        ...props,
        shouldPauseOnEvent: () => true,
        onEventPause: latestPauseSpy,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(initialPauseSpy).not.toHaveBeenCalled();
    expect(latestPauseSpy).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(onComplete).not.toHaveBeenCalled();
  });
});
