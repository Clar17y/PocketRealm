'use client';

import { useEffect, useMemo, useState } from 'react';
import { ITEM_RARITY_CONSTANTS } from '@pocketrealm/shared';
import type { NpcKey } from '@pocketrealm/shared/constants/npcDialogue';
import { NpcDialogueBanner } from '@/components/common/NpcDialogueBanner';
import { useNpcDialogue } from '@/hooks/useNpcDialogue';
import { calculateCraftingTurnDiscount, calculateForgeUpgradeSuccessChance, getForgeRerollCost, getForgeUpgradeCost, getNextRarity } from '@pocketrealm/game-engine';
import { Anvil, HelpCircle, Sparkles, TrendingUp } from 'lucide-react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { RARITY_COLORS, rarityMeetsThreshold, type ConfirmRarity, type Rarity } from '@/lib/rarity';
import { KnockoutBanner } from '@/components/KnockoutBanner';
import { ActivityLog } from '@/components/ActivityLog';
import { inflateCost } from '@/lib/taxCalc';
import type { ActivityLogEntry } from '@/app/game/gameController.types';
import { statEntries, prettyStatName, formatStatValue } from '@/lib/statFormat';
import { ForgeTutorial } from '@/components/common/ForgeTutorial';
import { ItemIcon } from '@/components/common/ItemIcon';
import { ScreenContainer } from '../common/ScreenContainer';

