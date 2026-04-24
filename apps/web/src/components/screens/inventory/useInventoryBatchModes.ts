import { useCallback } from 'react';
import { useBatchMode, type BatchMode } from '@/hooks/useBatchMode';

export type BackpackBatchModeKey = 'salvage' | 'stash' | 'sell';
export type StashBatchModeKey = 'withdraw' | 'sell' | 'salvage';

interface UseInventoryBatchModesOptions {
  batchLimit: number;
  salvageLimit: number;
  clearSelectedItem: () => void;
  clearSelectedStashItem: () => void;
}

interface InventoryBatchModes {
  salvageBatch: BatchMode;
  stashBatch: BatchMode;
  sellBatchMode: BatchMode;
  withdrawBatchMode: BatchMode;
  stashSellBatch: BatchMode;
  stashSalvageBatch: BatchMode;
  backpackBatchActive: boolean;
  stashBatchActive: boolean;
  activateBackpackMode: (mode: BackpackBatchModeKey) => void;
  resetAllBackpackModes: () => void;
  activateStashMode: (mode: StashBatchModeKey) => void;
  resetAllStashModes: () => void;
}

function activateMode(mode: BatchMode, modes: readonly BatchMode[]) {
  for (const currentMode of modes) {
    if (currentMode !== mode) {
      currentMode.reset();
    }
  }
  mode.activate();
}

function resetModes(modes: readonly BatchMode[]) {
  for (const mode of modes) {
    mode.reset();
  }
}

export function useInventoryBatchModes({
  batchLimit,
  salvageLimit,
  clearSelectedItem,
  clearSelectedStashItem,
}: UseInventoryBatchModesOptions): InventoryBatchModes {
  const salvageBatch = useBatchMode(salvageLimit);
  const stashBatch = useBatchMode(batchLimit);
  const sellBatchMode = useBatchMode(batchLimit);
  const withdrawBatchMode = useBatchMode(batchLimit);
  const stashSellBatch = useBatchMode(batchLimit);
  const stashSalvageBatch = useBatchMode(salvageLimit);

  const activateBackpackMode = useCallback((mode: BackpackBatchModeKey) => {
    const nextMode = mode === 'salvage'
      ? salvageBatch
      : mode === 'stash'
        ? stashBatch
        : sellBatchMode;
    activateMode(nextMode, [salvageBatch, stashBatch, sellBatchMode]);
    clearSelectedItem();
  }, [clearSelectedItem, salvageBatch, stashBatch, sellBatchMode]);

  const resetAllBackpackModes = useCallback(() => {
    resetModes([salvageBatch, stashBatch, sellBatchMode]);
  }, [salvageBatch, stashBatch, sellBatchMode]);

  const activateStashMode = useCallback((mode: StashBatchModeKey) => {
    const nextMode = mode === 'withdraw'
      ? withdrawBatchMode
      : mode === 'sell'
        ? stashSellBatch
        : stashSalvageBatch;
    activateMode(nextMode, [withdrawBatchMode, stashSellBatch, stashSalvageBatch]);
    clearSelectedStashItem();
  }, [clearSelectedStashItem, withdrawBatchMode, stashSellBatch, stashSalvageBatch]);

  const resetAllStashModes = useCallback(() => {
    resetModes([withdrawBatchMode, stashSellBatch, stashSalvageBatch]);
  }, [withdrawBatchMode, stashSellBatch, stashSalvageBatch]);

  return {
    salvageBatch,
    stashBatch,
    sellBatchMode,
    withdrawBatchMode,
    stashSellBatch,
    stashSalvageBatch,
    backpackBatchActive: salvageBatch.active || stashBatch.active || sellBatchMode.active,
    stashBatchActive: withdrawBatchMode.active || stashSellBatch.active || stashSalvageBatch.active,
    activateBackpackMode,
    resetAllBackpackModes,
    activateStashMode,
    resetAllStashModes,
  };
}
