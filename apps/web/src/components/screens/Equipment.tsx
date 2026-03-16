'use client';

import { useMemo, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { StatBar } from '@/components/StatBar';
import { Backpack, Crosshair, Heart, Shield, Sparkles, Sword, Target, X, Zap } from 'lucide-react';
import { RARITY_COLORS, type Rarity } from '@/lib/rarity';
import { titleCaseFromSnake, fmtDur } from '@/lib/format';
import { repairTurnCost } from '@pocketrealm/shared';
import { getStaggerDelay } from '@/lib/animations';
import { numStat, formatSignedStatValue, prettyStatName, prettyWeightClass } from '@/lib/statFormat';
import { ModalOverlay } from '@/components/common/ModalOverlay';
import { Divider } from '@/components/common/Divider';
import { ItemIcon } from '@/components/common/ItemIcon';
import { StatLine } from '@/components/common/StatLine';
import { StatBlock } from '@/components/common/StatBlock';
import { FeatureTutorial } from '@/components/common/FeatureTutorial';
import { ScreenContainer } from '../common/ScreenContainer';

interface EquippedItem {
  id: string;
  name: string;
  icon?: string;
  imageSrc?: string;
  rarity: Rarity;
  weightClass?: 'heavy' | 'medium' | 'light' | null;
  tier: number;
  durability: number;
  maxDurability: number;
  baseStats?: Record<string, unknown>;
  bonusStats?: Record<string, unknown> | null;
}

interface EquipmentSlot {
  id: string;
  name: string;
  item: EquippedItem | null;
}

interface EquipmentProps {
  slots: EquipmentSlot[];
  inventoryItems: Array<{
    id: string;
    name: string;
    icon?: string;
    imageSrc?: string;
    rarity: Rarity;
    slot: string;
    weightClass?: 'heavy' | 'medium' | 'light' | null;
    equippedSlot: string | null;
    durability: { current: number; max: number } | null;
    baseStats?: Record<string, unknown>;
    bonusStats?: Record<string, unknown> | null;
  }>;
  onEquip?: (itemId: string, slot: string) => void | Promise<void>;
  onUnequip?: (slot: string) => void | Promise<void>;
  onRepairItem?: (itemId: string) => void | Promise<void>;
  onRepairAll?: () => void | Promise<void>;
  turns?: number;
  stats: {
    attack: number;
    defence: number;
    magicDefence: number;
    hp: number;
    dodge: number;
    accuracy: number;
    critChance: number;
    critDamage: number;
  };
}

function statValue(stats: Record<string, unknown> | undefined, key: string): number {
  const v = stats ? numStat((stats as any)[key]) : null;
  return typeof v === 'number' ? v : 0;
}

function totalStatValue(
  baseStats: Record<string, unknown> | undefined,
  bonusStats: Record<string, unknown> | null | undefined,
  key: string
): number {
  return statValue(baseStats, key) + statValue(bonusStats ?? undefined, key);
}

function prettySlot(slot: string) {
  return titleCaseFromSnake(slot);
}

function repairCost(item: EquippedItem): number {
  return repairTurnCost(item.tier, item.durability <= 0);
}

export function Equipment({ slots, inventoryItems, onEquip, onUnequip, onRepairItem, onRepairAll, turns, stats }: EquipmentProps) {
  const slotPositions: Record<string, { gridColumn: string; gridRow: string; label: string }> = {
    head: { gridColumn: '2', gridRow: '1', label: 'Head' },
    neck: { gridColumn: '2', gridRow: '2', label: 'Neck' },
    main_hand: { gridColumn: '1', gridRow: '3', label: 'Main Hand' },
    chest: { gridColumn: '2', gridRow: '3', label: 'Chest' },
    off_hand: { gridColumn: '3', gridRow: '3', label: 'Off Hand' },
    gloves: { gridColumn: '1', gridRow: '4', label: 'Gloves' },
    belt: { gridColumn: '2', gridRow: '4', label: 'Belt' },
    ring: { gridColumn: '3', gridRow: '4', label: 'Ring' },
    legs: { gridColumn: '2', gridRow: '5', label: 'Legs' },
    boots: { gridColumn: '2', gridRow: '6', label: 'Boots' },
    charm: { gridColumn: '3', gridRow: '6', label: 'Charm' },
    backpack: { gridColumn: '1', gridRow: '6', label: 'Backpack' },
  };

  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRepairAll, setShowRepairAll] = useState(false);

  const activeSlot = activeSlotId ? slots.find((s) => s.id === activeSlotId) ?? null : null;
  const currentItem = activeSlot?.item ?? null;

  const candidates = useMemo(() => {
    if (!activeSlotId) return [];
    return inventoryItems
      .filter((i) => i.slot === activeSlotId)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inventoryItems, activeSlotId]);

  const repairableItems = useMemo(() => {
    return slots
      .filter((s) => s.item && s.item.durability < s.item.maxDurability)
      .map((s) => {
        const item = s.item!;
        const turnCost = repairCost(item);
        return { slotId: s.id, slotName: s.name, item, turnCost };
      });
  }, [slots]);

  const totalRepairCost = useMemo(
    () => repairableItems.reduce((sum, r) => sum + r.turnCost, 0),
    [repairableItems]
  );

  const closeModal = () => {
    setActiveSlotId(null);
    setError(null);
  };

  const getSlotInfo = (slotId: string) => {
    return slots.find((s) => s.id === slotId)?.item || null;
  };

  const renderSlot = (slotId: string, index: number) => {
    const position = slotPositions[slotId];
    if (!position) return null;
    const item = getSlotInfo(slotId);

    return (
      <div key={slotId} className="rpg-stagger-item" style={{ gridColumn: position.gridColumn, gridRow: position.gridRow, animationDelay: getStaggerDelay(index) }}>
        <button
          onClick={() => {
            setActiveSlotId(slotId);
            setError(null);
          }}
          className={`w-16 h-16 rounded-lg flex flex-col items-center justify-center transition-all relative ${
            item
              ? 'bg-[var(--rpg-surface)] border-2 hover:border-[var(--rpg-gold)]'
              : 'bg-[var(--rpg-background)] border-2 border-dashed border-[var(--rpg-border)] hover:border-[var(--rpg-text-secondary)]'
          }`}
          style={{
            borderColor: item ? RARITY_COLORS[item.rarity] : undefined,
          }}
        >
          {item ? (
            <>
              <ItemIcon imageSrc={item.imageSrc} name={item.name} size="lg" fallback={<span className="text-2xl">{item.icon ?? '❓'}</span>} />
              {item.maxDurability > 0 && item.durability <= 0 && (
                <div className="absolute -top-1 -right-1 bg-[var(--rpg-red)] text-white text-[8px] font-bold px-1 rounded leading-tight">
                  !
                </div>
              )}
              {item.durability < item.maxDurability && (
                <div className="absolute -bottom-1 left-1 right-1">
                  <div className="h-1 bg-[var(--rpg-background)] rounded-full overflow-hidden border border-[var(--rpg-border)]">
                    <div
                      className={`h-full ${
                        item.durability <= 0
                          ? 'bg-[var(--rpg-red)]'
                          : (item.durability / item.maxDurability) < 0.10
                            ? 'bg-[var(--rpg-gold)]'
                            : 'bg-[var(--rpg-text-secondary)]'
                      }`}
                      style={{
                        width: `${item.durability <= 0 ? 100 : (item.durability / item.maxDurability) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <span className="text-[10px] text-[var(--rpg-text-secondary)] text-center px-1 leading-tight">
              {position.label}
            </span>
          )}
        </button>
      </div>
    );
  };

  return (
    <ScreenContainer>
      <FeatureTutorial storageKey="howto_equipment" title="Equipment">
        <p>
          Equip gear across <strong>11 slots</strong>: head, neck, chest, gloves, belt, legs,
          boots, main hand, off hand, ring, and charm.
        </p>
        <p>
          Equipment has <strong>durability</strong> that degrades per hit. Weapons lose durability
          when you attack; armour loses durability when you take hits. Broken gear has reduced stats.
        </p>
        <p className="text-[var(--rpg-green-light)]">
          <strong>Tip:</strong> Use Repair All after long sessions to keep your gear in shape.
          Craft or find a backpack to increase carrying capacity.
        </p>
      </FeatureTutorial>

      <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">Equipment</h2>

      {/* Slot Selection Modal */}
      {activeSlotId && (
        <ModalOverlay opacity={80} onClose={closeModal}>
          <PixelCard className="max-w-md w-full">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold font-almendra text-[var(--rpg-text-primary)]">
                  {slotPositions[activeSlotId]?.label ?? prettySlot(activeSlotId)}
                </h3>
                <div className="text-xs text-[var(--rpg-text-secondary)]">Select an item to equip</div>
              </div>
              <button
                onClick={closeModal}
                className="text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="mb-3 p-2 rounded bg-[var(--rpg-background)] border border-[var(--rpg-red)] text-[var(--rpg-red)] text-sm">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div className="bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-[var(--rpg-text-primary)]">Currently Equipped</div>
                  {currentItem && onUnequip && (
                    <PixelButton
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        if (!activeSlotId) return;
                        setBusy(true);
                        setError(null);
                        try {
                          await onUnequip(activeSlotId);
                          closeModal();
                        } catch {
                          setError('Failed to unequip item.');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Unequip
                    </PixelButton>
                  )}
                </div>

                {currentItem ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded border-2 flex items-center justify-center text-xl flex-shrink-0"
                        style={{ borderColor: RARITY_COLORS[currentItem.rarity] }}
                      >
                        <ItemIcon imageSrc={currentItem.imageSrc} name={currentItem.name} size="md" fallback={currentItem.icon} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold font-almendra text-[var(--rpg-text-primary)] text-sm">{currentItem.name}</div>
                        {currentItem.weightClass && (
                          <div className="text-xs text-[var(--rpg-gold)]">{prettyWeightClass(currentItem.weightClass)}</div>
                        )}
                        {currentItem.maxDurability > 0 && (
                          <div className={`text-[8px] font-pixel ${currentItem.durability <= 0 ? 'text-[var(--rpg-red)]' : 'text-[var(--rpg-text-secondary)]'}`}>
                            {currentItem.durability <= 0 ? 'BROKEN' : `${fmtDur(currentItem.durability)}/${currentItem.maxDurability}`}
                          </div>
                        )}
                      </div>
                    </div>

                    {currentItem.maxDurability > 0 && (
                      <StatBar
                        current={currentItem.durability}
                        max={currentItem.maxDurability}
                        color="durability"
                        size="sm"
                        showNumbers={false}
                      />
                    )}

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <StatLine icon={Sword} label="Attack" statKey="attack" value={totalStatValue(currentItem.baseStats, currentItem.bonusStats, 'attack')} color="text-[var(--rpg-red)]" />
                      <StatLine icon={Shield} label="Armor" statKey="armor" value={totalStatValue(currentItem.baseStats, currentItem.bonusStats, 'armor')} color="text-[var(--rpg-blue-light)]" />
                      <StatLine icon={Sparkles} label="Magic Def" statKey="magicDefence" value={totalStatValue(currentItem.baseStats, currentItem.bonusStats, 'magicDefence')} color="text-[var(--rpg-purple)]" />
                      <StatLine icon={Heart} label="HP" statKey="health" value={totalStatValue(currentItem.baseStats, currentItem.bonusStats, 'health')} color="text-[var(--rpg-green-light)]" />
                      <StatLine icon={Zap} label="Dodge" statKey="dodge" value={totalStatValue(currentItem.baseStats, currentItem.bonusStats, 'dodge')} color="text-[var(--rpg-gold)]" />
                      <StatLine icon={Crosshair} label="Accuracy" statKey="accuracy" value={totalStatValue(currentItem.baseStats, currentItem.bonusStats, 'accuracy')} color="text-[var(--rpg-blue-light)]" />
                      <StatLine icon={Sparkles} label="Magic Power" statKey="magicPower" value={totalStatValue(currentItem.baseStats, currentItem.bonusStats, 'magicPower')} color="text-[var(--rpg-purple)]" />
                      <StatLine icon={Target} label="Ranged Power" statKey="rangedPower" value={totalStatValue(currentItem.baseStats, currentItem.bonusStats, 'rangedPower')} color="text-[var(--rpg-green-light)]" />
                      <StatLine icon={Zap} label="Luck" statKey="luck" value={totalStatValue(currentItem.baseStats, currentItem.bonusStats, 'luck')} color="text-[var(--rpg-gold)]" />
                      <StatLine icon={Zap} label="Crit Chance" statKey="critChance" value={totalStatValue(currentItem.baseStats, currentItem.bonusStats, 'critChance')} color="text-[var(--rpg-gold)]" />
                      <StatLine icon={Zap} label="Crit Damage" statKey="critDamage" value={totalStatValue(currentItem.baseStats, currentItem.bonusStats, 'critDamage')} color="text-[var(--rpg-gold)]" />
                      {totalStatValue(currentItem.baseStats, currentItem.bonusStats, 'inventorySlots') !== 0 && (
                        <div className="flex items-center gap-2">
                          <Backpack size={16} className="text-[var(--rpg-gold)]" />
                          <span className="text-[var(--rpg-text-secondary)]">Inventory Slots</span>
                          <span className="ml-auto font-pixel text-[12px] text-[var(--rpg-gold)]">
                            +{totalStatValue(currentItem.baseStats, currentItem.bonusStats, 'inventorySlots')}
                          </span>
                        </div>
                      )}
                    </div>

                    {(() => {
                      const bonusEntries = Object.entries(currentItem.bonusStats ?? {})
                        .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] !== 0);
                      if (bonusEntries.length === 0) return null;

                      return (
                        <div className="mt-2 border-t border-[var(--rpg-border)] pt-2">
                          <div className="text-xs font-semibold text-[var(--rpg-gold)] mb-1">Bonus Stats</div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[8px] font-pixel">
                            {bonusEntries.map(([stat, value]) => (
                              <span key={stat} className="text-[var(--rpg-green-light)]">
                                {formatSignedStatValue(stat, value)} {prettyStatName(stat)}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="text-sm text-[var(--rpg-text-secondary)]">Empty</div>
                )}
              </div>

              <div>
                <div className="text-sm font-semibold text-[var(--rpg-text-primary)] mb-2">Inventory</div>
                {candidates.length === 0 ? (
                  <div className="text-sm text-[var(--rpg-text-secondary)]">
                    No items available for this slot.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {candidates.map((item) => {
                      const COMPARE_STATS = [
                        { key: 'attack', label: 'Attack' },
                        { key: 'armor', label: 'Armor' },
                        { key: 'magicDefence', label: 'Magic Def' },
                        { key: 'health', label: 'HP' },
                        { key: 'dodge', label: 'Dodge' },
                        { key: 'accuracy', label: 'Accuracy' },
                        { key: 'magicPower', label: 'Magic Power' },
                        { key: 'rangedPower', label: 'Ranged Power' },
                        { key: 'luck', label: 'Luck' },
                        { key: 'critChance', label: 'Crit Chance' },
                        { key: 'critDamage', label: 'Crit Damage' },
                      ] as const;

                      const diffs = COMPARE_STATS.map(({ key, label }) => ({
                        key: label,
                        diff: totalStatValue(item.baseStats, item.bonusStats, key) - totalStatValue(currentItem?.baseStats, currentItem?.bonusStats, key),
                      })).filter((d) => d.diff !== 0);

                      const isEquippedHere = item.equippedSlot === activeSlotId;
                      const durability = item.durability;

                      return (
                        <div
                          key={item.id}
                          className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-3"
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className="w-10 h-10 rounded border-2 flex items-center justify-center text-xl flex-shrink-0"
                              style={{ borderColor: RARITY_COLORS[item.rarity] }}
                            >
                              <ItemIcon imageSrc={item.imageSrc} name={item.name} size="md" fallback={item.icon} />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline justify-between gap-2">
                                <div className="font-semibold text-[var(--rpg-text-primary)] text-sm truncate">
                                  {item.name}
                                </div>
                                <PixelButton
                                  variant={isEquippedHere ? 'secondary' : 'primary'}
                                  size="sm"
                                  disabled={busy || !onEquip || isEquippedHere}
                                  onClick={async () => {
                                    if (!activeSlotId || !onEquip) return;
                                    setBusy(true);
                                    setError(null);
                                    try {
                                      await onEquip(item.id, activeSlotId);
                                      closeModal();
                                    } catch {
                                      setError('Failed to equip item.');
                                    } finally {
                                      setBusy(false);
                                    }
                                  }}
                                >
                                  {isEquippedHere ? 'Equipped' : 'Equip'}
                                </PixelButton>
                              </div>
                              {item.weightClass && (
                                <div className="mt-1 text-xs text-[var(--rpg-gold)]">{prettyWeightClass(item.weightClass)}</div>
                              )}
                              {totalStatValue(item.baseStats, item.bonusStats, 'dodge') < 0 && (
                                <div className="mt-1 text-xs text-[var(--rpg-red)]">Evasion penalty: {totalStatValue(item.baseStats, item.bonusStats, 'dodge')}</div>
                              )}

                              {durability && durability.max > 0 && (
                                <div className="mt-2">
                                  <StatBar
                                    current={durability.current}
                                    max={durability.max}
                                    color="durability"
                                    size="sm"
                                    showNumbers={false}
                                  />
                                </div>
                              )}

                              {diffs.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[8px] font-pixel">
                                  {diffs.map((d) => (
                                    <span
                                      key={d.key}
                                      className={
                                        d.diff > 0
                                          ? 'text-[var(--rpg-green-light)]'
                                          : 'text-[var(--rpg-red)]'
                                      }
                                    >
                                      {d.diff > 0 ? '+' : ''}
                                      {d.diff} {d.key}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </PixelCard>
        </ModalOverlay>
      )}

      {/* Character Equipment Grid */}
      <PixelCard className="flex justify-center">
        <div className="grid grid-cols-3 gap-2 p-4">
          {Object.keys(slotPositions).map(renderSlot)}
        </div>
      </PixelCard>

      {/* Repair All */}
      {onRepairAll && repairableItems.length > 0 && (
        <PixelButton
          variant="primary"
          className="w-full"
          disabled={busy || turns === undefined || turns < totalRepairCost}
          onClick={() => setShowRepairAll(true)}
        >
          Repair All ({totalRepairCost} turns)
        </PixelButton>
      )}

      {/* Repair All Confirmation */}
      {showRepairAll && (
        <ModalOverlay opacity={80} onClose={() => setShowRepairAll(false)}>
          <PixelCard className="max-w-sm w-full">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold font-almendra text-[var(--rpg-text-primary)]">Repair All Equipment</h3>
              <button
                onClick={() => setShowRepairAll(false)}
                className="text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="mb-3 p-2 rounded bg-[var(--rpg-background)] border border-[var(--rpg-red)] text-[var(--rpg-red)] text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {repairableItems.map((r) => (
                <div key={r.slotId} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <ItemIcon imageSrc={r.item.imageSrc} name={r.item.name} size="xs" fallback={<span className="text-sm">{r.item.icon ?? '?'}</span>} />
                    <span className="text-[var(--rpg-text-primary)]">{r.item.name}</span>
                    {r.item.maxDurability > 0 && r.item.durability <= 0 && (
                      <span className="text-[8px] font-bold text-[var(--rpg-red)] bg-[var(--rpg-red)]/10 px-1 rounded">BROKEN</span>
                    )}
                  </div>
                  <span className="font-pixel text-[12px] text-[var(--rpg-text-secondary)]">{r.turnCost}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-[var(--rpg-border)] pt-3 mb-3">
              <div className="flex justify-between text-sm font-bold">
                <span className="text-[var(--rpg-text-primary)]">Total Cost</span>
                <span className="font-pixel font-normal text-[12px] text-[var(--rpg-gold)]">{totalRepairCost} turns</span>
              </div>
            </div>

            <div className="text-xs text-[var(--rpg-text-secondary)] mb-4">
              Max durability will decrease for each repaired item. Items with very low max durability may be permanently destroyed.
            </div>

            <div className="grid grid-cols-2 gap-2">
              <PixelButton
                variant="secondary"
                onClick={() => setShowRepairAll(false)}
                disabled={busy}
              >
                Cancel
              </PixelButton>
              <PixelButton
                variant="primary"
                disabled={busy || turns === undefined || turns < totalRepairCost}
                onClick={async () => {
                  if (!onRepairAll) return;
                  setBusy(true);
                  try {
                    await onRepairAll();
                    setShowRepairAll(false);
                  } catch {
                    setError('Failed to repair equipment.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Confirm
              </PixelButton>
            </div>
          </PixelCard>
        </ModalOverlay>
      )}

      <Divider className="my-1" />

      {/* Stats Panel */}
      <PixelCard variant="framed">
        <h3 className="font-semibold font-almendra text-[var(--rpg-text-primary)] mb-4">Total Stats</h3>
        <div className="grid grid-cols-2 gap-4">
          {([
            { icon: Sword, label: 'Attack', value: String(stats.attack), color: 'var(--rpg-red)' },
            { icon: Shield, label: 'Defence', value: String(stats.defence), color: 'var(--rpg-blue-light)' },
            { icon: Sparkles, label: 'Magic Def', value: String(stats.magicDefence), color: 'var(--rpg-purple)' },
            { icon: Heart, label: 'HP', value: String(stats.hp), color: 'var(--rpg-green-light)' },
            { icon: Zap, label: 'Dodge', value: String(stats.dodge), color: 'var(--rpg-gold)' },
            { icon: Crosshair, label: 'Accuracy', value: String(stats.accuracy), color: 'var(--rpg-blue-light)' },
            { icon: Zap, label: 'Crit Chance', value: `${Math.round((0.05 + stats.critChance) * 100)}%`, color: 'var(--rpg-gold)' },
            { icon: Zap, label: 'Crit Damage', value: `${Math.round((1.5 + stats.critDamage) * 100)}%`, color: 'var(--rpg-gold)' },
          ] as const).map((s) => (
            <StatBlock key={s.label} icon={s.icon} label={s.label} value={s.value} color={s.color} />
          ))}
        </div>
      </PixelCard>

      {/* Equipped Items List */}
      <div className="space-y-2">
        <h3 className="font-semibold font-almendra text-[var(--rpg-text-primary)]">Equipped Items</h3>
        {slots
          .filter((slot) => slot.item !== null)
          .map((slot) => (
            <PixelCard key={slot.id} padding="sm">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded border-2 flex items-center justify-center text-xl flex-shrink-0"
                  style={{ borderColor: slot.item ? RARITY_COLORS[slot.item.rarity] : 'var(--rpg-border)' }}
                >
                  <ItemIcon imageSrc={slot.item?.imageSrc} name={slot.item?.name ?? ''} size="md" fallback={slot.item?.icon} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="font-semibold text-[var(--rpg-text-primary)] text-sm">
                      {slot.item?.name}
                      {slot.item && slot.item.maxDurability > 0 && slot.item.durability <= 0 && (
                        <span className="ml-1.5 text-[10px] font-bold text-[var(--rpg-red)] bg-[var(--rpg-red)]/10 px-1 py-0.5 rounded">BROKEN</span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      {onRepairItem && slot.item && slot.item.durability < slot.item.maxDurability && (() => {
                        const cost = repairCost(slot.item!);
                        return (
                          <PixelButton
                            variant="secondary"
                            size="sm"
                            disabled={busy || turns === undefined || turns < cost}
                            onClick={async () => {
                              if (!slot.item) return;
                              setBusy(true);
                              try {
                                await onRepairItem(slot.item.id);
                              } catch {
                                setError('Failed to repair item.');
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Repair ({cost})
                          </PixelButton>
                        );
                      })()}
                      <span className="text-xs text-[var(--rpg-text-secondary)] capitalize">{slot.name}</span>
                    </div>
                  </div>
                  {slot.item && (
                    <>
                      <StatBar
                        current={slot.item.durability}
                        max={slot.item.maxDurability}
                        color="durability"
                        size="sm"
                        showNumbers={false}
                      />
                      {(() => {
                        const bonusEntries = Object.entries(slot.item.bonusStats ?? {})
                          .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] !== 0);
                        if (bonusEntries.length === 0) return null;

                        return (
                          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[8px] font-pixel">
                            {bonusEntries.map(([stat, value]) => (
                              <span key={stat} className={value < 0 ? 'text-[var(--rpg-red)]' : 'text-[var(--rpg-green-light)]'}>
                                {formatSignedStatValue(stat, value)} {prettyStatName(stat)}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>
            </PixelCard>
          ))}
      </div>
    </ScreenContainer>
  );
}
