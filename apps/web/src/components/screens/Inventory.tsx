'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ItemCard } from '@/components/ItemCard';
import { Coins } from 'lucide-react';
import { CRAFTING_CONSTANTS } from '@pocketrealm/shared';
import { getStash } from '@/lib/api/items';
import { itemImageSrc } from '@/lib/assets';
import { rarityMeetsThreshold, type ConfirmRarity } from '@/lib/rarity';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { ScreenContainer } from '../common/ScreenContainer';
import { NpcDialogueBanner } from '@/components/common/NpcDialogueBanner';
import { useNpcDialogue } from '@/hooks/useNpcDialogue';
import { useInventoryBatchModes } from './inventory/useInventoryBatchModes';
import { BackpackPanel } from './inventory/BackpackPanel';
import { InventoryItemModal } from './inventory/InventoryItemModal';
import { StashPanel } from './inventory/StashPanel';
import type { InventoryItem, InventoryStashItem } from './inventory/inventory.types';

interface InventoryProps {
  items: InventoryItem[];
  capacity: number;
  usedSlots: number;
  gold: number;
  isInTown: boolean;
  onDrop?: (itemId: string) => void | Promise<void>;
  onSalvage?: (itemId: string) => void | Promise<void>;
  onSalvageBatch?: (itemIds: string[]) => void | Promise<void>;
  onRepair?: (itemId: string) => void | Promise<void>;
  onEquip?: (itemId: string, slot: string) => void | Promise<void>;
  onUnequip?: (slot: string) => void | Promise<void>;
  onUse?: (itemId: string) => void | Promise<void>;
  onSell?: (itemId: string) => void | Promise<void>;
  onSellBatch?: (itemIds: string[]) => void | Promise<void>;
  onDeposit?: (itemId: string) => void | Promise<void>;
  onDepositBatch?: (itemIds: string[]) => void | Promise<void>;
  onWithdraw?: (itemId: string) => void | Promise<void>;
  onWithdrawBatch?: (itemIds: string[]) => void | Promise<void>;
  getSalvageCost?: (templateId: string) => number | null;
  zoneCraftingLevel?: number | null;
  confirmRarity?: ConfirmRarity;
  showNpcDialogue?: boolean;
  characterLevel?: number;
  skillLevels?: Map<string, number>;
}

