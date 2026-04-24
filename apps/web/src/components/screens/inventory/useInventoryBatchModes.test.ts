import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useInventoryBatchModes } from './useInventoryBatchModes';

describe('useInventoryBatchModes', () => {
  it('activates one backpack mode at a time and clears the selected backpack item', () => {
    const clearSelectedItem = vi.fn();
    const clearSelectedStashItem = vi.fn();
    const { result } = renderHook(() => useInventoryBatchModes({
      batchLimit: 50,
      salvageLimit: 10,
      clearSelectedItem,
      clearSelectedStashItem,
    }));

    act(() => {
      result.current.activateBackpackMode('salvage');
      result.current.salvageBatch.toggle('salvage-item');
      result.current.activateBackpackMode('sell');
    });

    expect(result.current.salvageBatch.active).toBe(false);
    expect(result.current.salvageBatch.selection.size).toBe(0);
    expect(result.current.sellBatchMode.active).toBe(true);
    expect(result.current.backpackBatchActive).toBe(true);
    expect(clearSelectedItem).toHaveBeenCalledTimes(2);
    expect(clearSelectedStashItem).not.toHaveBeenCalled();
  });

  it('activates one stash mode at a time and clears the selected stash item', () => {
    const clearSelectedItem = vi.fn();
    const clearSelectedStashItem = vi.fn();
    const { result } = renderHook(() => useInventoryBatchModes({
      batchLimit: 50,
      salvageLimit: 10,
      clearSelectedItem,
      clearSelectedStashItem,
    }));

    act(() => {
      result.current.activateStashMode('withdraw');
      result.current.withdrawBatchMode.toggle('stash-item');
      result.current.activateStashMode('sell');
    });

    expect(result.current.withdrawBatchMode.active).toBe(false);
    expect(result.current.withdrawBatchMode.selection.size).toBe(0);
    expect(result.current.stashSellBatch.active).toBe(true);
    expect(result.current.stashBatchActive).toBe(true);
    expect(clearSelectedStashItem).toHaveBeenCalledTimes(2);
    expect(clearSelectedItem).not.toHaveBeenCalled();
  });

  it('resets all modes in each group', () => {
    const { result } = renderHook(() => useInventoryBatchModes({
      batchLimit: 50,
      salvageLimit: 10,
      clearSelectedItem: vi.fn(),
      clearSelectedStashItem: vi.fn(),
    }));

    act(() => {
      result.current.activateBackpackMode('stash');
      result.current.activateStashMode('salvage');
      result.current.resetAllBackpackModes();
      result.current.resetAllStashModes();
    });

    expect(result.current.backpackBatchActive).toBe(false);
    expect(result.current.stashBatchActive).toBe(false);
    expect(result.current.stashBatch.active).toBe(false);
    expect(result.current.stashSalvageBatch.active).toBe(false);
  });
});
