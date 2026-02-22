'use client';

import { useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { KnockoutBanner } from '@/components/KnockoutBanner';
import { Hammer, Hourglass, Sparkles, CheckCircle, XCircle, Lock, Minus, Plus } from 'lucide-react';
import { RARITY_COLORS, type Rarity } from '@/lib/rarity';
import { ActivityLog } from '@/components/ActivityLog';
import type { ActivityLogEntry } from '@/app/game/useGameController';

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
  recipes: Recipe[];
  onCraft: (recipeId: string, quantity: number) => void;
  activityLog: ActivityLogEntry[];
  isRecovering?: boolean;
  recoveryCost?: number | null;
  zoneCraftingLevel: number | null;
  zoneName: string | null;
  defaultMaxQuantity?: boolean;
}

const PERCENT_STATS = new Set(['critChance', 'critDamage']);
const STAT_ORDER = ['attack', 'armor', 'magicDefence', 'health', 'dodge', 'accuracy', 'magicPower', 'luck', 'evasion', 'critChance', 'critDamage'];

function prettyStatName(stat: string): string {
  if (stat === 'magicDefence') return 'Magic Defence';
  if (stat === 'critChance') return 'Crit Chance';
  if (stat === 'critDamage') return 'Crit Damage';
  if (stat === 'magicPower') return 'Magic Power';
  return stat
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

function formatStatValue(stat: string, value: number): string {
  if (PERCENT_STATS.has(stat)) return `${Math.round(value * 100)}%`;
  return String(value);
}

function statEntries(stats: Record<string, unknown> | undefined): Array<[string, number]> {
  return Object.entries(stats ?? {})
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] !== 0)
    .sort((a, b) => {
      const aOrder = STAT_ORDER.indexOf(a[0]);
      const bOrder = STAT_ORDER.indexOf(b[0]);
      if (aOrder === -1 && bOrder === -1) return a[0].localeCompare(b[0]);
      if (aOrder === -1) return 1;
      if (bOrder === -1) return -1;
      return aOrder - bOrder;
    });
}

export function Crafting({ skillName, skillLevel, recipes, onCraft, activityLog, isRecovering = false, recoveryCost, zoneCraftingLevel, zoneName, defaultMaxQuantity = false }: CraftingProps) {
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
    if (recipe.materials.length === 0) return 99;
    return Math.min(...recipe.materials.map((m) => Math.floor(m.owned / m.required)));
  };

  const selectedMax = selectedRecipe ? maxCraftable(selectedRecipe) : 0;

  // Reset quantity when recipe changes or when max changes
  useEffect(() => {
    if (defaultMaxQuantity && selectedMax > 0) {
      setQuantity(selectedMax);
    } else {
      setQuantity((prev) => Math.max(1, Math.min(prev, selectedMax || 1)));
    }
  }, [selectedRecipeId, selectedMax, defaultMaxQuantity]);

  const canCraft = (recipe: Recipe) => {
    if (noFacility) return false;
    if (forgeLocked(recipe)) return false;
    if (recipe.requiredLevel > skillLevel) return false;
    if (recipe.isAdvanced && recipe.isDiscovered === false) return false;
    return recipe.materials.every((m) => m.owned >= m.required);
  };

  return (
    <div className="space-y-4">
      {/* Knockout Banner */}
      {isRecovering && (
        <KnockoutBanner action="crafting" recoveryCost={recoveryCost} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-[var(--rpg-text-primary)]">{skillName}</h2>
          <div className="px-2 py-1 bg-[var(--rpg-gold)] rounded text-[var(--rpg-background)] text-sm font-bold">
            Lv. {skillLevel}
          </div>
        </div>
        <Hammer size={20} color="var(--rpg-gold)" />
      </div>

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
                      {recipe.imageSrc ? (
                        <img
                          src={recipe.imageSrc}
                          alt={recipe.name}
                          className="w-10 h-10 object-contain image-rendering-pixelated"
                        />
                      ) : (
                        recipe.icon
                      )}
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
                        <span className="text-xs text-[var(--rpg-text-secondary)]">Lv. {recipe.requiredLevel}</span>
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
              {selectedRecipe.imageSrc ? (
                <img
                  src={selectedRecipe.imageSrc}
                  alt={selectedRecipe.name}
                  className="w-14 h-14 object-contain image-rendering-pixelated"
                />
              ) : (
                selectedRecipe.icon
              )}
            </div>
            <div>
              <h3 className="font-bold text-[var(--rpg-text-primary)] text-lg">{selectedRecipe.name}</h3>
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
                  <span className="text-[var(--rpg-green-light)] font-mono font-semibold">+{formatStatValue(stat, value)}</span>
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
                  {material.imageSrc ? (
                    <img
                      src={material.imageSrc}
                      alt={material.name}
                      className="w-8 h-8 object-contain image-rendering-pixelated"
                    />
                  ) : (
                    <span className="text-2xl">{material.icon || '?'}</span>
                  )}
                  <div className="flex-1">
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm text-[var(--rpg-text-primary)]">{material.name}</span>
                      <span
                        className={`text-sm font-mono font-semibold ${
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
              <div className="text-xl font-bold text-[var(--rpg-gold)] font-mono">
                {selectedRecipe.turnCost * quantity}
                {quantity > 1 && (
                  <span className="text-xs font-normal text-[var(--rpg-text-secondary)] ml-1">
                    ({selectedRecipe.turnCost} ea)
                  </span>
                )}
              </div>
            </div>

            <div className="bg-[var(--rpg-surface)] rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={16} color="var(--rpg-blue-light)" />
                <span className="text-xs text-[var(--rpg-text-secondary)]">XP Reward</span>
              </div>
              <div className="text-xl font-bold text-[var(--rpg-blue-light)] font-mono">
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
                  className="w-8 h-8 rounded-lg bg-[var(--rpg-background)] flex items-center justify-center text-[var(--rpg-text-primary)] disabled:opacity-30 hover:bg-[var(--rpg-border)] transition-colors"
                >
                  <Minus size={14} />
                </button>
                <span className="text-lg font-bold font-mono text-[var(--rpg-gold)] w-10 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(selectedMax, q + 1))}
                  disabled={quantity >= selectedMax}
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
            disabled={isRecovering || noFacility || selectedMax < 1}
          >
            {isRecovering
              ? 'Recover First'
              : noFacility
              ? 'No Crafting Facility'
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
    </div>
  );
}

