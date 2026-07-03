'use client';

import { useEffect, useState } from 'react';
import {
  calculateAutoForgeExpectedForgeTurnCost,
  calculateCraftMaxReservedBaseTurnCost,
  getAutoForgeMinimumOpenSlots,
  isAutoForgeEligibleItemType,
} from '@pocketrealm/game-engine';
import { CRAFTING_CONSTANTS, type AutoForgeTarget, type CraftDestination, type ItemType } from '@pocketrealm/shared';
import type { NpcKey } from '@pocketrealm/shared/constants/npcDialogue';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { KnockoutBanner } from '@/components/KnockoutBanner';
import { ActivityLockBanner } from '@/components/common/ActivityLockBanner';
import { NpcDialogueBanner } from '@/components/common/NpcDialogueBanner';
import { useNpcDialogue } from '@/hooks/useNpcDialogue';
import { Hourglass, Sparkles, CheckCircle, XCircle, Lock, Minus, Plus } from 'lucide-react';
import { RARITY_COLORS, type Rarity } from '@/lib/rarity';
import { ActivityLog } from '@/components/ActivityLog';
import { inflateCost } from '@/lib/taxCalc';
import type { ActivityLogEntry } from '@/app/game/gameController.types';
import { statEntries, prettyStatName, formatStatValue } from '@/lib/statFormat';
import type { CraftingConsumableEffect } from '@/lib/api';
import { ItemIcon } from '@/components/common/ItemIcon';
import { SkillHeader } from '@/components/common/SkillHeader';
import { ScreenContainer } from '../common/ScreenContainer';
import { DockedActionBar } from '../common/DockedActionBar';

interface Material {
  name: string;
  icon: string;
  imageSrc?: string;
  required: number;
  owned: number;
}

interface Recipe {
  id: string;
  name: string;
  itemType: string;
  icon?: string;
  imageSrc?: string;
  isAdvanced?: boolean;
  isDiscovered?: boolean;
  discoveryHint?: string | null;
  soulbound?: boolean;
  stackable?: boolean;
  resultQuantity: number;
  requiredLevel: number;
  turnCost: number;
  xpReward: number;
  baseStats: Record<string, unknown>;
  consumableEffect?: CraftingConsumableEffect | null;
  materials: Material[];
  rarity: Rarity;
}

const CRAFTING_NPC_MAP: Record<string, Record<string, NpcKey>> = {
  weaponsmithing: {
    millbrook: 'kessa-weaponsmithing',
    thornwall: 'thornwall-weaponsmithing',
  },
  armorsmithing: {
    millbrook: 'kessa-armorsmithing',
    thornwall: 'thornwall-armorsmithing',
  },
  refining: {
    millbrook: 'kessa-refining',
    thornwall: 'thornwall-refining',
  },
  alchemy: {
    millbrook: 'millbrook-herbalist',
    thornwall: 'thornwall-herbalist',
  },
  leatherworking: {
    millbrook: 'millbrook-artisan-leatherworking',
    thornwall: 'thornwall-artisan-leatherworking',
  },
  tailoring: {
    millbrook: 'millbrook-artisan-tailoring',
    thornwall: 'thornwall-artisan-tailoring',
  },
  jewelcrafting: {
    millbrook: 'millbrook-jeweller',
    thornwall: 'thornwall-jeweller',
  },
  weaving: {
    millbrook: 'millbrook-artisan-weaving',
    thornwall: 'thornwall-artisan-weaving',
  },
  tanning: {
    millbrook: 'millbrook-artisan-tanning',
    thornwall: 'thornwall-artisan-tanning',
  },
};

function getCraftingNpc(skillType: string, zoneName: string | null): NpcKey | undefined {
  const zoneMap = CRAFTING_NPC_MAP[skillType];
  if (!zoneMap) return undefined;
  const key = (zoneName ?? '').toLowerCase();
  return zoneMap[key] ?? zoneMap['millbrook'];
}

function formatRoundCount(rounds: number): string {
  return `${rounds} round${rounds === 1 ? '' : 's'}`;
}

function formatEffectValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function formatEffectPercent(value: number): string {
  return `${formatEffectValue(value * 100)}%`;
}

function finiteEffectValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function withDuration(text: string, duration: number | undefined): string {
  return duration ? `${text} for ${formatRoundCount(duration)}` : text;
}

function assertNeverEffect(type: never): null {
  void type;
  return null;
}

