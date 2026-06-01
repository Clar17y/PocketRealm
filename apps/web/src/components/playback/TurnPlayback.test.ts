import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TurnPlayback } from './TurnPlayback';

describe('TurnPlayback zone discovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('pauses on a discovered zone exit until the modal is dismissed', () => {
    const onComplete = vi.fn();
    const onPushLog = vi.fn();

    render(
      React.createElement(TurnPlayback, {
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
        playerHpBefore: 100,
        playerMaxHp: 100,
        onComplete,
        onSkip: vi.fn(),
        onPushLog,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByText('New Zone Discovered')).toBeTruthy();
    expect(onPushLog).toHaveBeenCalledTimes(1);
    expect(onPushLog).toHaveBeenCalledWith({
      timestamp: expect.any(String),
      type: 'success',
      message: 'Turn 4: Discovered Ancient Grove.',
    });

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(onComplete).not.toHaveBeenCalled();
    expect(onPushLog).toHaveBeenCalledTimes(1);
  });

  it('resumes after dismissing the discovery modal and completes playback', () => {
    const onComplete = vi.fn();

    render(
      React.createElement(TurnPlayback, {
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
        playerHpBefore: 100,
        playerMaxHp: 100,
        onComplete,
        onSkip: vi.fn(),
      }),
    );

    act(() => {
      vi.advanceTimersByTime(800);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('surfaces a discovered zone modal before finalizing a skipped playback', () => {
    const onSkip = vi.fn();

    render(
      React.createElement(TurnPlayback, {
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
        playerHpBefore: 100,
        playerMaxHp: 100,
        onComplete: vi.fn(),
        onSkip,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(screen.getByText('New Zone Discovered')).toBeTruthy();
    expect(screen.getByText('Ancient Grove')).toBeTruthy();
    expect(onSkip).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('does not show a second discovery modal when skipping after the discovery was already shown', () => {
    const onSkip = vi.fn();

    render(
      React.createElement(TurnPlayback, {
        totalTurns: 10,
        label: 'Exploring Forest Edge',
        events: [
          {
            turn: 4,
            type: 'zone_exit',
            description: 'You discovered a path leading to **Ancient Grove**.',
            details: {
              discoveredZoneId: 'zone-grove',
              discoveredZoneName: 'Ancient Grove',
            },
          },
          {
            turn: 9,
            type: 'hidden_cache',
            description: 'You found a hidden cache.',
          },
        ],
        aborted: false,
        refundedTurns: 0,
        playerHpBefore: 100,
        playerMaxHp: 100,
        onComplete: vi.fn(),
        onSkip,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByText('New Zone Discovered')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(screen.queryByText('New Zone Discovered')).toBeNull();
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
