'use client';

import { useCallback, useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { ItemCard } from '@/components/ItemCard';
import { PixelButton } from '@/components/PixelButton';
import { StatBar } from '@/components/StatBar';
import { Backpack, Crosshair, Heart, Shield, Sword, X, Zap, Coins } from 'lucide-react';
import { CRAFTING_CONSTANTS } from '@adventure/shared';
import { useBatchMode } from '@/hooks/useBatchMode';
import { BatchActionBar, BatchCheckboxOverlay, BatchDimOverlay } from '@/components/common/BatchActionBar';
import { titleCaseFromSnake, fmtDur } from '@/lib/format';
import { numStat, prettyStatName, formatSignedStatValue, signedClass, prettyWeightClass } from '@/lib/statFormat';
import { getStash } from '@/lib/api/items';
import { itemImageSrc } from '@/lib/assets';
import { rarityMeetsThreshold, type Rarity, type ConfirmRarity } from '@/lib/rarity';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { ModalOverlay } from '@/components/common/ModalOverlay';
import { StashTutorial } from '@/components/common/StashTutorial';
import { getStaggerDelay } from '@/lib/animations';
import { ScreenContainer } from '../common/ScreenContainer';

interface Item {
  id: string;
  name: string;
  icon?: string;
  imageSrc?: string;
  quantity: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  description: string;
  type: string;
  weightClass?: 'heavy' | 'medium' | 'light' | null;
  slot?: string | null;
  equippedSlot?: string | null;
  durability?: { current: number; max: number } | null;
  baseStats?: Record<string, unknown>;
  bonusStats?: Record<string, unknown> | null;
  requiredSkill?: string | null;
  requiredLevel?: number | null;
  salvageCost: number | null;
  sellPrice?: number | null;
}

interface StashItem {
  id: string;
  name: string;
  imageSrc?: string;
  quantity: number;
  rarity: Rarity;
  type: string;
  durability?: { current: number; max: number } | null;
  sellPrice: number | null;
  salvageCost: number | null;
}

interface InventoryProps {
  items: Item[];
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
}

function prettySlot(slot: string) {
  return titleCaseFromSnake(slot);
}

function statDisplay(stat: string) {
  if (stat === 'attack') return { Icon: Sword, color: 'text-[var(--rpg-red)]', label: 'Attack' };
  if (stat === 'armor') return { Icon: Shield, color: 'text-[var(--rpg-blue-light)]', label: 'Armor' };
  if (stat === 'magicDefence') return { Icon: Zap, color: 'text-[var(--rpg-purple)]', label: 'Magic Def' };
  if (stat === 'health') return { Icon: Heart, color: 'text-[var(--rpg-green-light)]', label: 'HP' };
  if (stat === 'dodge') return { Icon: Zap, color: 'text-[var(--rpg-gold)]', label: 'Dodge' };
  if (stat === 'accuracy') return { Icon: Crosshair, color: 'text-[var(--rpg-blue-light)]', label: 'Accuracy' };
  if (stat === 'critChance') return { Icon: Zap, color: 'text-[var(--rpg-gold)]', label: 'Crit Chance' };
  if (stat === 'critDamage') return { Icon: Zap, color: 'text-[var(--rpg-gold)]', label: 'Crit Damage' };
  if (stat === 'inventorySlots') return { Icon: Backpack, color: 'text-[var(--rpg-gold)]', label: 'Inventory Slots' };
  return { Icon: Zap, color: 'text-[var(--rpg-gold)]', label: prettyStatName(stat) };
}

export function Inventory({
  items, capacity, usedSlots, gold, isInTown,
  onDrop, onSalvage, onSalvageBatch, onRepair, onEquip, onUnequip, onUse, onSell, onSellBatch, onDeposit, onDepositBatch, onWithdraw, onWithdrawBatch,
  getSalvageCost, zoneCraftingLevel, confirmRarity = 'uncommon',
}: InventoryProps) {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'drop' | 'salvage' | 'sell';
    itemId: string;
    itemName: string;
    rarity: string;
  } | null>(null);
  const SALVAGE_LIMIT = CRAFTING_CONSTANTS.SALVAGE_BATCH_LIMIT;
  const BATCH_LIMIT = 50;

  const salvageBatch = useBatchMode(SALVAGE_LIMIT);
  const stashBatch = useBatchMode(BATCH_LIMIT);
  const sellBatchMode = useBatchMode(BATCH_LIMIT);
  const withdrawBatchMode = useBatchMode(BATCH_LIMIT);
  const stashSellBatch = useBatchMode(BATCH_LIMIT);
  const stashSalvageBatch = useBatchMode(SALVAGE_LIMIT);

  const [activeTab, setActiveTab] = useState<'backpack' | 'stash'>('backpack');
  const [stashItems, setStashItems] = useState<StashItem[]>([]);
  const [stashLoading, setStashLoading] = useState(false);
  const [selectedStashItem, setSelectedStashItem] = useState<StashItem | null>(null);

  // Mutual exclusion helpers — activate one mode, reset all others in the same tab
  const backpackModes = [salvageBatch, stashBatch, sellBatchMode];
  const stashModes = [withdrawBatchMode, stashSellBatch, stashSalvageBatch];

  const activateBackpackMode = (mode: typeof salvageBatch) => {
    for (const m of backpackModes) { if (m !== mode) m.reset(); }
    mode.activate();
    setSelectedItem(null);
  };
  const resetAllBackpackModes = () => { for (const m of backpackModes) m.reset(); };

  const activateStashMode = (mode: typeof withdrawBatchMode) => {
    for (const m of stashModes) { if (m !== mode) m.reset(); }
    mode.activate();
    setSelectedStashItem(null);
  };
  const resetAllStashModes = () => { for (const m of stashModes) m.reset(); };

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
            salvageCost: isEquip && getSalvageCost ? getSalvageCost(item.template.id) : null,
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
      else if (type === 'sell' && onSell) await onSell(itemId);
      setSelectedItem(null);
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  };

  const tryAction = (type: 'drop' | 'salvage' | 'sell', item: Item) => {
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
  const backpackBatchActive = salvageBatch.active || stashBatch.active || sellBatchMode.active;

  const sellableStashIds = stashItems.filter((i) => i.sellPrice != null && i.sellPrice > 0).map((i) => i.id);
  const totalStashSellGold = stashItems
    .filter((i) => stashSellBatch.selection.has(i.id))
    .reduce((sum, i) => sum + (i.sellPrice ?? 0) * i.quantity, 0);
  const salvageableStashIds = stashItems.filter((i) => i.salvageCost !== null).map((i) => i.id);
  const totalStashSalvageCost = stashItems
    .filter((i) => stashSalvageBatch.selection.has(i.id))
    .reduce((sum, i) => sum + (i.salvageCost ?? 0), 0);
  const stashBatchActive = withdrawBatchMode.active || stashSellBatch.active || stashSalvageBatch.active;

  const stats = selectedItem?.baseStats ?? {};
  const attack = numStat(stats.attack);
  const armor = numStat(stats.armor);
  const magicDefence = numStat(stats.magicDefence);
  const health = numStat(stats.health);
  const dodge = numStat(stats.dodge);
  const accuracy = numStat(stats.accuracy);
  const inventorySlots = numStat(stats.inventorySlots);
  const bonusEntries = Object.entries(selectedItem?.bonusStats ?? {})
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] !== 0);

  const isBackpack = selectedItem?.slot === 'backpack';
  const hasAnyStats = [attack, armor, magicDefence, health, dodge, accuracy, inventorySlots].some((v) => typeof v === 'number' && v !== 0);
  const hasAnyBonusStats = bonusEntries.length > 0;
  const itemType = selectedItem?.type ?? '';
  const isEquipment = itemType === 'weapon' || itemType === 'armor';
  const isConsumable = itemType === 'consumable';
  const isEquippable = Boolean(selectedItem?.slot && isEquipment);
  const isEquipped = Boolean(selectedItem?.equippedSlot);

  const canRepair = Boolean(
    onRepair && isEquipment && selectedItem?.durability &&
    selectedItem.durability.current < selectedItem.durability.max
  );
  const canEquip = Boolean(onEquip && isEquippable && !isEquipped);
  const canUnequip = Boolean(onUnequip && isEquippable && isEquipped);
  const noFacility = zoneCraftingLevel === 0;
  const canSalvage = Boolean(onSalvage && isEquipment && !isEquipped && !noFacility);
  const canDrop = Boolean(onDrop && !isEquipped);
  const canUse = Boolean(onUse && isConsumable);
  const canSell = Boolean(onSell && isInTown && !isEquipped && selectedItem?.sellPrice && selectedItem.sellPrice > 0);
  const canDeposit = Boolean(onDeposit && isInTown && !isEquipped);

  return (
    <ScreenContainer>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold font-display text-[var(--rpg-text-primary)]">Inventory</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-sm">
            <Coins size={14} className="text-[var(--rpg-gold)]" />
            <span className="font-pixel text-[var(--rpg-gold)]">{gold.toLocaleString()}</span>
          </div>
          <div className="text-sm text-[var(--rpg-text-secondary)]">{items.length} items</div>
        </div>
      </div>

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
            onClick={() => { setActiveTab('backpack'); setSelectedStashItem(null); resetAllStashModes(); }}
            className={`px-3 py-1.5 text-sm font-semibold font-display border-b-2 transition-colors ${
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
            className={`px-3 py-1.5 text-sm font-semibold font-display border-b-2 transition-colors ${
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
        <div className="space-y-2">
          <StashTutorial />

          {/* Stash Batch Mode Toggles + Actions */}
          {withdrawBatchMode.active ? (
            <BatchActionBar
              batch={withdrawBatchMode}
              limit={BATCH_LIMIT}
              eligibleIds={stashItems.map((i) => i.id)}
              actionLabel="Withdraw Selected"
              disabledLabel="Backpack Full"
              actionDisabled={usedSlots >= capacity}
              onAction={async () => {
                if (!onWithdrawBatch) return;
                withdrawBatchMode.setBusy(true);
                try {
                  await onWithdrawBatch([...withdrawBatchMode.selection]);
                  withdrawBatchMode.reset();
                  await loadStash();
                } finally {
                  withdrawBatchMode.setBusy(false);
                }
              }}
            />
          ) : stashSellBatch.active ? (
            <BatchActionBar
              batch={stashSellBatch}
              limit={BATCH_LIMIT}
              eligibleIds={sellableStashIds}
              actionLabel="Sell Selected"
              counterSuffix={
                stashSellBatch.selection.size > 0 && totalStashSellGold > 0
                  ? `(${totalStashSellGold} gold)`
                  : undefined
              }
              onAction={async () => {
                if (!onSellBatch) return;
                stashSellBatch.setBusy(true);
                try {
                  await onSellBatch([...stashSellBatch.selection]);
                  stashSellBatch.reset();
                  await loadStash();
                } finally {
                  stashSellBatch.setBusy(false);
                }
              }}
            />
          ) : stashSalvageBatch.active ? (
            <BatchActionBar
              batch={stashSalvageBatch}
              limit={SALVAGE_LIMIT}
              eligibleIds={salvageableStashIds}
              actionLabel="Salvage All"
              counterSuffix={
                stashSalvageBatch.selection.size > 0
                  ? totalStashSalvageCost > 0 ? `(${totalStashSalvageCost} turns)` : '(Free)'
                  : undefined
              }
              onAction={async () => {
                if (!onSalvageBatch) return;
                stashSalvageBatch.setBusy(true);
                try {
                  await onSalvageBatch([...stashSalvageBatch.selection]);
                  stashSalvageBatch.reset();
                  await loadStash();
                } finally {
                  stashSalvageBatch.setBusy(false);
                }
              }}
            />
          ) : stashItems.length > 0 ? (
            <div className="flex justify-end gap-2">
              {onSellBatch && (
                <PixelButton
                  variant="gold"
                  size="sm"
                  onClick={() => activateStashMode(stashSellBatch)}
                >
                  Sell Mode
                </PixelButton>
              )}
              {onWithdrawBatch && (
                <PixelButton
                  variant="secondary"
                  size="sm"
                  onClick={() => activateStashMode(withdrawBatchMode)}
                >
                  Withdraw Mode
                </PixelButton>
              )}
              {onSalvageBatch && (
                <PixelButton
                  variant="primary"
                  size="sm"
                  onClick={() => activateStashMode(stashSalvageBatch)}
                >
                  Salvage Mode
                </PixelButton>
              )}
            </div>
          ) : null}

          {/* Stash Items */}
          <div className="space-y-2">
            <div className="text-sm font-semibold text-[var(--rpg-text-secondary)]">
              Stash ({stashItems.length} {stashItems.length === 1 ? 'item' : 'items'})
            </div>
          {stashLoading ? (
            <div className="text-sm text-[var(--rpg-text-secondary)]">Loading stash...</div>
          ) : stashItems.length === 0 ? (
            <div className="text-sm text-[var(--rpg-text-secondary)]">Your stash is empty. Deposit items from your backpack.</div>
          ) : (
            <div className="grid grid-cols-6 gap-2">
              {stashItems.map((item) => {
                const isSellable = stashSellBatch.active && item.sellPrice != null && item.sellPrice > 0;
                const isSalvageable = stashSalvageBatch.active && item.salvageCost !== null;
                const isSelectable = withdrawBatchMode.active || isSellable || isSalvageable;
                const isSelected = (withdrawBatchMode.active && withdrawBatchMode.selection.has(item.id))
                  || (stashSellBatch.active && stashSellBatch.selection.has(item.id))
                  || (stashSalvageBatch.active && stashSalvageBatch.selection.has(item.id));
                return (
                  <div key={item.id} className="relative">
                    <ItemCard
                      name={item.name}
                      imageSrc={item.imageSrc}
                      quantity={item.quantity}
                      rarity={item.rarity}
                      durability={item.durability}
                      onClick={() => {
                        if (withdrawBatchMode.active) {
                          withdrawBatchMode.toggle(item.id);
                        } else if (stashSellBatch.active) {
                          if (isSellable) stashSellBatch.toggle(item.id);
                        } else if (stashSalvageBatch.active) {
                          if (isSalvageable) stashSalvageBatch.toggle(item.id);
                        } else {
                          setSelectedStashItem(item);
                        }
                      }}
                    />
                    {stashBatchActive && isSelectable && (
                      <BatchCheckboxOverlay selected={isSelected} />
                    )}
                    {stashBatchActive && !isSelectable && (
                      <BatchDimOverlay />
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </div>

          {/* Stash item withdraw modal */}
          {!stashBatchActive && selectedStashItem && (
            <ModalOverlay opacity={80} onClose={() => setSelectedStashItem(null)}>
              <PixelCard className="max-w-sm w-full">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    {selectedStashItem.imageSrc && (
                      <img
                        src={selectedStashItem.imageSrc}
                        alt={selectedStashItem.name}
                        className="w-12 h-12 object-contain image-rendering-pixelated"
                      />
                    )}
                    <div>
                      <h3 className="text-lg font-bold text-[var(--rpg-text-primary)]">{selectedStashItem.name}</h3>
                      <div className="text-xs text-[var(--rpg-text-secondary)] capitalize">
                        {selectedStashItem.rarity} {selectedStashItem.type}
                        {selectedStashItem.quantity > 1 && ` x${selectedStashItem.quantity}`}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedStashItem(null)}
                    className="text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]"
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
                    if (!onWithdraw) return;
                    setBusy(true);
                    try {
                      await onWithdraw(selectedStashItem.id);
                      setSelectedStashItem(null);
                      await loadStash();
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {usedSlots >= capacity ? 'Backpack Full' : 'Withdraw'}
                </PixelButton>
              </PixelCard>
            </ModalOverlay>
          )}
        </div>
      )}

      {/* Backpack Tab */}
      {activeTab === 'backpack' && (
        <>
          {/* Batch Mode Toggles + Actions */}
          {salvageBatch.active ? (
            <BatchActionBar
              batch={salvageBatch}
              limit={SALVAGE_LIMIT}
              eligibleIds={salvageableIds}
              actionLabel="Salvage All"
              counterSuffix={
                salvageBatch.selection.size > 0
                  ? totalSalvageCost > 0 ? `(${totalSalvageCost} turns)` : '(Free)'
                  : undefined
              }
              onAction={async () => {
                if (!onSalvageBatch) return;
                salvageBatch.setBusy(true);
                try {
                  await onSalvageBatch([...salvageBatch.selection]);
                  salvageBatch.reset();
                } finally {
                  salvageBatch.setBusy(false);
                }
              }}
            />
          ) : stashBatch.active ? (
            <BatchActionBar
              batch={stashBatch}
              limit={BATCH_LIMIT}
              eligibleIds={stashableIds}
              actionLabel="Stash Selected"
              onAction={async () => {
                if (!onDepositBatch) return;
                stashBatch.setBusy(true);
                try {
                  await onDepositBatch([...stashBatch.selection]);
                  stashBatch.reset();
                } finally {
                  stashBatch.setBusy(false);
                }
              }}
            />
          ) : sellBatchMode.active ? (
            <BatchActionBar
              batch={sellBatchMode}
              limit={BATCH_LIMIT}
              eligibleIds={sellableBackpackIds}
              actionLabel="Sell Selected"
              counterSuffix={
                sellBatchMode.selection.size > 0 && totalSellGold > 0
                  ? `(${totalSellGold} gold)`
                  : undefined
              }
              onAction={async () => {
                if (!onSellBatch) return;
                sellBatchMode.setBusy(true);
                try {
                  await onSellBatch([...sellBatchMode.selection]);
                  sellBatchMode.reset();
                } finally {
                  sellBatchMode.setBusy(false);
                }
              }}
            />
          ) : (
            <div className="flex justify-end gap-2">
              {onSellBatch && isInTown && (
                <PixelButton
                  variant="gold"
                  size="sm"
                  onClick={() => activateBackpackMode(sellBatchMode)}
                >
                  Sell Mode
                </PixelButton>
              )}
              {onDepositBatch && isInTown && (
                <PixelButton
                  variant="secondary"
                  size="sm"
                  onClick={() => activateBackpackMode(stashBatch)}
                >
                  Stash Mode
                </PixelButton>
              )}
              {onSalvageBatch && !noFacility && (
                <PixelButton
                  variant="primary"
                  size="sm"
                  onClick={() => activateBackpackMode(salvageBatch)}
                >
                  Salvage Mode
                </PixelButton>
              )}
            </div>
          )}

          {/* Backpack Items */}
          <div className="space-y-2">
            <div className={`text-sm font-semibold ${usedSlots > capacity ? 'text-[var(--rpg-red)]' : 'text-[var(--rpg-text-secondary)]'}`}>
              Backpack (<span className="font-pixel">{usedSlots}/{capacity}</span>){usedSlots > capacity && ' — Over-encumbered!'}
            </div>
            <div className="grid grid-cols-6 gap-2">
              {backpackItems.map((item, index) => {
                const isSalvageable = salvageBatch.active && item.salvageCost !== null;
                const isStashable = stashBatch.active && !item.equippedSlot;
                const isSellable = sellBatchMode.active && !item.equippedSlot && item.sellPrice != null && item.sellPrice > 0;
                const isSelectable = isSalvageable || isStashable || isSellable;
                const isSelected = (salvageBatch.active && salvageBatch.selection.has(item.id))
                  || (stashBatch.active && stashBatch.selection.has(item.id))
                  || (sellBatchMode.active && sellBatchMode.selection.has(item.id));
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
                        if (salvageBatch.active) {
                          if (isSalvageable) salvageBatch.toggle(item.id);
                        } else if (stashBatch.active) {
                          if (isStashable) stashBatch.toggle(item.id);
                        } else if (sellBatchMode.active) {
                          if (isSellable) sellBatchMode.toggle(item.id);
                        } else {
                          setSelectedItem(item);
                        }
                      }}
                    />
                    {backpackBatchActive && isSelectable && (
                      <BatchCheckboxOverlay selected={isSelected} />
                    )}
                    {backpackBatchActive && !isSelectable && (
                      <BatchDimOverlay />
                    )}
                  </div>
                );
              })}
              {/* Empty slots */}
              {Array.from({ length: Math.max(0, capacity - usedSlots) }).map((_, idx) => (
                <div
                  key={`empty-${idx}`}
                  className="aspect-square bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded-lg opacity-30"
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Item Detail Modal */}
      {!backpackBatchActive && selectedItem && activeTab === 'backpack' && (
        <ModalOverlay opacity={80} onClose={() => setSelectedItem(null)}>
          <PixelCard className="max-w-sm w-full">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-16 h-16 rounded-lg border-2 flex items-center justify-center text-3xl flex-shrink-0"
                  style={{
                    borderColor:
                      selectedItem.rarity === 'legendary'
                        ? 'var(--rpg-gold)'
                        : selectedItem.rarity === 'epic'
                        ? 'var(--rpg-purple)'
                        : selectedItem.rarity === 'rare'
                        ? 'var(--rpg-blue-light)'
                        : selectedItem.rarity === 'uncommon'
                        ? 'var(--rpg-green-light)'
                        : 'var(--rpg-border)',
                  }}
                >
                  {selectedItem.imageSrc ? (
                    <img
                      src={selectedItem.imageSrc}
                      alt={selectedItem.name}
                      className="w-14 h-14 object-contain image-rendering-pixelated"
                    />
                  ) : (
                    selectedItem.icon
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold font-display text-[var(--rpg-text-primary)]">{selectedItem.name}</h3>
                  {selectedItem.equippedSlot && (
                    <div className="text-xs text-[var(--rpg-gold)] mt-0.5">
                      Equipped: {prettySlot(selectedItem.equippedSlot)}
                    </div>
                  )}
                  <div className="text-xs text-[var(--rpg-text-secondary)] capitalize">
                    {selectedItem.rarity} &bull; {isBackpack ? 'backpack' : selectedItem.type}
                  </div>
                  {selectedItem.weightClass && (
                    <div className="text-xs text-[var(--rpg-gold)]">
                      {prettyWeightClass(selectedItem.weightClass)}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-[var(--rpg-text-secondary)] mb-4">{selectedItem.description}</p>

            {(selectedItem.durability || hasAnyStats || hasAnyBonusStats || selectedItem.requiredSkill) && (
              <div className="space-y-3 mb-4">
                {selectedItem.durability && selectedItem.durability.max > 0 && (
                  <div>
                    <div className="flex items-baseline justify-between text-xs mb-1">
                      <span className="text-[var(--rpg-text-secondary)]">Durability</span>
                      {selectedItem.durability.current <= 0 ? (
                        <span className="text-[var(--rpg-red)] font-pixel font-bold">BROKEN</span>
                      ) : (
                        <span className={`font-pixel ${
                          (selectedItem.durability.current / selectedItem.durability.max) < 0.10
                            ? 'text-[var(--rpg-gold)]'
                            : 'text-[var(--rpg-text-primary)]'
                        }`}>
                          {fmtDur(selectedItem.durability.current)}/{selectedItem.durability.max}
                        </span>
                      )}
                    </div>
                    <StatBar
                      current={selectedItem.durability.current}
                      max={selectedItem.durability.max}
                      color="durability"
                      size="sm"
                      showNumbers={false}
                    />
                  </div>
                )}

                {hasAnyStats && (
                  <div className="grid grid-cols-2 gap-2">
                    {typeof attack === 'number' && attack !== 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Sword size={16} className="text-[var(--rpg-red)]" />
                        <span className="text-[var(--rpg-text-secondary)]">Attack</span>
                        <span className={`ml-auto font-pixel ${signedClass(attack, 'text-[var(--rpg-red)]')}`}>
                          {formatSignedStatValue('attack', attack)}
                        </span>
                      </div>
                    )}
                    {typeof armor === 'number' && armor !== 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Shield size={16} className="text-[var(--rpg-blue-light)]" />
                        <span className="text-[var(--rpg-text-secondary)]">Armor</span>
                        <span className={`ml-auto font-pixel ${signedClass(armor, 'text-[var(--rpg-blue-light)]')}`}>
                          {formatSignedStatValue('armor', armor)}
                        </span>
                      </div>
                    )}
                    {typeof magicDefence === 'number' && magicDefence !== 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Zap size={16} className="text-[var(--rpg-purple)]" />
                        <span className="text-[var(--rpg-text-secondary)]">Magic Def</span>
                        <span className={`ml-auto font-pixel ${signedClass(magicDefence, 'text-[var(--rpg-purple)]')}`}>
                          {formatSignedStatValue('magicDefence', magicDefence)}
                        </span>
                      </div>
                    )}
                    {typeof health === 'number' && health !== 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Heart size={16} className="text-[var(--rpg-green-light)]" />
                        <span className="text-[var(--rpg-text-secondary)]">HP</span>
                        <span className={`ml-auto font-pixel ${signedClass(health, 'text-[var(--rpg-green-light)]')}`}>
                          {formatSignedStatValue('health', health)}
                        </span>
                      </div>
                    )}
                    {typeof dodge === 'number' && dodge !== 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Zap size={16} className="text-[var(--rpg-gold)]" />
                        <span className="text-[var(--rpg-text-secondary)]">Dodge</span>
                        <span className={`ml-auto font-pixel ${signedClass(dodge, 'text-[var(--rpg-gold)]')}`}>
                          {formatSignedStatValue('dodge', dodge)}
                        </span>
                      </div>
                    )}
                    {typeof accuracy === 'number' && accuracy !== 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Crosshair size={16} className="text-[var(--rpg-blue-light)]" />
                        <span className="text-[var(--rpg-text-secondary)]">Accuracy</span>
                        <span className={`ml-auto font-pixel ${signedClass(accuracy, 'text-[var(--rpg-blue-light)]')}`}>
                          {formatSignedStatValue('accuracy', accuracy)}
                        </span>
                      </div>
                    )}
                    {typeof inventorySlots === 'number' && inventorySlots !== 0 && (() => {
                      const rarityBonus = isBackpack
                        ? ({ common: 0, uncommon: 2, rare: 4, epic: 6, legendary: 8 }[selectedItem?.rarity ?? 'common'] ?? 0)
                        : 0;
                      const totalSlots = inventorySlots + rarityBonus;
                      return (
                        <div className="flex items-center gap-2 text-sm">
                          <Backpack size={16} className="text-[var(--rpg-gold)]" />
                          <span className="text-[var(--rpg-text-secondary)]">Inventory Slots</span>
                          <span className="ml-auto font-pixel text-[var(--rpg-gold)]">
                            +{totalSlots}{rarityBonus > 0 && <span className="text-xs text-[var(--rpg-text-secondary)]"> ({inventorySlots}+{rarityBonus})</span>}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {hasAnyBonusStats && (
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-[var(--rpg-gold)]">Bonus Stats</div>
                    <div className="grid grid-cols-2 gap-2">
                      {bonusEntries.map(([stat, value]) => {
                        const { Icon, color, label } = statDisplay(stat);
                        return (
                          <div key={stat} className="flex items-center gap-2 text-sm">
                            <Icon size={16} className={color} />
                            <span className="text-[var(--rpg-text-secondary)]">{label}</span>
                            <span className={`ml-auto font-pixel ${value < 0 ? 'text-[var(--rpg-red)]' : color}`}>
                              {formatSignedStatValue(stat, value)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedItem.requiredSkill && (
                  <div className="text-xs text-[var(--rpg-text-secondary)]">
                    Requires {selectedItem.requiredSkill} level {selectedItem.requiredLevel ?? 1}
                  </div>
                )}
              </div>
            )}

            {/* Sell price display */}
            {canSell && selectedItem.sellPrice != null && selectedItem.sellPrice > 0 && (
              <div className="flex items-center gap-1 text-xs text-[var(--rpg-text-secondary)] mb-3">
                <Coins size={12} className="text-[var(--rpg-gold)]" />
                <span>Sell value: <span className="text-[var(--rpg-gold)] font-pixel">{selectedItem.sellPrice * selectedItem.quantity}</span> gold{selectedItem.quantity > 1 && <span className="text-[var(--rpg-text-secondary)]"> ({selectedItem.sellPrice} ea)</span>}</span>
              </div>
            )}

            {/* Context-sensitive action buttons */}
            {isEquipment && (
              <div className="grid grid-cols-4 gap-2">
                <PixelButton
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  disabled={busy || !canRepair}
                  onClick={async () => {
                    if (!onRepair) return;
                    setBusy(true);
                    try {
                      await onRepair(selectedItem.id);
                      setSelectedItem(null);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {selectedItem.durability && selectedItem.durability.current <= 0 ? 'Fix (150)' : 'Repair (100)'}
                </PixelButton>

                <PixelButton
                  variant="gold"
                  size="sm"
                  className="flex-1"
                  disabled={busy || (!canEquip && !canUnequip)}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      if (selectedItem.equippedSlot) {
                        if (!onUnequip) return;
                        await onUnequip(selectedItem.equippedSlot);
                      } else {
                        if (!onEquip || !selectedItem.slot) return;
                        await onEquip(selectedItem.id, selectedItem.slot);
                      }
                      setSelectedItem(null);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {selectedItem.equippedSlot ? 'Unequip' : 'Equip'}
                </PixelButton>

                <PixelButton
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  disabled={busy || !canSalvage}
                  onClick={() => tryAction('salvage', selectedItem)}
                >
                  {noFacility
                    ? 'No Facility'
                    : selectedItem.salvageCost === 0
                      ? 'Salvage (Free)'
                      : selectedItem.salvageCost != null
                        ? `Salvage (${selectedItem.salvageCost})`
                        : 'Salvage'}
                </PixelButton>

                <PixelButton
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  disabled={busy || !canDrop}
                  onClick={() => tryAction('drop', selectedItem)}
                >
                  Drop
                </PixelButton>
              </div>
            )}

            {/* Sell + Deposit row */}
            {(canSell || canDeposit) && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {canSell && (
                  <PixelButton
                    variant="gold"
                    size="sm"
                    disabled={busy}
                    onClick={() => tryAction('sell', selectedItem)}
                  >
                    Sell
                  </PixelButton>
                )}
                {canDeposit && (
                  <PixelButton
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      if (!onDeposit) return;
                      setBusy(true);
                      try {
                        await onDeposit(selectedItem.id);
                        setSelectedItem(null);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Stash
                  </PixelButton>
                )}
              </div>
            )}

            {isConsumable && (
              <div className="grid grid-cols-2 gap-2">
                <PixelButton
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  disabled={busy || !canUse}
                  onClick={async () => {
                    if (!onUse) return;
                    setBusy(true);
                    try {
                      await onUse(selectedItem.id);
                      setSelectedItem(null);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Use
                </PixelButton>

                <PixelButton
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  disabled={busy || !canDrop}
                  onClick={() => tryAction('drop', selectedItem)}
                >
                  Drop
                </PixelButton>
              </div>
            )}

            {!isEquipment && !isConsumable && !canSell && !canDeposit && (
              <div className="grid grid-cols-1 gap-2">
                <PixelButton
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  disabled={busy || !canDrop}
                  onClick={() => tryAction('drop', selectedItem)}
                >
                  Drop
                </PixelButton>
              </div>
            )}
          </PixelCard>
        </ModalOverlay>
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
