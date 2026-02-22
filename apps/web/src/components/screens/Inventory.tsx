'use client';

import { useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { ItemCard } from '@/components/ItemCard';
import { PixelButton } from '@/components/PixelButton';
import { StatBar } from '@/components/StatBar';
import { Crosshair, Heart, Shield, Sword, X, Zap } from 'lucide-react';
import { titleCaseFromSnake } from '@/lib/format';
import { numStat, prettyStatName, formatSignedStatValue, signedClass, prettyWeightClass } from '@/lib/statFormat';

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
}

interface InventoryProps {
  items: Item[];
  onDrop?: (itemId: string) => void | Promise<void>;
  onSalvage?: (itemId: string) => void | Promise<void>;
  onRepair?: (itemId: string) => void | Promise<void>;
  onEquip?: (itemId: string, slot: string) => void | Promise<void>;
  onUnequip?: (slot: string) => void | Promise<void>;
  onUse?: (itemId: string) => void | Promise<void>;
  zoneCraftingLevel?: number | null;
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
  return { Icon: Zap, color: 'text-[var(--rpg-gold)]', label: prettyStatName(stat) };
}

export function Inventory({ items, onDrop, onSalvage, onRepair, onEquip, onUnequip, onUse, zoneCraftingLevel }: InventoryProps) {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);

  const stats = selectedItem?.baseStats ?? {};
  const attack = numStat(stats.attack);
  const armor = numStat(stats.armor);
  const magicDefence = numStat(stats.magicDefence);
  const health = numStat(stats.health);
  const dodge = numStat(stats.dodge);
  const accuracy = numStat(stats.accuracy);
  const bonusEntries = Object.entries(selectedItem?.bonusStats ?? {})
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] !== 0);

  const hasAnyStats = [attack, armor, magicDefence, health, dodge, accuracy].some((v) => typeof v === 'number' && v !== 0);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[var(--rpg-text-primary)]">Inventory</h2>
        <div className="text-sm text-[var(--rpg-text-secondary)]">{items.length} items</div>
      </div>

      {/* Item Grid */}
      <div className="grid grid-cols-6 gap-2">
        {items.map((item) => (
          <ItemCard
            key={item.id}
            name={item.name}
            icon={item.icon}
            imageSrc={item.imageSrc}
            quantity={item.quantity}
            rarity={item.rarity}
            onClick={() => setSelectedItem(item)}
          />
        ))}
        {/* Empty slots */}
        {Array.from({ length: Math.max(0, 24 - items.length) }).map((_, idx) => (
          <div
            key={`empty-${idx}`}
            className="aspect-square bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded-lg opacity-30"
          />
        ))}
      </div>

      {/* Item Detail Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedItem(null)}
        >
          <PixelCard className="max-w-sm w-full" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
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
                  <h3 className="text-lg font-bold text-[var(--rpg-text-primary)]">{selectedItem.name}</h3>
                  {selectedItem.equippedSlot && (
                    <div className="text-xs text-[var(--rpg-gold)] mt-0.5">
                      Equipped: {prettySlot(selectedItem.equippedSlot)}
                    </div>
                  )}
                  <div className="text-xs text-[var(--rpg-text-secondary)] capitalize">
                    {selectedItem.rarity} • {selectedItem.type}
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
                        <span className="text-[var(--rpg-red)] font-mono font-bold">BROKEN</span>
                      ) : (
                        <span className={`font-mono ${
                          (selectedItem.durability.current / selectedItem.durability.max) < 0.10
                            ? 'text-[var(--rpg-gold)]'
                            : 'text-[var(--rpg-text-primary)]'
                        }`}>
                          {selectedItem.durability.current}/{selectedItem.durability.max}
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
                        <span className={`ml-auto font-mono ${signedClass(attack, 'text-[var(--rpg-red)]')}`}>
                          {formatSignedStatValue('attack', attack)}
                        </span>
                      </div>
                    )}
                    {typeof armor === 'number' && armor !== 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Shield size={16} className="text-[var(--rpg-blue-light)]" />
                        <span className="text-[var(--rpg-text-secondary)]">Armor</span>
                        <span className={`ml-auto font-mono ${signedClass(armor, 'text-[var(--rpg-blue-light)]')}`}>
                          {formatSignedStatValue('armor', armor)}
                        </span>
                      </div>
                    )}
                    {typeof magicDefence === 'number' && magicDefence !== 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Zap size={16} className="text-[var(--rpg-purple)]" />
                        <span className="text-[var(--rpg-text-secondary)]">Magic Def</span>
                        <span className={`ml-auto font-mono ${signedClass(magicDefence, 'text-[var(--rpg-purple)]')}`}>
                          {formatSignedStatValue('magicDefence', magicDefence)}
                        </span>
                      </div>
                    )}
                    {typeof health === 'number' && health !== 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Heart size={16} className="text-[var(--rpg-green-light)]" />
                        <span className="text-[var(--rpg-text-secondary)]">HP</span>
                        <span className={`ml-auto font-mono ${signedClass(health, 'text-[var(--rpg-green-light)]')}`}>
                          {formatSignedStatValue('health', health)}
                        </span>
                      </div>
                    )}
                    {typeof dodge === 'number' && dodge !== 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Zap size={16} className="text-[var(--rpg-gold)]" />
                        <span className="text-[var(--rpg-text-secondary)]">Dodge</span>
                        <span className={`ml-auto font-mono ${signedClass(dodge, 'text-[var(--rpg-gold)]')}`}>
                          {formatSignedStatValue('dodge', dodge)}
                        </span>
                      </div>
                    )}
                    {typeof accuracy === 'number' && accuracy !== 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Crosshair size={16} className="text-[var(--rpg-blue-light)]" />
                        <span className="text-[var(--rpg-text-secondary)]">Accuracy</span>
                        <span className={`ml-auto font-mono ${signedClass(accuracy, 'text-[var(--rpg-blue-light)]')}`}>
                          {formatSignedStatValue('accuracy', accuracy)}
                        </span>
                      </div>
                    )}
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
                            <span className={`ml-auto font-mono ${value < 0 ? 'text-[var(--rpg-red)]' : color}`}>
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
                  onClick={async () => {
                    if (!onSalvage) return;
                    setBusy(true);
                    try {
                      await onSalvage(selectedItem.id);
                      setSelectedItem(null);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {noFacility ? 'No Facility' : 'Salvage'}
                </PixelButton>

                <PixelButton
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  disabled={busy || !canDrop}
                  onClick={async () => {
                    if (!onDrop) return;
                    setBusy(true);
                    try {
                      await onDrop(selectedItem.id);
                      setSelectedItem(null);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Drop
                </PixelButton>
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
                  onClick={async () => {
                    if (!onDrop) return;
                    setBusy(true);
                    try {
                      await onDrop(selectedItem.id);
                      setSelectedItem(null);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Drop
                </PixelButton>
              </div>
            )}

            {!isEquipment && !isConsumable && (
              <div className="grid grid-cols-1 gap-2">
                <PixelButton
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  disabled={busy || !canDrop}
                  onClick={async () => {
                    if (!onDrop) return;
                    setBusy(true);
                    try {
                      await onDrop(selectedItem.id);
                      setSelectedItem(null);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Drop
                </PixelButton>
              </div>
            )}
          </PixelCard>
        </div>
      )}
    </div>
  );
}
