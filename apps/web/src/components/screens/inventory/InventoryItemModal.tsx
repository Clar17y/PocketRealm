import { Coins, X } from 'lucide-react';
import {
  parseCraftMarks,
  repairTurnCost,
  type CraftMark,
  type EquipmentActionModifier,
  type EquipmentActionModifierEntry,
  type ItemStatModifier,
} from '@pocketrealm/shared';
import { PixelButton } from '@/components/PixelButton';
import { PixelCard } from '@/components/PixelCard';
import { StatBar } from '@/components/StatBar';
import { ModalOverlay } from '@/components/common/ModalOverlay';
import { ItemIcon } from '@/components/common/ItemIcon';
import { fmtDur, titleCaseFromSnake } from '@/lib/format';
import { formatSignedStatValue, numStat, prettyWeightClass, signedClass, statDisplayMeta, statEntries } from '@/lib/statFormat';
import type { InventoryItem } from './inventory.types';

type InventoryModalAction = 'drop' | 'salvage' | 'sell';

interface InventoryItemModalProps {
  item: InventoryItem;
  busy: boolean;
  isInTown: boolean;
  noFacility: boolean;
  characterLevel?: number;
  skillLevels?: Map<string, number>;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  onTryAction: (type: InventoryModalAction, item: InventoryItem) => void;
  onDrop?: (itemId: string) => void | Promise<void>;
  onSalvage?: (itemId: string) => void | Promise<void>;
  onRepair?: (itemId: string) => void | Promise<void>;
  onEquip?: (itemId: string, slot: string) => void | Promise<void>;
  onUnequip?: (slot: string) => void | Promise<void>;
  onUse?: (itemId: string) => void | Promise<void>;
  onSell?: (itemId: string) => void | Promise<void>;
  onDeposit?: (itemId: string) => void | Promise<void>;
}

function prettySlot(slot: string) {
  return titleCaseFromSnake(slot);
}

function getItemBorderColor(rarity: InventoryItem['rarity']) {
  switch (rarity) {
    case 'legendary':
      return 'var(--rpg-gold)';
    case 'epic':
      return 'var(--rpg-purple)';
    case 'rare':
      return 'var(--rpg-blue-light)';
    case 'uncommon':
      return 'var(--rpg-green-light)';
    default:
      return 'var(--rpg-border)';
  }
}

function formatMarkValue(value: number, isPercent: boolean) {
  const absolute = Math.abs(value);
  const formatted = isPercent ? `${Math.round(absolute * 100)}%` : absolute.toLocaleString();
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function markStatLine(entry: ItemStatModifier, tone: 'benefit' | 'drawback') {
  const { icon: Icon, cssClass, label } = statDisplayMeta(entry.stat);
  const valueClass = tone === 'drawback' ? 'text-[var(--rpg-red)]' : signedClass(entry.value, cssClass);
  return (
    <div key={`${tone}-${entry.stat}-${entry.value}`} className="flex items-center gap-2 text-sm">
      <Icon size={15} className={cssClass} />
      <span className="text-[var(--rpg-text-secondary)]">{label}</span>
      <span className={`ml-auto font-pixel text-[11px] ${valueClass}`}>
        {formatMarkValue(entry.value, entry.isPercent)}
      </span>
    </div>
  );
}

function actionTargetLabel(modifier: EquipmentActionModifier) {
  const targets = modifier.actionIds?.length ? modifier.actionIds : modifier.actionTypes;
  return targets.map(titleCaseFromSnake).join(', ');
}

function actionModifierLine(
  modifier: EquipmentActionModifier,
  entry: EquipmentActionModifierEntry,
  tone: 'benefit' | 'drawback',
) {
  const valueClass = tone === 'drawback' ? 'text-[var(--rpg-red)]' : 'text-[var(--rpg-green-light)]';
  return (
    <div key={`${modifier.modifierId}-${tone}-${entry.stat}-${entry.value}`} className="flex items-center gap-2 text-sm">
      <span className="text-[var(--rpg-text-secondary)]">{actionTargetLabel(modifier)}</span>
      <span className="text-[var(--rpg-text-secondary)]">{titleCaseFromSnake(entry.stat)}</span>
      <span className={`ml-auto font-pixel text-[11px] ${valueClass}`}>
        {formatMarkValue(entry.value, entry.isPercent)}
      </span>
    </div>
  );
}

function CraftMarkDetails({ marks }: { marks: CraftMark[] }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-[var(--rpg-gold)]">Craft Marks</div>
      {marks.map((mark) => (
        <div key={mark.markId} className="rounded-lg border border-[var(--rpg-border)] bg-[var(--rpg-background)] p-3 space-y-2">
          <div>
            <div className="text-sm font-semibold text-[var(--rpg-text-primary)]">{mark.name}</div>
            <div className="text-xs text-[var(--rpg-text-secondary)] mt-0.5">{mark.description}</div>
          </div>
          <div className="space-y-1">
            {(mark.itemStatBenefits ?? []).map((entry) => markStatLine(entry, 'benefit'))}
            {(mark.itemStatDrawbacks ?? []).map((entry) => markStatLine(entry, 'drawback'))}
            {(mark.actionModifiers ?? []).flatMap((modifier) => [
              ...modifier.benefits.map((entry) => actionModifierLine(modifier, entry, 'benefit')),
              ...modifier.drawbacks.map((entry) => actionModifierLine(modifier, entry, 'drawback')),
            ])}
          </div>
        </div>
      ))}
    </div>
  );
}

