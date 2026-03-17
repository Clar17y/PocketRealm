'use client';

import { useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { KnockoutBanner } from '@/components/KnockoutBanner';
import { Hourglass, Sparkles, CheckCircle, XCircle, Lock, Minus, Plus } from 'lucide-react';
import { RARITY_COLORS, type Rarity } from '@/lib/rarity';
import { ActivityLog } from '@/components/ActivityLog';
import { inflateCost } from '@/lib/taxCalc';
import type { ActivityLogEntry } from '@/app/game/gameController.types';
import { statEntries, prettyStatName, formatStatValue } from '@/lib/statFormat';
import { ItemIcon } from '@/components/common/ItemIcon';
import { SkillHeader } from '@/components/common/SkillHeader';
import { ScreenContainer } from '../common/ScreenContainer';

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
  materials: Material[];
  rarity: Rarity;
}

interface CraftingProps {
  skillName: string;
  skillLevel: number;
  xpRate: number;
  recipes: Recipe[];
  onCraft: (recipeId: string, quantity: number) => void;
  activityLog: ActivityLogEntry[];
  isRecovering?: boolean;
  recoveryCost?: number | null;
  zoneCraftingLevel: number | null;
  zoneName: string | null;
  defaultMaxQuantity?: boolean;
  guildTaxRate?: number;
  backpackFull?: boolean;
  isOverEncumbered?: boolean;
  availableSlots?: number;
}


export function Crafting({ skillName, skillLevel, xpRate, recipes, onCraft, activityLog, isRecovering = false, recoveryCost, zoneCraftingLevel, zoneName, defaultMaxQuantity = false, guildTaxRate = 0, backpackFull = false, isOverEncumbered = false, availableSlots = 0 }: CraftingProps) {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

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
  const selectedRecipeLocked = selectedRecipe?.isAdvanced && selectedRecipe?.isDiscovered === false;
  const selectedLevelLocked = selectedRecipe ? selectedRecipe.requiredLevel > skillLevel : false;

  const noFacility = zoneCraftingLevel === 0;
  const forgeLocked = (recipe: Recipe) =>
    zoneCraftingLevel !== null && recipe.requiredLevel > zoneCraftingLevel;
  const selectedForgeLocked = selectedRecipe ? forgeLocked(selectedRecipe) : false;

  const maxCraftable = (recipe: Recipe): number => {
    if (noFacility) return 0;
    if (forgeLocked(recipe)) return 0;
    if (recipe.requiredLevel > skillLevel) return 0;
    if (recipe.isAdvanced && recipe.isDiscovered === false) return 0;
    if (recipe.materials.length === 0) return recipe.stackable ? 99 : Math.min(99, availableSlots);
    const materialMax = Math.min(...recipe.materials.map((m) => Math.floor(m.owned / m.required)));
    if (recipe.stackable) return materialMax;
    return Math.min(materialMax, availableSlots);
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

  const canCraft = (recipe: Recipe) => {
    if (noFacility) return false;
    if (forgeLocked(recipe)) return false;
    if (recipe.requiredLevel > skillLevel) return false;
    if (recipe.isAdvanced && recipe.isDiscovered === false) return false;
    return recipe.materials.every((m) => m.owned >= m.required);
  };

  return (
    <ScreenContainer>
      {/* Knockout Banner */}
      {isRecovering && (
        <KnockoutBanner action="crafting" recoveryCost={recoveryCost} />
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

          {/* Base Stats */}
          <div className="space-y-2 mb-4">
            <h4 className="font-semibold text-[var(--rpg-text-primary)] text-sm">Base Stats</h4>
            {selectedBaseStats.length === 0 ? (
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

          {/* Quantity Selector */}
          {selectedMax > 1 && !selectedRecipeLocked && !selectedLevelLocked && (
            <div className="flex items-center justify-between mb-4 bg-[var(--rpg-surface)] rounded-lg p-3">
              <span className="text-sm font-semibold text-[var(--rpg-text-primary)]">Quantity</span>
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

          {/* Craft Button */}
          <PixelButton
            variant="gold"
            size="lg"
            className="w-full"
            onClick={() => onCraft(selectedRecipe.id, quantity)}
            disabled={isOverEncumbered || isRecovering || noFacility || selectedMax < 1 || backpackFull}
          >
            {isOverEncumbered
              ? 'Over-Encumbered'
              : isRecovering
              ? 'Recover First'
              : noFacility
              ? 'No Crafting Facility'
              : backpackFull
              ? 'Backpack Full'
              : selectedForgeLocked
              ? 'Requires Higher-Level Forge'
              : selectedLevelLocked
              ? `Requires Lv. ${selectedRecipe.requiredLevel}`
              : selectedRecipeLocked
              ? 'Discover Recipe First'
              : quantity > 1
              ? `Craft ${quantity}x ${selectedRecipe.name}`
              : `Craft ${selectedRecipe.name}`}
          </PixelButton>
        </PixelCard>
      )}

      <ActivityLog entries={activityLog} maxHeight="max-h-48" />
    </ScreenContainer>
  );
}

