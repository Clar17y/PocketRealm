import { ItemCard } from '@/components/ItemCard';
import { PixelButton } from '@/components/PixelButton';
import { BatchActionBar, BatchCheckboxOverlay, BatchDimOverlay } from '@/components/common/BatchActionBar';
import type { BatchMode } from '@/hooks/useBatchMode';
import { getStaggerDelay } from '@/lib/animations';
import type { InventoryItem } from './inventory.types';
import type { BackpackBatchModeKey } from './useInventoryBatchModes';
import { runInventoryBatchAction } from './runInventoryBatchAction';

interface BackpackPanelProps {
  items: InventoryItem[];
  capacity: number;
  usedSlots: number;
  isInTown: boolean;
  noFacility: boolean;
  batch: {
    salvage: BatchMode;
    stash: BatchMode;
    sell: BatchMode;
    active: boolean;
    salvageLimit: number;
    batchLimit: number;
    salvageableIds: string[];
    stashableIds: string[];
    sellableIds: string[];
    totalSalvageCost: number;
    totalSellGold: number;
    activateMode: (mode: BackpackBatchModeKey) => void;
  };
  actions: {
    onSelectItem: (item: InventoryItem) => void;
    onBatchError: (message: string | null) => void;
    onSalvageBatch?: (itemIds: string[]) => void | Promise<void>;
    onDepositBatch?: (itemIds: string[]) => void | Promise<void>;
    onSellBatch?: (itemIds: string[]) => void | Promise<void>;
  };
}

export function BackpackPanel({
  items,
  capacity,
  usedSlots,
  isInTown,
  noFacility,
  batch,
  actions,
}: BackpackPanelProps) {
  return (
    <>
      {batch.salvage.active ? (
        <BatchActionBar
          batch={batch.salvage}
          limit={batch.salvageLimit}
          eligibleIds={batch.salvageableIds}
          actionLabel="Salvage All"
          counterSuffix={
            batch.salvage.selection.size > 0
              ? batch.totalSalvageCost > 0 ? `(${batch.totalSalvageCost} turns)` : '(Free)'
              : undefined
          }
          onAction={() => runInventoryBatchAction({
            batch: batch.salvage,
            action: actions.onSalvageBatch
              ? async () => {
                  await actions.onSalvageBatch?.([...batch.salvage.selection]);
                }
              : undefined,
            onError: actions.onBatchError,
            errorMessage: 'Salvage failed',
          })}
        />
      ) : batch.stash.active ? (
        <BatchActionBar
          batch={batch.stash}
          limit={batch.batchLimit}
          eligibleIds={batch.stashableIds}
          actionLabel="Stash Selected"
          onAction={() => runInventoryBatchAction({
            batch: batch.stash,
            action: actions.onDepositBatch
              ? async () => {
                  await actions.onDepositBatch?.([...batch.stash.selection]);
                }
              : undefined,
            onError: actions.onBatchError,
            errorMessage: 'Stash failed',
          })}
        />
      ) : batch.sell.active ? (
        <BatchActionBar
          batch={batch.sell}
          limit={batch.batchLimit}
          eligibleIds={batch.sellableIds}
          actionLabel="Sell Selected"
          counterSuffix={
            batch.sell.selection.size > 0 && batch.totalSellGold > 0
              ? `(${batch.totalSellGold} gold)`
              : undefined
          }
          onAction={() => runInventoryBatchAction({
            batch: batch.sell,
            action: actions.onSellBatch
              ? async () => {
                  await actions.onSellBatch?.([...batch.sell.selection]);
                }
              : undefined,
            onError: actions.onBatchError,
            errorMessage: 'Sell failed',
          })}
        />
      ) : (
        <div className="flex justify-end gap-2">
          {actions.onSellBatch && isInTown && (
            <PixelButton
              variant="gold"
              size="sm"
              onClick={() => batch.activateMode('sell')}
            >
              Sell Mode
            </PixelButton>
          )}
          {actions.onDepositBatch && isInTown && (
            <PixelButton
              variant="secondary"
              size="sm"
              onClick={() => batch.activateMode('stash')}
            >
              Stash Mode
            </PixelButton>
          )}
          {actions.onSalvageBatch && !noFacility && (
            <PixelButton
              variant="primary"
              size="sm"
              onClick={() => batch.activateMode('salvage')}
            >
              Salvage Mode
            </PixelButton>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className={`text-sm font-semibold ${usedSlots > capacity ? 'text-[var(--rpg-red)]' : 'text-[var(--rpg-text-secondary)]'}`}>
          Backpack ({usedSlots}/{capacity}){usedSlots > capacity && ' — Over-encumbered!'}
        </div>
        <div className="grid grid-cols-6 gap-2">
          {items.map((item, index) => {
            const isSalvageable = batch.salvage.active && item.salvageCost !== null;
            const isStashable = batch.stash.active && !item.equippedSlot;
            const isSellable = batch.sell.active && !item.equippedSlot && item.sellPrice != null && item.sellPrice > 0;
            const isSelectable = isSalvageable || isStashable || isSellable;
            const isSelected = (batch.salvage.active && batch.salvage.selection.has(item.id))
              || (batch.stash.active && batch.stash.selection.has(item.id))
              || (batch.sell.active && batch.sell.selection.has(item.id));

            return (
              <div key={item.id} className="rpg-stagger-item relative" style={{ animationDelay: getStaggerDelay(index) }}>
                <ItemCard
                  name={item.name}
                  icon={item.icon}
                  imageSrc={item.imageSrc}
                  quantity={item.quantity}
                  rarity={item.rarity}
                  durability={item.durability}
                  onClick={() => {
                    if (batch.salvage.active) {
                      if (isSalvageable) batch.salvage.toggle(item.id);
                    } else if (batch.stash.active) {
                      if (isStashable) batch.stash.toggle(item.id);
                    } else if (batch.sell.active) {
                      if (isSellable) batch.sell.toggle(item.id);
                    } else {
                      actions.onSelectItem(item);
                    }
                  }}
                />
                {batch.active && isSelectable && (
                  <BatchCheckboxOverlay selected={isSelected} />
                )}
                {batch.active && !isSelectable && (
                  <BatchDimOverlay />
                )}
              </div>
            );
          })}
          {Array.from({ length: Math.max(0, capacity - usedSlots) }).map((_, index) => (
            <div
              key={`empty-${index}`}
              className="aspect-square bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded-lg opacity-30"
            />
          ))}
        </div>
      </div>
    </>
  );
}