function formatConsumableEffect(effect: CraftingConsumableEffect | null | undefined): string | null {
  if (!effect) return null;

  const value = finiteEffectValue(effect.value);

  switch (effect.type) {
    case 'heal_flat':
      return value === null ? 'Restores HP' : `Restores ${formatEffectValue(value)} HP`;
    case 'heal_percent':
      return value === null ? 'Restores HP' : `Restores ${formatEffectPercent(value)} HP`;
    case 'restore_stamina':
      return value === null ? 'Restores stamina' : `Restores ${formatEffectValue(value)} stamina`;
    case 'restore_mana':
      return value === null ? 'Restores mana' : `Restores ${formatEffectValue(value)} mana`;
    case 'cleanse_magic_dot':
      if (value === null) return 'Cleanses 1 magic DoT';
      if (value <= 0) return 'Cleanses all magic DoTs';
      return `Cleanses ${formatEffectValue(value)} magic DoT${value === 1 ? '' : 's'}`;
    case 'buff_attack':
      return withDuration(
        value === null ? 'Increases attack' : `Increases attack by ${formatEffectPercent(value)}`,
        effect.duration,
      );
    case 'buff_defence':
      return withDuration(
        value === null ? 'Increases defence and magic defence' : `Increases defence and magic defence by ${formatEffectValue(value)}`,
        effect.duration,
      );
    default:
      return assertNeverEffect(effect.type);
  }
}

function isKnownItemType(value: string): value is ItemType {
  return value === 'weapon' || value === 'armor' || value === 'resource' || value === 'consumable';
}

function formatAutoForgeTargetLabel(target: AutoForgeTarget): string {
  switch (target) {
    case 'rare':
      return 'Rare+';
    case 'epic':
      return 'Epic+';
    case 'legendary':
      return 'Legendary';
  }
}

interface CraftingProps {
  skillType?: string;
  skillName: string;
  skillLevel: number;
  xpRate: number;
  recipes: Recipe[];
  onCraft: (
    recipeId: string,
    quantity: number,
    options: { destination: CraftDestination; autoForgeMinRarity: AutoForgeTarget | null },
  ) => void;
  activityLog: ActivityLogEntry[];
  isRecovering?: boolean;
  recoveryCost?: number | null;
  zoneCraftingLevel: number | null;
  zoneName: string | null;
  defaultMaxQuantity?: boolean;
  guildTaxRate?: number;
  backpackFull?: boolean;
  isOverEncumbered?: boolean;
  isActivityLocked?: boolean;
  activityLockReason?: 'encounter' | 'expedition' | null;
  availableSlots?: number;
  showNpcDialogue?: boolean;
}