export function Inventory({
  items, capacity, usedSlots, gold, isInTown,
  onDrop, onSalvage, onSalvageBatch, onRepair, onEquip, onUnequip, onUse, onSell, onSellBatch, onDeposit, onDepositBatch, onWithdraw, onWithdrawBatch,
  getSalvageCost, zoneCraftingLevel, confirmRarity = 'uncommon', showNpcDialogue = true,
  characterLevel, skillLevels,
}: InventoryProps) {
  const { dialogueEvent, triggerDialogueEvent } = useNpcDialogue();
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'drop' | 'salvage' | 'sell';
    itemId: string;
    itemName: string;
    rarity: string;
  } | null>(null);
  const SALVAGE_LIMIT = CRAFTING_CONSTANTS.SALVAGE_BATCH_LIMIT;
  const BATCH_LIMIT = 50;

  const [activeTab, setActiveTab] = useState<'backpack' | 'stash'>('backpack');
  const [stashItems, setStashItems] = useState<InventoryStashItem[]>([]);
  const [stashLoading, setStashLoading] = useState(false);
  const [selectedStashItem, setSelectedStashItem] = useState<InventoryStashItem | null>(null);
  const clearSelectedItem = useCallback(() => {
    setSelectedItem(null);
  }, []);
  const clearSelectedStashItem = useCallback(() => {
    setSelectedStashItem(null);
  }, []);
  const {
    salvageBatch,
    stashBatch,
    sellBatchMode,
    withdrawBatchMode,
    stashSellBatch,
    stashSalvageBatch,
    backpackBatchActive,
    stashBatchActive,
    activateBackpackMode,
    resetAllBackpackModes,
    activateStashMode,
    resetAllStashModes,
  } = useInventoryBatchModes({
    batchLimit: BATCH_LIMIT,
    salvageLimit: SALVAGE_LIMIT,
    clearSelectedItem,
    clearSelectedStashItem,
  });

  // Keep a stable ref for getSalvageCost so loadStash doesn't need it as a dependency
  const getSalvageCostRef = useRef(getSalvageCost);
  getSalvageCostRef.current = getSalvageCost;

  const loadStash = useCallback(async () => {
    setStashLoading(true);
    try {
      const res = await getStash();
      if (res.data) {
        setStashItems(res.data.items.map((item) => {
          const templateMax = item.template.maxDurability ?? 0;
          const max = item.maxDurability ?? templateMax;
          const isEquip = ['weapon', 'armor'].includes(item.template.itemType);
          return {
            id: item.id,
            name: item.template.name,
            imageSrc: itemImageSrc(item.template.name, item.template.itemType),
            quantity: item.quantity,
            rarity: item.rarity,
            type: item.template.itemType,
            durability: isEquip && max > 0 ? { current: item.currentDurability ?? max, max } : null,
            sellPrice: item.template.sellPrice ?? null,
            salvageCost: isEquip && getSalvageCostRef.current ? getSalvageCostRef.current(item.template.id) : null,
          };
        }));
      }
    } finally {
      setStashLoading(false);
    }
  }, []);

  // Load stash when stash tab is selected
  useEffect(() => {
    if (activeTab === 'stash' && isInTown) {
      void loadStash();
    }
  }, [activeTab, isInTown, loadStash]);

  // Reset batch modes when leaving town
  useEffect(() => {
    if (!isInTown) {
      if (activeTab === 'stash') setActiveTab('backpack');
      resetAllBackpackModes();
      resetAllStashModes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInTown, activeTab]);

  const runItemAction = async (type: 'drop' | 'salvage' | 'sell', itemId: string) => {
    setBusy(true);
    try {
      if (type === 'drop' && onDrop) await onDrop(itemId);
      else if (type === 'salvage' && onSalvage) await onSalvage(itemId);
      else if (type === 'sell' && onSell) { await onSell(itemId); triggerDialogueEvent('sell'); }
      setSelectedItem(null);
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  };

  const tryAction = (type: 'drop' | 'salvage' | 'sell', item: InventoryItem) => {
    if (rarityMeetsThreshold(item.rarity, confirmRarity)) {
      setConfirmAction({ type, itemId: item.id, itemName: item.name, rarity: item.rarity });
    } else {
      void runItemAction(type, item.id);
    }
  };

  const equippedItems = items.filter((item) => item.equippedSlot);
  const backpackItems = items.filter((item) => !item.equippedSlot);

  const salvageableIds = backpackItems.filter((i) => i.salvageCost !== null && !i.equippedSlot).map((i) => i.id);
  const stashableIds = backpackItems.filter((i) => !i.equippedSlot).map((i) => i.id);
  const sellableBackpackIds = backpackItems.filter((i) => !i.equippedSlot && i.sellPrice != null && i.sellPrice > 0).map((i) => i.id);
  const totalSalvageCost = backpackItems
    .filter((i) => salvageBatch.selection.has(i.id))
    .reduce((sum, i) => sum + (i.salvageCost ?? 0), 0);
  const totalSellGold = backpackItems
    .filter((i) => sellBatchMode.selection.has(i.id))
    .reduce((sum, i) => sum + (i.sellPrice ?? 0) * i.quantity, 0);

  const sellableStashIds = stashItems.filter((i) => i.sellPrice != null && i.sellPrice > 0).map((i) => i.id);
  const totalStashSellGold = stashItems
    .filter((i) => stashSellBatch.selection.has(i.id))
    .reduce((sum, i) => sum + (i.sellPrice ?? 0) * i.quantity, 0);
  const salvageableStashIds = stashItems.filter((i) => i.salvageCost !== null).map((i) => i.id);
  const totalStashSalvageCost = stashItems
    .filter((i) => stashSalvageBatch.selection.has(i.id))
    .reduce((sum, i) => sum + (i.salvageCost ?? 0), 0);
  const noFacility = zoneCraftingLevel === 0;

  return (
    <ScreenContainer>
      {isInTown && <NpcDialogueBanner npcKey="millbrook-general-store" event={dialogueEvent} showDialogue={showNpcDialogue} />}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">Inventory</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-sm">
            <Coins size={14} className="text-[var(--rpg-gold)]" />
            <span className="font-pixel text-[12px] text-[var(--rpg-gold)]">{gold.toLocaleString()}</span>
          </div>
          <div className="text-sm text-[var(--rpg-text-secondary)]">{items.length} items</div>
        </div>
      </div>

      {batchError && <ErrorBanner message={batchError} />}

      {/* Equipped Items */}
      {equippedItems.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-[var(--rpg-text-secondary)]">
            Equipped ({equippedItems.length})
          </div>
          <div className="grid grid-cols-6 gap-2">
            {equippedItems.map((item) => (
              <ItemCard
                key={item.id}
                name={item.name}
                icon={item.icon}
                imageSrc={item.imageSrc}
                quantity={item.quantity}
                rarity={item.rarity}
                durability={item.durability}
                onClick={() => setSelectedItem(item)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tab switcher (Backpack / Stash) */}
      {isInTown && (
        <div className="flex gap-2 border-b border-[var(--rpg-border)]">
          <button
            type="button"
            onClick={() => { setActiveTab('backpack'); clearSelectedStashItem(); resetAllStashModes(); }}
            className={`px-3 py-1.5 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'backpack'
                ? 'text-[var(--rpg-gold)] border-[var(--rpg-gold)]'
                : 'text-[var(--rpg-text-secondary)] border-transparent hover:text-[var(--rpg-text-primary)]'
            }`}
          >
            Backpack
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('stash'); resetAllBackpackModes(); }}
            className={`px-3 py-1.5 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'stash'
                ? 'text-[var(--rpg-gold)] border-[var(--rpg-gold)]'
                : 'text-[var(--rpg-text-secondary)] border-transparent hover:text-[var(--rpg-text-primary)]'
            }`}
          >
            Stash
          </button>
        </div>
      )}

      {/* Stash Tab */}
      {activeTab === 'stash' && isInTown && (
        <StashPanel
          items={stashItems}
          loading={stashLoading}
          selectedItem={selectedStashItem}
          usedSlots={usedSlots}
          capacity={capacity}
          busy={busy}
          batch={{
            withdraw: withdrawBatchMode,
            sell: stashSellBatch,
            salvage: stashSalvageBatch,
            active: stashBatchActive,
            batchLimit: BATCH_LIMIT,
            salvageLimit: SALVAGE_LIMIT,
            sellableIds: sellableStashIds,
            salvageableIds: salvageableStashIds,
            totalSellGold: totalStashSellGold,
            totalSalvageCost: totalStashSalvageCost,
            activateMode: activateStashMode,
          }}
          actions={{
            onSelectItem: setSelectedStashItem,
            onCloseSelectedItem: clearSelectedStashItem,
            onBatchError: setBatchError,
            onBusyChange: setBusy,
            refresh: loadStash,
            onWithdraw,
            onWithdrawBatch,
            onSellBatch,
            onSalvageBatch,
          }}
        />
      )}

      {/* Backpack Tab */}
      {activeTab === 'backpack' && (
        <BackpackPanel
          items={backpackItems}
          capacity={capacity}
          usedSlots={usedSlots}
          isInTown={isInTown}
          noFacility={noFacility}
          batch={{
            salvage: salvageBatch,
            stash: stashBatch,
            sell: sellBatchMode,
            active: backpackBatchActive,
            salvageLimit: SALVAGE_LIMIT,
            batchLimit: BATCH_LIMIT,
            salvageableIds,
            stashableIds,
            sellableIds: sellableBackpackIds,
            totalSalvageCost,
            totalSellGold,
            activateMode: activateBackpackMode,
          }}
          actions={{
            onSelectItem: setSelectedItem,
            onBatchError: setBatchError,
            onSalvageBatch,
            onDepositBatch,
            onSellBatch,
          }}
        />
      )}

      {/* Item Detail Modal */}
      {!backpackBatchActive && selectedItem && activeTab === 'backpack' && (
        <InventoryItemModal
          item={selectedItem}
          busy={busy}
          isInTown={isInTown}
          noFacility={noFacility}
          characterLevel={characterLevel}
          skillLevels={skillLevels}
          onClose={clearSelectedItem}
          onBusyChange={setBusy}
          onTryAction={tryAction}
          onDrop={onDrop}
          onSalvage={onSalvage}
          onRepair={onRepair}
          onEquip={onEquip}
          onUnequip={onUnequip}
          onUse={onUse}
          onSell={onSell}
          onDeposit={onDeposit}
        />
      )}

      {confirmAction && (
        <ConfirmModal
          title={`${confirmAction.type.charAt(0).toUpperCase() + confirmAction.type.slice(1)} ${confirmAction.rarity} item?`}
          message={`Are you sure you want to ${confirmAction.type} ${confirmAction.itemName}?`}
          variant={confirmAction.type === 'drop' ? 'danger' : 'warning'}
          confirmLabel={confirmAction.type.charAt(0).toUpperCase() + confirmAction.type.slice(1)}
          onConfirm={() => runItemAction(confirmAction.type, confirmAction.itemId)}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </ScreenContainer>
  );
}
