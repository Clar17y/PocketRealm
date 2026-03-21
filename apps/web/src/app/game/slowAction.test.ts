import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UI_TIMING_CONSTANTS } from '@pocketrealm/shared';

describe('runAction slow-action timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets slowAction to true after 10s', async () => {
    let resolveAction: () => void;
    const actionPromise = new Promise<void>((resolve) => { resolveAction = resolve; });

    let slowAction = false;
    const setSlowAction = (v: boolean) => { slowAction = v; };
    let busyAction: string | null = null;
    const setBusyAction = (v: string | null) => { busyAction = v; };
    const setActionError = vi.fn();

    const runAction = async (actionName: string, fn: () => Promise<void>) => {
      if (busyAction) return;
      setBusyAction(actionName);
      setActionError(null);
      setSlowAction(false);
      const timer = setTimeout(() => setSlowAction(true), UI_TIMING_CONSTANTS.SLOW_ACTION_THRESHOLD_MS);
      try {
        await fn();
      } finally {
        clearTimeout(timer);
        setBusyAction(null);
        setSlowAction(false);
      }
    };

    const promise = runAction('test', () => actionPromise);

    // Before 10s
    vi.advanceTimersByTime(UI_TIMING_CONSTANTS.SLOW_ACTION_THRESHOLD_MS - 1);
    expect(slowAction).toBe(false);
    expect(busyAction).toBe('test');

    // At 10s
    vi.advanceTimersByTime(1);
    expect(slowAction).toBe(true);

    // Resolve action
    resolveAction!();
    await promise;

    expect(slowAction).toBe(false);
    expect(busyAction).toBeNull();
  });

  it('does not set slowAction if action completes before 10s', async () => {
    let slowAction = false;
    const setSlowAction = (v: boolean) => { slowAction = v; };
    let busyAction: string | null = null;
    const setBusyAction = (v: string | null) => { busyAction = v; };
    const setActionError = vi.fn();

    const runAction = async (actionName: string, fn: () => Promise<void>) => {
      if (busyAction) return;
      setBusyAction(actionName);
      setActionError(null);
      setSlowAction(false);
      const timer = setTimeout(() => setSlowAction(true), UI_TIMING_CONSTANTS.SLOW_ACTION_THRESHOLD_MS);
      try {
        await fn();
      } finally {
        clearTimeout(timer);
        setBusyAction(null);
        setSlowAction(false);
      }
    };

    await runAction('test', async () => {});

    vi.advanceTimersByTime(15_000);
    expect(slowAction).toBe(false);
  });
});
