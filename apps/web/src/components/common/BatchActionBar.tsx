'use client';

import { PixelButton } from '@/components/PixelButton';
import type { BatchMode } from '@/hooks/useBatchMode';

interface BatchActionBarProps {
  batch: BatchMode;
  limit: number;
  eligibleIds: string[];
  /** Text shown on the action button, e.g. "Salvage All" */
  actionLabel: string;
  /** Optional override when action is blocked (e.g. "Backpack Full") */
  disabledLabel?: string;
  /** Extra disable condition beyond empty selection / busy */
  actionDisabled?: boolean;
  /** Optional extra text after the counter, e.g. "(120 turns)" */
  counterSuffix?: string;
  onAction: () => void | Promise<void>;
}

export function BatchActionBar({
  batch, limit, eligibleIds, actionLabel, disabledLabel, actionDisabled = false, counterSuffix, onAction,
}: BatchActionBarProps) {
  const allSelected = batch.isAllSelected(eligibleIds.length);

  return (
    <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--rpg-text-primary)]">
          {batch.selection.size}/{limit} selected
          {counterSuffix && batch.selection.size > 0 && (
            <span> {counterSuffix}</span>
          )}
        </div>
        <button
          type="button"
          onClick={batch.reset}
          className="text-xs text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]"
        >
          Cancel
        </button>
      </div>
      <div className="flex gap-2">
        {eligibleIds.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (allSelected) {
                batch.deselectAll();
              } else {
                batch.selectAll(eligibleIds);
              }
            }}
            className="text-xs text-[var(--rpg-gold)] hover:underline"
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
        )}
        <div className="flex-1" />
        <PixelButton
          variant="primary"
          size="sm"
          disabled={batch.selection.size === 0 || batch.busy || actionDisabled}
          onClick={onAction}
        >
          {actionDisabled && disabledLabel ? disabledLabel : actionLabel}
        </PixelButton>
      </div>
    </div>
  );
}

interface BatchCheckboxOverlayProps {
  selected: boolean;
}

export function BatchCheckboxOverlay({ selected }: BatchCheckboxOverlayProps) {
  return (
    <div className={`absolute top-0.5 right-0.5 w-5 h-5 rounded border-2 flex items-center justify-center pointer-events-none ${
      selected
        ? 'border-[var(--rpg-gold)] bg-[var(--rpg-gold)]'
        : 'border-[var(--rpg-text-secondary)] bg-[var(--rpg-surface)]'
    }`}>
      {selected && <span className="text-[var(--rpg-background)] text-xs font-bold">&#10003;</span>}
    </div>
  );
}

export function BatchDimOverlay() {
  return <div className="absolute inset-0 bg-black/50 rounded-lg pointer-events-none" />;
}