function SacrificePicker({
  items,
  selectedId,
  onSelect,
  isOpen,
  onToggle,
  emptyText,
  label,
  keyPrefix,
}: {
  items: ForgeItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isOpen: boolean;
  onToggle: (open: boolean) => void;
  emptyText: string;
  label: string;
  keyPrefix: string;
}) {
  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  if (items.length === 0) {
    return <div className="text-xs text-[var(--rpg-red)]">{emptyText}</div>;
  }

  if (isOpen) {
    return (
      <>
        <div className="flex items-center justify-between">
          <div className="text-xs text-[var(--rpg-text-secondary)]">{label}</div>
          <button
            type="button"
            onClick={() => onToggle(false)}
            className="text-xs text-[var(--rpg-gold)] hover:underline"
          >
            Collapse
          </button>
        </div>
        <div className="space-y-1 max-h-36 overflow-y-auto">
          {items.map((item) => (
            <button
              key={`${keyPrefix}-${item.id}`}
              type="button"
              onClick={() => {
                onSelect(item.id);
                onToggle(false);
              }}
              className={`w-full rounded border px-2 py-1.5 text-left ${
                selectedId === item.id
                  ? 'border-[var(--rpg-gold)] bg-[var(--rpg-background)]'
                  : 'border-[var(--rpg-border)] bg-[var(--rpg-surface)]'
              }`}
            >
              <div className="text-xs font-semibold text-[var(--rpg-text-primary)] truncate">{item.name}</div>
              <div className="text-[11px] text-[var(--rpg-green-light)]">{formatBonusSummary(item.bonusStats)}</div>
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onToggle(true)}
      className="w-full text-left text-xs text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]"
    >
      Sacrifice: <span className="text-[var(--rpg-text-primary)] font-semibold">
        {selectedItem?.name ?? 'None'}
      </span>
      {' '}<span className="text-[var(--rpg-gold)]">Change</span>
    </button>
  );
}

interface ForgeItem {
  id: string;
  templateId: string;
  name: string;
  imageSrc?: string;
  rarity: Rarity;
  type: string;
  equippedSlot: string | null;
  baseStats?: Record<string, unknown>;
  bonusStats?: Record<string, unknown> | null;
  recipeSkillLevel: number | null;   // null = no recipe owned → full price
  recipeRequiredLevel: number | null;
}

interface ForgeProps {
  items: ForgeItem[];
  equippedLuck: number;
  activityLog: ActivityLogEntry[];
  onUpgrade: (itemId: string, sacrificialItemId: string) => void | Promise<void>;
  onReroll: (itemId: string, sacrificialItemId: string) => void | Promise<void>;
  isRecovering?: boolean;
  recoveryCost?: number | null;
  zoneCraftingLevel: number | null;
  zoneName?: string | null;
  guildTaxRate?: number;
  forgeLuckUses?: number;
  forgeProtectionUses?: number;
  forgeConfirmRarity?: ConfirmRarity;
  showNpcDialogue?: boolean;
}

function titleCaseRarity(rarity: Rarity): string {
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}

function formatBonusSummary(stats: Record<string, unknown> | null | undefined): string {
  const entries = statEntries(stats);
  if (entries.length === 0) return 'No bonus stats';
  return entries.map(([stat, value]) => `+${formatStatValue(stat, value)} ${prettyStatName(stat)}`).join(', ');
}

export function Forge({
  items,
  equippedLuck,
  activityLog,
  onUpgrade,
  onReroll,
  isRecovering = false,
  recoveryCost,
  zoneCraftingLevel,
  zoneName,
  guildTaxRate = 0,
  forgeLuckUses = 0,
  forgeProtectionUses = 0,
  forgeConfirmRarity = 'rare',
  showNpcDialogue = true,
}: ForgeProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(items[0]?.id ?? null);
  const [selectedUpgradeSacrificeId, setSelectedUpgradeSacrificeId] = useState<string | null>(null);
  const [selectedRerollSacrificeId, setSelectedRerollSacrificeId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'upgrade' | 'reroll' | null>(null);
  const [confirmUpgrade, setConfirmUpgrade] = useState(false);
  const [confirmReroll, setConfirmReroll] = useState(false);
  const [upgradePickerOpen, setUpgradePickerOpen] = useState(false);
  const [rerollPickerOpen, setRerollPickerOpen] = useState(false);
  const [showLuckInfo, setShowLuckInfo] = useState(false);
  const forgeNpcKey: NpcKey = zoneName?.toLowerCase() === 'thornwall' ? 'thornwall-blacksmith' : 'millbrook-blacksmith';
  const { dialogueEvent, triggerDialogueEvent } = useNpcDialogue(forgeNpcKey);
  const noFacility = zoneCraftingLevel === 0;

  const tryForgeAction = (setConfirm: (v: boolean) => void, action: () => void | Promise<void>) => {
    if (selected && rarityMeetsThreshold(selected.rarity, forgeConfirmRarity)) {
      setConfirm(true);
    } else {
      void action();
    }
  };

  useEffect(() => {
    if (!selectedItemId || !items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(items[0]?.id ?? null);
    }
  }, [items, selectedItemId]);

  const selected = useMemo(() => {
    if (!selectedItemId) return null;
    return items.find((item) => item.id === selectedItemId) ?? null;
  }, [items, selectedItemId]);

  const upgradeSacrifices = useMemo(() => {
    if (!selected) return [];
    return items
      .filter((item) => (
        item.id !== selected.id
        && !item.equippedSlot
        && item.type === selected.type
        && item.rarity === selected.rarity
      ))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, selected]);

  const rerollSacrifices = useMemo(() => {
    if (!selected) return [];
    return items
      .filter((item) => (
        item.id !== selected.id
        && !item.equippedSlot
        && item.templateId === selected.templateId
        && item.rarity === selected.rarity
      ))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, selected]);

  useEffect(() => {
    if (upgradeSacrifices.length === 0) {
      setSelectedUpgradeSacrificeId(null);
      return;
    }

    const stillValid = selectedUpgradeSacrificeId
      && upgradeSacrifices.some((item) => item.id === selectedUpgradeSacrificeId);
    if (!stillValid) {
      setSelectedUpgradeSacrificeId(upgradeSacrifices[0]?.id ?? null);
    }
  }, [upgradeSacrifices, selectedUpgradeSacrificeId]);

  useEffect(() => {
    if (rerollSacrifices.length === 0) {
      setSelectedRerollSacrificeId(null);
      return;
    }

    const stillValid = selectedRerollSacrificeId
      && rerollSacrifices.some((item) => item.id === selectedRerollSacrificeId);
    if (!stillValid) {
      setSelectedRerollSacrificeId(rerollSacrifices[0]?.id ?? null);
    }
  }, [rerollSacrifices, selectedRerollSacrificeId]);

  const handleUpgrade = async () => {
    if (!selected || !selectedUpgradeSacrificeId) return;
    setBusy('upgrade');
    try {
      await onUpgrade(selected.id, selectedUpgradeSacrificeId);
      triggerDialogueEvent('buy');
    } finally {
      setBusy(null);
    }
  };

  const handleReroll = async () => {
    if (!selected || !selectedRerollSacrificeId) return;
    setBusy('reroll');
    try {
      await onReroll(selected.id, selectedRerollSacrificeId);
      triggerDialogueEvent('buy');
    } finally {
      setBusy(null);
    }
  };

  const canUseForge = Boolean(selected && !selected.equippedSlot);
  const hasUpgradeSacrifice = upgradeSacrifices.length > 0;
  const hasRerollSacrifice = rerollSacrifices.length > 0;
  const baseUpgradeCost = selected ? getForgeUpgradeCost(selected.rarity) : null;
  const upgradeCost = baseUpgradeCost !== null && selected?.recipeSkillLevel != null && selected?.recipeRequiredLevel != null
    ? calculateCraftingTurnDiscount(baseUpgradeCost, selected.recipeSkillLevel, selected.recipeRequiredLevel)
    : baseUpgradeCost;
  const rerollCost = selected ? getForgeRerollCost(selected.rarity) : null;
  const inflatedUpgradeCost = upgradeCost !== null ? inflateCost(upgradeCost, guildTaxRate) : null;
  const inflatedRerollCost = rerollCost !== null ? inflateCost(rerollCost, guildTaxRate) : null;
  const nextRarity = selected ? getNextRarity(selected.rarity) : null;
  const baseUpgradeChance = selected ? calculateForgeUpgradeSuccessChance(selected.rarity, equippedLuck) : null;
  const upgradeChance = baseUpgradeChance !== null && forgeLuckUses > 0
    ? Math.min(1, baseUpgradeChance * 2)
    : baseUpgradeChance;
  const bonusEntries = statEntries(selected?.bonusStats);
  const baseEntries = statEntries(selected?.baseStats);

  return (
    <ScreenContainer>
      <NpcDialogueBanner npcKey={forgeNpcKey} event={dialogueEvent} showDialogue={showNpcDialogue} />
      <ForgeTutorial />
      {isRecovering && <KnockoutBanner action="forge" recoveryCost={recoveryCost} />}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">Forge</h2>
        <button
          type="button"
          onClick={() => setShowLuckInfo((v) => !v)}
          className="flex items-center gap-1 text-sm text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] transition-colors"
        >
          Luck: <span className="font-pixel text-[12px]">{equippedLuck}</span>
          {forgeLuckUses > 0 && <span className="text-[var(--rpg-gold)] text-[10px] font-pixel">2x</span>}
          <HelpCircle size={14} className="text-[var(--rpg-text-secondary)]" />
        </button>
      </div>
      {showLuckInfo && (
        <div className="text-xs text-[var(--rpg-text-secondary)] bg-[var(--rpg-surface)] rounded-lg p-3 border border-[var(--rpg-border)] space-y-1">
          <p>Each point of <span className="text-[var(--rpg-gold)]">Luck</span> increases your forge upgrade success chance by <span className="text-[var(--rpg-green-light)]">+0.1%</span>, up to a maximum bonus of <span className="text-[var(--rpg-green-light)]">+10%</span>.</p>
          <p>Your current bonus: <span className="text-[var(--rpg-green-light)]">+{Math.min(equippedLuck * 0.1, 10).toFixed(1)}%</span></p>
          <p>Luck comes from equipped gear and the luck attribute.</p>
          {forgeLuckUses > 0 && (
            <p className="text-[var(--rpg-gold)]">Forge Luck Scroll active — your next upgrade has 2x success chance ({forgeLuckUses} use{forgeLuckUses !== 1 ? 's' : ''} remaining).</p>
          )}
        </div>
      )}

      {noFacility && (
        <div className="text-sm text-[var(--rpg-text-secondary)] bg-[var(--rpg-surface)] rounded-lg p-3 border border-[var(--rpg-border)]">
          No forge available here. Travel to a town to use the forge.
        </div>
      )}

      <PixelCard>
        <div className="text-sm font-semibold text-[var(--rpg-text-primary)] mb-2">Eligible Items</div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {items.length === 0 && (
            <div className="text-sm text-[var(--rpg-text-secondary)]">No weapon or armor items in inventory.</div>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedItemId(item.id)}
              className={`w-full text-left rounded border px-3 py-2 transition-colors ${
                selectedItemId === item.id
                  ? 'border-[var(--rpg-gold)] bg-[var(--rpg-background)]'
                  : 'border-[var(--rpg-border)] bg-[var(--rpg-surface)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-9 h-9 rounded border-2 flex items-center justify-center bg-[var(--rpg-background)]"
                    style={{ borderColor: RARITY_COLORS[item.rarity] }}
                  >
                    <ItemIcon imageSrc={item.imageSrc} name={item.name} size="sm" fallback={<Anvil size={16} />} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-[var(--rpg-text-primary)] font-semibold truncate">{item.name}</div>
                    <div className="text-xs text-[var(--rpg-text-secondary)]">{titleCaseRarity(item.rarity)}</div>
                  </div>
                </div>
                {item.equippedSlot && (
                  <div className="text-xs text-[var(--rpg-gold)]">Equipped</div>
                )}
              </div>
            </button>
          ))}
        </div>
      </PixelCard>

      {selected && (
        <PixelCard className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold font-almendra text-[var(--rpg-text-primary)]">{selected.name}</div>
              <div className="text-xs text-[var(--rpg-text-secondary)]">
                {titleCaseRarity(selected.rarity)} | Bonus slots {ITEM_RARITY_CONSTANTS.BONUS_SLOTS_BY_RARITY[selected.rarity]}
              </div>
              {selected.equippedSlot && (
                <div className="text-xs text-[var(--rpg-gold)] mt-1">Unequip this item to use the forge.</div>
              )}
            </div>
          </div>

          {(baseEntries.length > 0 || bonusEntries.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-[var(--rpg-background)] rounded p-2 border border-[var(--rpg-border)]">
                <div className="text-xs text-[var(--rpg-text-secondary)] mb-1">Base Stats</div>
                <div className="space-y-0.5 text-sm">
                  {baseEntries.length === 0 && <div className="text-[var(--rpg-text-secondary)]">None</div>}
                  {baseEntries.map(([stat, value]) => (
                    <div key={`base-${stat}`} className="text-[var(--rpg-text-primary)]">
                      +{formatStatValue(stat, value)} {prettyStatName(stat)}
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-[var(--rpg-background)] rounded p-2 border border-[var(--rpg-border)]">
                <div className="text-xs text-[var(--rpg-gold)] mb-1">Bonus Stats</div>
                <div className="space-y-0.5 text-sm">
                  {bonusEntries.length === 0 && <div className="text-[var(--rpg-text-secondary)]">None</div>}
                  {bonusEntries.map(([stat, value]) => (
                    <div key={`bonus-${stat}`} className="text-[var(--rpg-green-light)]">
                      +{formatStatValue(stat, value)} {prettyStatName(stat)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border border-[var(--rpg-border)] rounded p-3 bg-[var(--rpg-surface)] space-y-2">
              <div className="flex items-center gap-2 text-[var(--rpg-text-primary)] font-semibold">
                <TrendingUp size={16} />
                Upgrade
              </div>
              <div className="text-xs text-[var(--rpg-text-secondary)]">
                {nextRarity ? `Next rarity: ${titleCaseRarity(nextRarity)}` : 'Item is at max rarity.'}
              </div>
              <div className="text-xs text-[var(--rpg-text-secondary)]">
                Success keeps existing bonus stats and adds one new bonus roll.
              </div>
              <div className="text-xs text-[var(--rpg-text-secondary)]">
                Cost: {upgradeCost === 0
                  ? <span className="text-[var(--rpg-green-light)]">Free</span>
                  : inflatedUpgradeCost !== null && inflatedUpgradeCost !== upgradeCost
                    ? <>{inflatedUpgradeCost} turns ({inflatedUpgradeCost - upgradeCost!} tax){baseUpgradeCost !== null && baseUpgradeCost !== upgradeCost && <> <span className="line-through opacity-50">({baseUpgradeCost})</span></>}</>
                    : baseUpgradeCost !== null && upgradeCost !== null && baseUpgradeCost !== upgradeCost
                      ? <>{upgradeCost} turns <span className="line-through opacity-50">({baseUpgradeCost})</span></>
                      : `${upgradeCost ?? '-'} turns`
                } + 1 sacrificial {selected?.rarity ?? ''} {selected?.type ?? 'item'}
              </div>
              <div className="text-xs text-[var(--rpg-text-secondary)]">
                Success: {typeof upgradeChance === 'number' ? `${(upgradeChance * 100).toFixed(1)}%` : '-'}
                {forgeLuckUses > 0 && <span className="text-[var(--rpg-gold)] ml-1">(2x Forge Luck — {forgeLuckUses} use{forgeLuckUses !== 1 ? 's' : ''} left)</span>}
                {forgeProtectionUses > 0 && <span className="text-[var(--rpg-green-light)] ml-1">(Protected — item saved on failure)</span>}
              </div>

              <div className="space-y-1">
                <SacrificePicker
                  items={upgradeSacrifices}
                  selectedId={selectedUpgradeSacrificeId}
                  onSelect={setSelectedUpgradeSacrificeId}
                  isOpen={upgradePickerOpen}
                  onToggle={setUpgradePickerOpen}
                  emptyText="Missing sacrificial item."
                  label="Select sacrificial item:"
                  keyPrefix="upgrade-sac"
                />
              </div>

              <PixelButton
                variant="gold"
                size="sm"
                className="w-full"
                disabled={
                  isRecovering
                  || noFacility
                  || !canUseForge
                  || !hasUpgradeSacrifice
                  || !selectedUpgradeSacrificeId
                  || !nextRarity
                  || upgradeCost === null
                  || busy !== null
                }
                onClick={() => tryForgeAction(setConfirmUpgrade, handleUpgrade)}
              >
                Upgrade Rarity
              </PixelButton>
            </div>

            <div className="border border-[var(--rpg-border)] rounded p-3 bg-[var(--rpg-surface)] space-y-2">
              <div className="flex items-center gap-2 text-[var(--rpg-text-primary)] font-semibold">
                <Sparkles size={16} />
                Reroll
              </div>
              <div className="text-xs text-[var(--rpg-text-secondary)]">
                Rerolls all bonus stats for current rarity.
              </div>
              <div className="text-xs text-[var(--rpg-text-secondary)]">
                Cost: {inflatedRerollCost !== null && inflatedRerollCost !== rerollCost
                  ? `${inflatedRerollCost} turns (${inflatedRerollCost - rerollCost!} tax)`
                  : `${rerollCost ?? '-'} turns`
                } + 1 sacrificial duplicate at same rarity
              </div>

              <div className="space-y-1">
                <SacrificePicker
                  items={rerollSacrifices}
                  selectedId={selectedRerollSacrificeId}
                  onSelect={setSelectedRerollSacrificeId}
                  isOpen={rerollPickerOpen}
                  onToggle={setRerollPickerOpen}
                  emptyText="Missing sacrificial duplicate."
                  label="Select sacrificial duplicate:"
                  keyPrefix="reroll-sac"
                />
              </div>

              <PixelButton
                variant="primary"
                size="sm"
                className="w-full"
                disabled={
                  isRecovering
                  || noFacility
                  || !canUseForge
                  || !hasRerollSacrifice
                  || !selectedRerollSacrificeId
                  || rerollCost === null
                  || busy !== null
                }
                onClick={() => tryForgeAction(setConfirmReroll, handleReroll)}
              >
                Reroll Bonus Stats
              </PixelButton>
            </div>
          </div>
        </PixelCard>
      )}

      {confirmUpgrade && (
        <ConfirmModal
          title="Confirm Upgrade"
          message="If the upgrade fails, both items will be destroyed. This cannot be undone."
          confirmLabel="Upgrade"
          variant="danger"
          onConfirm={() => { setConfirmUpgrade(false); void handleUpgrade(); }}
          onCancel={() => setConfirmUpgrade(false)}
        />
      )}
      {confirmReroll && (
        <ConfirmModal
          title="Confirm Reroll"
          message="All current bonus stats will be permanently replaced with new random stats."
          confirmLabel="Reroll"
          variant="warning"
          onConfirm={() => { setConfirmReroll(false); void handleReroll(); }}
          onCancel={() => setConfirmReroll(false)}
        />
      )}

      <ActivityLog entries={activityLog} maxHeight="max-h-48" />
    </ScreenContainer>
  );
}