export function Crafting({ skillType, skillName, skillLevel, xpRate, recipes, onCraft, activityLog, isRecovering = false, recoveryCost, zoneCraftingLevel, zoneName, defaultMaxQuantity = false, guildTaxRate = 0, backpackFull = false, isOverEncumbered = false, isActivityLocked = false, activityLockReason, availableSlots = 0, showNpcDialogue = true }: CraftingProps) {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [destination, setDestination] = useState<CraftDestination>('inventory');
  const [autoForgeMinRarity, setAutoForgeMinRarity] = useState<AutoForgeTarget | null>(null);
  const npcKey = skillType ? getCraftingNpc(skillType, zoneName) : undefined;
  const { dialogueEvent, triggerDialogueEvent } = useNpcDialogue(npcKey);

  useEffect(() => {
    if (recipes.length === 0) {
      setSelectedRecipeId(null);
      return;
    }
    if (!selectedRecipeId || !recipes.some((recipe) => recipe.id === selectedRecipeId)) {
      setSelectedRecipeId(recipes[0].id);
    }
  }, [recipes, selectedRecipeId]);

  const selectedRecipe = selectedRecipeId ? recipes.find((recipe) => recipe.id === selectedRecipeId) ?? null : null;
  const selectedBaseStats = statEntries(selectedRecipe?.baseStats);
  const selectedEffect = formatConsumableEffect(selectedRecipe?.consumableEffect);
  const selectedRecipeLocked = selectedRecipe?.isAdvanced && selectedRecipe?.isDiscovered === false;
  const selectedLevelLocked = selectedRecipe ? selectedRecipe.requiredLevel > skillLevel : false;
  const autoForgeEligible = selectedRecipe
    ? isKnownItemType(selectedRecipe.itemType)
      && isAutoForgeEligibleItemType(selectedRecipe.itemType, Boolean(selectedRecipe.stackable))
    : false;
  const selectedAutoForgeTarget = autoForgeEligible ? autoForgeMinRarity : null;
  const quantityLabel = selectedAutoForgeTarget ? 'Craft attempts' : 'Quantity';
  const minimumOpenSlots = selectedAutoForgeTarget ? getAutoForgeMinimumOpenSlots(selectedAutoForgeTarget) : 0;
  const lacksAutoForgeSlots = destination === 'inventory'
    && selectedAutoForgeTarget !== null
    && availableSlots < minimumOpenSlots;

  const noFacility = zoneCraftingLevel === 0;
  const forgeLocked = (recipe: Recipe) =>
    zoneCraftingLevel !== null && recipe.requiredLevel > zoneCraftingLevel;
  const selectedForgeLocked = selectedRecipe ? forgeLocked(selectedRecipe) : false;

  const maxCraftable = (recipe: Recipe): number => {
    if (noFacility) return 0;
    if (forgeLocked(recipe)) return 0;
    if (recipe.requiredLevel > skillLevel) return 0;
    if (recipe.isAdvanced && recipe.isDiscovered === false) return 0;
    const attemptBudgetCap = CRAFTING_CONSTANTS.CRAFT_ATTEMPT_BUDGET_CAP;
    const clampAttempts = (value: number) => Math.min(value, attemptBudgetCap);
    if (recipe.materials.length === 0) {
      if (recipe.stackable) return attemptBudgetCap;
      return destination === 'stash' || selectedAutoForgeTarget ? attemptBudgetCap : clampAttempts(availableSlots);
    }
    const materialMax = Math.min(...recipe.materials.map((m) => Math.floor(m.owned / m.required)));
    if (recipe.stackable) return clampAttempts(materialMax);
    if (destination === 'stash' || selectedAutoForgeTarget) return clampAttempts(materialMax);
    return clampAttempts(Math.min(materialMax, availableSlots));
  };

  const selectedMax = selectedRecipe ? maxCraftable(selectedRecipe) : 0;

  // Reset quantity when recipe changes or when max changes
  useEffect(() => {
    if (defaultMaxQuantity && selectedRecipe?.stackable && selectedMax > 0) {
      setQuantity(selectedMax);
    } else {
      setQuantity((prev) => Math.max(1, Math.min(prev, selectedMax || 1)));
    }
  }, [selectedRecipeId, selectedMax, defaultMaxQuantity, selectedRecipe?.stackable]);

  useEffect(() => {
    setAutoForgeMinRarity(null);
    setDestination('inventory');
  }, [selectedRecipeId]);

  const canCraft = (recipe: Recipe) => {
    if (noFacility) return false;
    if (forgeLocked(recipe)) return false;
    if (recipe.requiredLevel > skillLevel) return false;
    if (recipe.isAdvanced && recipe.isDiscovered === false) return false;
    return recipe.materials.every((m) => m.owned >= m.required);
  };

  return (
    <ScreenContainer bottomInset>
      {npcKey && <NpcDialogueBanner npcKey={npcKey} event={dialogueEvent} showDialogue={showNpcDialogue} />}

      {/* Knockout Banner */}
      {isRecovering && (
        <KnockoutBanner action="crafting" recoveryCost={recoveryCost} />
      )}

      {/* Activity Lock Banner */}
      {isActivityLocked && !isRecovering && (
        <ActivityLockBanner activityLockReason={activityLockReason ?? null} action="crafting" />
      )}

      {/* Header */}
      <SkillHeader skillName={skillName} skillLevel={skillLevel} xpRate={xpRate} />

      {/* Recipe List */}
      <div className="space-y-2">
        <h3 className="font-semibold text-[var(--rpg-text-primary)] text-sm">Recipes</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {recipes.map((recipe) => {
            const isSelected = selectedRecipeId === recipe.id;
            const craftable = canCraft(recipe);
            const levelLocked = recipe.requiredLevel > skillLevel;
            const discoveryLocked = recipe.isAdvanced && recipe.isDiscovered === false;
            const forgeCapLocked = forgeLocked(recipe);
            const listLocked = levelLocked || discoveryLocked || noFacility || forgeCapLocked;

            return (
              <button
                key={recipe.id}
                onClick={() => { setSelectedRecipeId(recipe.id); setQuantity(1); }}
                className={`w-full text-left transition-all ${listLocked ? 'opacity-50' : ''}`}
              >
                <PixelCard
                  padding="sm"
                  className={`${
                    isSelected
                      ? 'border-[var(--rpg-gold)]'
                      : craftable
                      ? 'border-[var(--rpg-green-dark)]'
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded border-2 flex items-center justify-center text-2xl flex-shrink-0"
                      style={{ borderColor: RARITY_COLORS[recipe.rarity] }}
                    >
                      <ItemIcon imageSrc={recipe.imageSrc} name={recipe.name} size="lg" fallback={recipe.icon} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-baseline justify-between">
                        <h4 className="font-semibold text-[var(--rpg-text-primary)] text-sm flex items-center gap-2">
                          {recipe.name}
                          {recipe.resultQuantity > 1 && (
                            <span className="text-[var(--rpg-text-secondary)] ml-1">x{recipe.resultQuantity}</span>
                          )}
                          {recipe.isAdvanced && (
                            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--rpg-red)] text-white">
                              Advanced
                            </span>
                          )}
                        </h4>
                        <span className="text-[8px] text-[var(--rpg-text-secondary)] font-pixel">Lv. {recipe.requiredLevel}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {levelLocked ? (
                          <Lock size={12} color="var(--rpg-text-secondary)" />
                        ) : craftable ? (
                          <CheckCircle size={12} color="var(--rpg-green-light)" />
                        ) : (
                          <XCircle size={12} color="var(--rpg-red)" />
                        )}
                        <span className="text-xs text-[var(--rpg-text-secondary)]">
                          {noFacility
                            ? 'No crafting facilities here'
                            : forgeCapLocked
                            ? `Requires higher-level forge (Lv. ${recipe.requiredLevel})`
                            : levelLocked
                            ? `Unlocks at Lv. ${recipe.requiredLevel}`
                            : discoveryLocked
                            ? 'Recipe not discovered'
                            : craftable
                            ? `Can craft (${maxCraftable(recipe)})`
                            : 'Missing materials'}
                        </span>
                      </div>
                    </div>
                  </div>
                </PixelCard>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Recipe Detail */}
      {selectedRecipe && (
        <PixelCard className="bg-[var(--rpg-background)]">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-16 h-16 rounded-lg border-2 flex items-center justify-center text-3xl flex-shrink-0"
              style={{ borderColor: RARITY_COLORS[selectedRecipe.rarity] }}
            >
              <ItemIcon imageSrc={selectedRecipe.imageSrc} name={selectedRecipe.name} size="2xl" fallback={selectedRecipe.icon} />
            </div>
            <div>
              <h3 className="font-bold font-almendra text-[var(--rpg-text-primary)] text-lg">{selectedRecipe.name}</h3>
              <p className="text-xs text-[var(--rpg-text-secondary)] capitalize">
                {selectedRecipe.rarity} - Lv. {selectedRecipe.requiredLevel} Required
                {selectedLevelLocked && (
                  <span className="text-[var(--rpg-red)] ml-1">(Need {selectedRecipe.requiredLevel - skillLevel} more levels)</span>
                )}
              </p>
              {selectedRecipe.isAdvanced && (
                <p className="text-xs text-[var(--rpg-gold)]">
                  Advanced recipe{selectedRecipe.soulbound ? ' - Soulbound result' : ''}
                </p>
              )}
              {selectedRecipeLocked && (
                <p className="text-xs text-[var(--rpg-text-secondary)] mt-1">
                  {selectedRecipe.discoveryHint ?? 'A unique drop from a large encounter site.'}
                </p>
              )}
            </div>
          </div>

          {/* Base Stats / Effects */}
          <div className="space-y-2 mb-4">
            <h4 className="font-semibold text-[var(--rpg-text-primary)] text-sm">
              {selectedEffect ? 'Effect' : 'Base Stats'}
            </h4>
            {selectedEffect ? (
              <div className="text-sm text-[var(--rpg-green-light)]">{selectedEffect}</div>
            ) : selectedBaseStats.length === 0 ? (
              <div className="text-sm text-[var(--rpg-text-secondary)]">No base stats</div>
            ) : (
              selectedBaseStats.map(([stat, value]) => (
                <div key={stat} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--rpg-text-primary)]">{prettyStatName(stat)}</span>
                  <span className="text-[var(--rpg-green-light)] font-pixel text-[12px]">+{formatStatValue(stat, value)}</span>
                </div>
              ))
            )}
          </div>

          {/* Required Materials */}
          <div className="space-y-2 mb-4">
            <h4 className="font-semibold text-[var(--rpg-text-primary)] text-sm">Required Materials</h4>
            {selectedRecipe.materials.map((material, idx) => {
              const totalRequired = material.required * quantity;
              const hasEnough = material.owned >= totalRequired;
              return (
                <div key={idx} className="flex items-center gap-3">
                  <ItemIcon imageSrc={material.imageSrc} name={material.name} size="md" fallback={<span className="text-2xl">{material.icon || '?'}</span>} />
                  <div className="flex-1">
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm text-[var(--rpg-text-primary)]">{material.name}</span>
                      <span
                        className={`text-[12px] font-pixel ${
                          hasEnough ? 'text-[var(--rpg-green-light)]' : 'text-[var(--rpg-red)]'
                        }`}
                      >
                        {material.owned} / {totalRequired}
                      </span>
                    </div>
                  </div>
                  {hasEnough ? (
                    <CheckCircle size={16} color="var(--rpg-green-light)" />
                  ) : (
                    <XCircle size={16} color="var(--rpg-red)" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Cost and Reward */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-[var(--rpg-surface)] rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Hourglass size={16} color="var(--rpg-gold)" />
                <span className="text-xs text-[var(--rpg-text-secondary)]">Turn Cost</span>
              </div>
              {(() => {
                const baseCost = selectedRecipe.turnCost * quantity;
                const inflated = inflateCost(baseCost, guildTaxRate);
                const taxAmount = inflated - baseCost;
                return (
                  <>
                    <div className="text-[24px] text-[var(--rpg-gold)] font-pixel">
                      {inflated}
                      {quantity > 1 && (
                        <span className="text-xs font-normal text-[var(--rpg-text-secondary)] ml-1">
                          ({selectedRecipe.turnCost} ea)
                        </span>
                      )}
                    </div>
                    {taxAmount > 0 && (
                      <div className="text-xs text-[var(--rpg-text-secondary)]">
                        {taxAmount} guild tax
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="bg-[var(--rpg-surface)] rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={16} color="var(--rpg-blue-light)" />
                <span className="text-xs text-[var(--rpg-text-secondary)]">XP Reward</span>
              </div>
              <div className="text-[24px] text-[var(--rpg-blue-light)] font-pixel">
                {selectedRecipe.xpReward * quantity}
                {quantity > 1 && (
                  <span className="text-xs font-normal text-[var(--rpg-text-secondary)] ml-1">
                    ({selectedRecipe.xpReward} ea)
                  </span>
                )}
              </div>
            </div>
          </div>

        </PixelCard>
      )}

      <ActivityLog entries={activityLog} maxHeight="max-h-48" />

      {selectedRecipe && (
        <DockedActionBar>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {(['inventory', 'stash'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDestination(value)}
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  destination === value
                    ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                    : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
                }`}
              >
                {value === 'inventory' ? 'Inventory' : 'Stash'}
              </button>
            ))}
          </div>

          {autoForgeEligible && (
            <div className="grid grid-cols-4 gap-2 mb-2">
              {[
                { label: 'Off', value: null },
                { label: 'Rare+', value: 'rare' as const },
                { label: 'Epic+', value: 'epic' as const },
                { label: 'Legendary', value: 'legendary' as const },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setAutoForgeMinRarity(option.value)}
                  className={`px-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    autoForgeMinRarity === option.value
                      ? 'bg-[var(--rpg-blue)] text-white'
                      : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {/* Quantity Selector */}
          {selectedMax > 1 && !selectedRecipeLocked && !selectedLevelLocked && (
            <div className="flex items-center justify-between mb-2 bg-[var(--rpg-surface)] rounded-lg p-3">
              <span className="text-sm font-semibold text-[var(--rpg-text-primary)]">{quantityLabel}</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  aria-label="Decrease quantity"
                  className="w-8 h-8 rounded-lg bg-[var(--rpg-background)] flex items-center justify-center text-[var(--rpg-text-primary)] disabled:opacity-30 hover:bg-[var(--rpg-border)] transition-colors"
                >
                  <Minus size={14} />
                </button>
                <span className="text-[12px] font-pixel text-[var(--rpg-gold)] w-10 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(selectedMax, q + 1))}
                  disabled={quantity >= selectedMax}
                  aria-label="Increase quantity"
                  className="w-8 h-8 rounded-lg bg-[var(--rpg-background)] flex items-center justify-center text-[var(--rpg-text-primary)] disabled:opacity-30 hover:bg-[var(--rpg-border)] transition-colors"
                >
                  <Plus size={14} />
                </button>
                <button
                  onClick={() => setQuantity(selectedMax)}
                  className="px-2 py-1 rounded text-xs font-semibold bg-[var(--rpg-background)] text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-gold)] transition-colors"
                >
                  Max ({selectedMax})
                </button>
              </div>
            </div>
          )}

          {selectedAutoForgeTarget && selectedRecipe && (
            <div className="mb-2 text-xs text-[var(--rpg-text-secondary)] bg-[var(--rpg-surface)] rounded-lg p-3 space-y-1">
              {(() => {
                const craftCost = selectedRecipe.turnCost * quantity;
                const expectedForge = calculateAutoForgeExpectedForgeTurnCost({
                  craftAttempts: quantity,
                  target: selectedAutoForgeTarget,
                  luckStat: 0,
                });
                const maxReserved = calculateCraftMaxReservedBaseTurnCost({
                  craftAttempts: quantity,
                  craftTurnCostPerAttempt: selectedRecipe.turnCost,
                  autoForgeTarget: selectedAutoForgeTarget,
                });
                return (
                  <>
                    <div>Craft: {inflateCost(craftCost, guildTaxRate).toLocaleString()} turns</div>
                    <div>Rough forge: ~{inflateCost(expectedForge, guildTaxRate).toLocaleString()} turns</div>
                    <div>Max reserved: {inflateCost(maxReserved, guildTaxRate).toLocaleString()} turns</div>
                    <div>Unspent turns are kept</div>
                  </>
                );
              })()}
              {lacksAutoForgeSlots && (
                <div className="text-[var(--rpg-red)]">
                  {formatAutoForgeTargetLabel(selectedAutoForgeTarget)} auto-forge needs {minimumOpenSlots} open backpack slots.
                </div>
              )}
            </div>
          )}

          {/* Craft Button */}
          <PixelButton
            variant="gold"
            size="lg"
            className="w-full"
            onClick={() => {
              onCraft(selectedRecipe.id, quantity, {
                destination,
                autoForgeMinRarity: selectedAutoForgeTarget,
              });
              triggerDialogueEvent('buy');
            }}
            disabled={
              (destination === 'inventory' && isOverEncumbered)
              || isRecovering
              || isActivityLocked
              || noFacility
              || selectedMax < 1
              || (destination === 'inventory' && !selectedAutoForgeTarget && backpackFull)
              || lacksAutoForgeSlots
            }
          >
            {isActivityLocked
              ? (activityLockReason === 'encounter' ? 'In Encounter Site' : 'In Expedition')
              : destination === 'inventory' && isOverEncumbered
              ? 'Over-Encumbered'
              : isRecovering
              ? 'Recover First'
              : noFacility
              ? 'No Crafting Facility'
              : destination === 'inventory' && !selectedAutoForgeTarget && backpackFull
              ? 'Backpack Full'
              : lacksAutoForgeSlots
              ? `Need ${minimumOpenSlots} Open Slots`
              : selectedForgeLocked
              ? 'Requires Higher-Level Forge'
              : selectedLevelLocked
              ? `Requires Lv. ${selectedRecipe.requiredLevel}`
              : selectedRecipeLocked
              ? 'Discover Recipe First'
              : selectedAutoForgeTarget && destination === 'stash'
              ? `Craft ${quantity > 1 ? `${quantity}x ` : ''}${selectedRecipe.name} to stash and forge to ${formatAutoForgeTargetLabel(selectedAutoForgeTarget)}`
              : selectedAutoForgeTarget
              ? `Craft ${quantity > 1 ? `${quantity}x ` : ''}${selectedRecipe.name} and forge to ${formatAutoForgeTargetLabel(selectedAutoForgeTarget)}`
              : destination === 'stash'
              ? `Craft ${quantity > 1 ? `${quantity}x ` : ''}${selectedRecipe.name} to stash`
              : quantity > 1
              ? `Craft ${quantity}x ${selectedRecipe.name}`
              : `Craft ${selectedRecipe.name}`}
          </PixelButton>
        </DockedActionBar>
      )}
    </ScreenContainer>
  );
}

