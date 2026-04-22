import { X } from 'lucide-react';
import { ItemCard } from '@/components/ItemCard';
import { PixelButton } from '@/components/PixelButton';
import { PixelCard } from '@/components/PixelCard';
import { BatchActionBar, BatchCheckboxOverlay, BatchDimOverlay } from '@/components/common/BatchActionBar';
import { ModalOverlay } from '@/components/common/ModalOverlay';
import { StashTutorial } from '@/components/common/StashTutorial';
import { ItemIcon } from '@/components/common/ItemIcon';
import type { BatchMode } from '@/hooks/useBatchMode';
import type { InventoryStashItem } from './inventory.types';
import type { StashBatchModeKey } from './useInventoryBatchModes';
import { runInventoryBatchAction } from './runInventoryBatchAction';

interface StashPanelProps {
  items: InventoryStashItem[];
  loading: boolean;
  selectedItem: InventoryStashItem | null;
  usedSlots: number;
  capacity: number;
  busy: boolean;
  batch: {
    withdraw: BatchMode;
    sell: BatchMode;
    salvage: BatchMode;
    active: boolean;
    batchLimit: number;
    salvageLimit: number;
    sellableIds: string[];
    salvageableIds: string[];
    totalSellGold: number;
    totalSalvageCost: number;
    activateMode: (mode: StashBatchModeKey) => void;
  };
  actions: {
    onSelectItem: (item: InventoryStashItem) => void;
    onCloseSelectedItem: () => void;
    onBatchError: (message: string | null) => void;
    onBusyChange: (busy: boolean) => void;
    refresh: () => Promise<void>;
    onWithdraw?: (itemId: string) => void | Promise<void>;
    onWithdrawBatch?: (itemIds: string[]) => void | Promise<void>;
    onSellBatch?: (itemIds: string[]) => void | Promise<void>;
    onSalvageBatch?: (itemIds: string[]) => void | Promise<void>;
  };
}

export function StashPanel({
  items,
  loading,
  selectedItem,
  usedSlots,
  capacity,
  busy,
  batch,
  actions,
}: StashPanelProps) {
  return (
    <div className="space-y-2">
      <StashTutorial />

      {batch.withdraw.active ? (
        <BatchActionBar
          batch={batch.withdraw}
          limit={batch.batchLimit}
          eligibleIds={items.map((item) => item.id)}
          actionLabel="Withdraw Selected"
          disabledLabel="Backpack Full"
          actionDisabled={usedSlots >= capacity}
          onAction={() => runInventoryBatchAction({
            batch: batch.withdraw,
            action: actions.onWithdrawBatch
              ? async () => {
                  await actions.onWithdrawBatch?.([...batch.withdraw.selection]);
                }
              : undefined,
            onError: actions.onBatchError,
            errorMessage: 'Withdraw failed',
            afterSuccess: actions.refresh,
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
            afterSuccess: actions.refresh,
          })}
        />
      ) : batch.salvage.active ? (
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
            afterSuccess: actions.refresh,
          })}
        />
      ) : items.length > 0 ? (
        <div className="flex justify-end gap-2">
          {actions.onSellBatch && (
            <PixelButton
              variant="gold"
              size="sm"
              onClick={() => batch.activateMode('sell')}
            >
              Sell Mode
            </PixelButton>
          )}
          {actions.onWithdrawBatch && (
            <PixelButton
              variant="secondary"
              size="sm"
              onClick={() => batch.activateMode('withdraw')}
            >
              Withdraw Mode
            </PixelButton>
          )}
          {actions.onSalvageBatch && (
            <PixelButton
              variant="primary"
              size="sm"
              onClick={() => batch.activateMode('salvage')}
            >
              Salvage Mode
            </PixelButton>
          )}
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="text-sm font-semibold text-[var(--rpg-text-secondary)]">
          Stash ({items.length} {items.length === 1 ? 'item' : 'items'})
        </div>
        {loading ? (
          <div className="text-sm text-[var(--rpg-text-secondary)]">Loading stash...</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-[var(--rpg-text-secondary)]">Your stash is empty. Deposit items from your backpack.</div>
        ) : (
          <div className="grid grid-cols-6 gap-2">
            {items.map((item) => {
              const isSellable = batch.sell.active && item.sellPrice != null && item.sellPrice > 0;
              const isSalvageable = batch.salvage.active && item.salvageCost !== null;
              const isSelectable = batch.withdraw.active || isSellable || isSalvageable;
              const isSelected = (batch.withdraw.active && batch.withdraw.selection.has(item.id))
                || (batch.sell.active && batch.sell.selection.has(item.id))
                || (batch.salvage.active && batch.salvage.selection.has(item.id));

              return (
                <div key={item.id} className="relative">
                  <ItemCard
                    name={item.name}
                    imageSrc={item.imageSrc}
                    quantity={item.quantity}
                    rarity={item.rarity}
                    durability={item.durability}
                    onClick={() => {
                      if (batch.withdraw.active) {
                        batch.withdraw.toggle(item.id);
                      } else if (batch.sell.active) {
                        if (isSellable) batch.sell.toggle(item.id);
                      } else if (batch.salvage.active) {
                        if (isSalvageable) batch.salvage.toggle(item.id);
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
          </div>
        )}
      </div>

      {!batch.active && selectedItem && (
        <ModalOverlay opacity={80} onClose={actions.onCloseSelectedItem}>
          <PixelCard className="max-w-sm w-full">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                {selectedItem.imageSrc && (
                  <ItemIcon imageSrc={selectedItem.imageSrc} name={selectedItem.name} size="xl" />
                )}
                <div>
                  <h3 className="text-lg font-bold text-[var(--rpg-text-primary)]">{selectedItem.name}</h3>
                  <div className="text-xs text-[var(--rpg-text-secondary)] capitalize">
                    {selectedItem.rarity} {selectedItem.type}
                    {selectedItem.quantity > 1 && ` x${selectedItem.quantity}`}
                  </div>
                </div>
              </div>
              <button
                onClick={actions.onCloseSelectedItem}
                className="text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <PixelButton
              variant="primary"
              size="sm"
              className="w-full"
              disabled={busy || usedSlots >= capacity}
              onClick={async () => {
                if (!actions.onWithdraw || !selectedItem) {
                  return;
                }

                actions.onBusyChange(true);
                try {
                  await actions.onWithdraw(selectedItem.id);
                  actions.onCloseSelectedItem();
                  await actions.refresh();
                } finally {
                  actions.onBusyChange(false);
                }
              }}
            >
              {usedSlots >= capacity ? 'Backpack Full' : 'Withdraw'}
            </PixelButton>
          </PixelCard>
        </ModalOverlay>
      )}
    </div>
  );
}