export function InventoryItemModal({
  item,
  busy,
  isInTown,
  noFacility,
  characterLevel,
  skillLevels,
  onClose,
  onBusyChange,
  onTryAction,
  onDrop,
  onSalvage,
  onRepair,
  onEquip,
  onUnequip,
  onUse,
  onSell,
  onDeposit,
}: InventoryItemModalProps) {
  const baseEntries = statEntries(item.baseStats as Record<string, unknown> | undefined)
    .filter(([stat]) => stat !== 'inventorySlots');
  const inventorySlots = numStat((item.baseStats as Record<string, unknown> | undefined)?.inventorySlots);
  const bonusEntries = statEntries(item.bonusStats as Record<string, unknown> | undefined);
  const isBackpack = item.slot === 'backpack';
  const hasAnyStats = baseEntries.length > 0 || (typeof inventorySlots === 'number' && inventorySlots !== 0);
  const hasAnyBonusStats = bonusEntries.length > 0;
  const craftMarks = parseCraftMarks(item.craftMarks);
  const hasCraftMarks = craftMarks.length > 0;
  const isEquipment = item.type === 'weapon' || item.type === 'armor';
  const isConsumable = item.type === 'consumable';
  const isEquippable = Boolean(item.slot && isEquipment);
  const isEquipped = Boolean(item.equippedSlot);

  const meetsRequirements = (() => {
    const requiredLevel = item.requiredLevel ?? 0;
    if (requiredLevel <= 0) {
      return true;
    }
    if (item.type === 'armor') {
      return (characterLevel ?? 1) >= requiredLevel;
    }
    if (item.requiredSkill) {
      return (skillLevels?.get(item.requiredSkill) ?? 1) >= requiredLevel;
    }
    return true;
  })();

  const canRepair = Boolean(
    onRepair
      && isEquipment
      && item.durability
      && item.durability.current < item.durability.max
  );
  const canEquip = Boolean(onEquip && isEquippable && !isEquipped && meetsRequirements);
  const canUnequip = Boolean(onUnequip && isEquippable && isEquipped);
  const canSalvage = Boolean(onSalvage && isEquipment && !isEquipped && !noFacility);
  const canDrop = Boolean(onDrop && !isEquipped);
  const canUse = Boolean(onUse && isConsumable);
  const canSell = Boolean(onSell && isInTown && !isEquipped && item.sellPrice && item.sellPrice > 0);
  const canDeposit = Boolean(onDeposit && isInTown && !isEquipped);

  return (
    <ModalOverlay opacity={80} onClose={onClose}>
      <PixelCard className="max-w-sm w-full">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-16 h-16 rounded-lg border-2 flex items-center justify-center text-3xl flex-shrink-0"
              style={{ borderColor: getItemBorderColor(item.rarity) }}
            >
              <ItemIcon imageSrc={item.imageSrc} name={item.name} size="2xl" fallback={item.icon} />
            </div>
            <div>
              <h3 className="text-lg font-bold font-almendra text-[var(--rpg-text-primary)]">{item.name}</h3>
              {item.equippedSlot && (
                <div className="text-xs text-[var(--rpg-gold)] mt-0.5">
                  Equipped: {prettySlot(item.equippedSlot)}
                </div>
              )}
              <div className="text-xs text-[var(--rpg-text-secondary)] capitalize">
                {item.rarity} &bull; {isBackpack ? 'backpack' : item.type}
              </div>
              {item.weightClass && (
                <div className="text-xs text-[var(--rpg-gold)]">
                  {prettyWeightClass(item.weightClass)}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <p className={`text-sm text-[var(--rpg-text-secondary)] mb-4 ${
          item.description !== item.type ? 'italic' : ''
        }`}>{item.description}</p>

        {(item.durability || hasAnyStats || hasAnyBonusStats || hasCraftMarks || item.requiredSkill || (item.type === 'armor' && (item.requiredLevel ?? 0) > 0)) && (
          <div className="space-y-3 mb-4">
            {item.durability && item.durability.max > 0 && (
              <div>
                <div className="flex items-baseline justify-between text-xs mb-1">
                  <span className="text-[var(--rpg-text-secondary)]">Durability</span>
                  {item.durability.current <= 0 ? (
                    <span className="text-[var(--rpg-red)] font-pixel text-[8px]">BROKEN</span>
                  ) : (
                    <span className={`font-pixel text-[8px] ${
                      (item.durability.current / item.durability.max) < 0.10
                        ? 'text-[var(--rpg-gold)]'
                        : 'text-[var(--rpg-text-primary)]'
                    }`}>
                      {fmtDur(item.durability.current)}/{item.durability.max}
                    </span>
                  )}
                </div>
                <StatBar
                  current={item.durability.current}
                  max={item.durability.max}
                  color="durability"
                  size="sm"
                  showNumbers={false}
                />
              </div>
            )}

            {hasAnyStats && (
              <div className="grid grid-cols-2 gap-2">
                {baseEntries.map(([stat, value]) => {
                  const { icon: Icon, cssClass, label } = statDisplayMeta(stat);
                  return (
                    <div key={stat} className="flex items-center gap-2 text-sm">
                      <Icon size={16} className={cssClass} />
                      <span className="text-[var(--rpg-text-secondary)]">{label}</span>
                      <span className={`ml-auto font-pixel text-[12px] ${signedClass(value, cssClass)}`}>
                        {formatSignedStatValue(stat, value)}
                      </span>
                    </div>
                  );
                })}
                {typeof inventorySlots === 'number' && inventorySlots !== 0 && (() => {
                  const slotsMeta = statDisplayMeta('inventorySlots');
                  const SlotIcon = slotsMeta.icon;
                  const rarityBonus = isBackpack
                    ? ({ common: 0, uncommon: 2, rare: 4, epic: 6, legendary: 8 }[item.rarity] ?? 0)
                    : 0;
                  const totalSlots = inventorySlots + rarityBonus;
                  return (
                    <div className="flex items-center gap-2 text-sm">
                      <SlotIcon size={16} className={slotsMeta.cssClass} />
                      <span className="text-[var(--rpg-text-secondary)]">{slotsMeta.label}</span>
                      <span className={`ml-auto font-pixel text-[12px] ${slotsMeta.cssClass}`}>
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
                    const { icon: Icon, cssClass, label } = statDisplayMeta(stat);
                    return (
                      <div key={stat} className="flex items-center gap-2 text-sm">
                        <Icon size={16} className={cssClass} />
                        <span className="text-[var(--rpg-text-secondary)]">{label}</span>
                        <span className={`ml-auto font-pixel text-[12px] ${value < 0 ? 'text-[var(--rpg-red)]' : cssClass}`}>
                          {formatSignedStatValue(stat, value)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {hasCraftMarks && (
              <CraftMarkDetails marks={craftMarks} />
            )}

            {item.requiredSkill ? (
              <div className={`text-xs ${meetsRequirements ? 'text-[var(--rpg-text-secondary)]' : 'text-[var(--rpg-red)]'}`}>
                Requires {item.requiredSkill} level {item.requiredLevel ?? 1}
              </div>
            ) : item.type === 'armor' && (item.requiredLevel ?? 0) > 0 ? (
              <div className={`text-xs ${meetsRequirements ? 'text-[var(--rpg-text-secondary)]' : 'text-[var(--rpg-red)]'}`}>
                Requires character level {item.requiredLevel}
              </div>
            ) : null}
          </div>
        )}

        {canSell && item.sellPrice != null && item.sellPrice > 0 && (
          <div className="flex items-center gap-1 text-xs text-[var(--rpg-text-secondary)] mb-3">
            <Coins size={12} className="text-[var(--rpg-gold)]" />
            <span>Sell value: <span className="text-[var(--rpg-gold)] font-pixel text-[8px]">{item.sellPrice * item.quantity}</span> gold{item.quantity > 1 && <span className="text-[var(--rpg-text-secondary)]"> ({item.sellPrice} ea)</span>}</span>
          </div>
        )}

        {isEquipment && (
          <div className="grid grid-cols-4 gap-2">
            <PixelButton
              variant="primary"
              size="sm"
              className="flex-1"
              disabled={busy || !canRepair}
              onClick={async () => {
                if (!onRepair) {
                  return;
                }
                onBusyChange(true);
                try {
                  await onRepair(item.id);
                  onClose();
                } finally {
                  onBusyChange(false);
                }
              }}
            >
              {item.durability && item.durability.current <= 0
                ? `Fix (${repairTurnCost(item.tier ?? 1, true)})`
                : `Repair (${repairTurnCost(item.tier ?? 1, false)})`}
            </PixelButton>

            <PixelButton
              variant="gold"
              size="sm"
              className="flex-1"
              disabled={busy || (!canEquip && !canUnequip)}
              onClick={async () => {
                onBusyChange(true);
                try {
                  if (item.equippedSlot) {
                    if (!onUnequip) {
                      return;
                    }
                    await onUnequip(item.equippedSlot);
                  } else {
                    if (!onEquip || !item.slot) {
                      return;
                    }
                    await onEquip(item.id, item.slot);
                  }
                  onClose();
                } finally {
                  onBusyChange(false);
                }
              }}
            >
              {item.equippedSlot ? 'Unequip' : 'Equip'}
            </PixelButton>

            <PixelButton
              variant="secondary"
              size="sm"
              className="flex-1"
              disabled={busy || !canSalvage}
              onClick={() => onTryAction('salvage', item)}
            >
              {noFacility
                ? 'No Facility'
                : item.salvageCost === 0
                  ? 'Salvage (Free)'
                  : item.salvageCost != null
                    ? `Salvage (${item.salvageCost})`
                    : 'Salvage'}
            </PixelButton>

            <PixelButton
              variant="secondary"
              size="sm"
              className="flex-1"
              disabled={busy || !canDrop}
              onClick={() => onTryAction('drop', item)}
            >
              Drop
            </PixelButton>
          </div>
        )}

        {(canSell || canDeposit) && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            {canSell && (
              <PixelButton
                variant="gold"
                size="sm"
                disabled={busy}
                onClick={() => onTryAction('sell', item)}
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
                  if (!onDeposit) {
                    return;
                  }
                  onBusyChange(true);
                  try {
                    await onDeposit(item.id);
                    onClose();
                  } finally {
                    onBusyChange(false);
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
                if (!onUse) {
                  return;
                }
                onBusyChange(true);
                try {
                  await onUse(item.id);
                  onClose();
                } finally {
                  onBusyChange(false);
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
              onClick={() => onTryAction('drop', item)}
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
              onClick={() => onTryAction('drop', item)}
            >
              Drop
            </PixelButton>
          </div>
        )}
      </PixelCard>
    </ModalOverlay>
  );
}
