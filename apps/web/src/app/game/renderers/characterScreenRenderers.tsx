'use client';

import React, { useMemo } from 'react';
import type { Sword } from 'lucide-react';
import { CRAFTING_CONSTANTS, type SkillType } from '@pocketrealm/shared';
import { calculateEfficiency, xpForLevel } from '@pocketrealm/game-engine';
import { Equipment } from '@/components/screens/Equipment';
import { Inventory } from '@/components/screens/Inventory';
import { Skills } from '@/components/screens/Skills';
import { TalentTree } from '@/components/screens/TalentTree';
import { TrainingGrounds } from '@/components/screens/TrainingGrounds';
import { itemImageSrc, skillIconSrc } from '@/lib/assets';
import { titleCaseFromSnake } from '@/lib/format';
import { buildRecipeDiscountLookup, getDiscountedCost } from '@/lib/recipeDiscount';
import { SKILL_META } from '../pageConstants';
import { useEquipmentStats } from '../hooks/useEquipmentStats';
import type { GameControllerState } from './gameScreenRenderer.types';

export function InventoryScreenRenderer({
  gc,
  currentZoneType,
}: {
  gc: GameControllerState;
  currentZoneType?: string | null;
}) {
  const discountLookup = useMemo(
    () => buildRecipeDiscountLookup(gc.craftingRecipes, gc.skills),
    [gc.craftingRecipes, gc.skills]
  );

  return (
    <Inventory
      items={gc.inventory.map((item) => {
        const isEquipment = item.template.itemType === 'weapon' || item.template.itemType === 'armor';
        const hasSalvageRecipe = isEquipment && discountLookup.recipeByTemplateId.has(item.template.id);
        const salvageCost = hasSalvageRecipe
          ? getDiscountedCost(discountLookup, item.template.id, CRAFTING_CONSTANTS.SALVAGE_TURN_COST)
          : null;
        const templateMax = item.template.maxDurability ?? 0;
        const max = item.maxDurability ?? templateMax;
        const durability = isEquipment && max > 0
          ? { current: item.currentDurability ?? max, max }
          : null;

        return {
          id: item.id,
          name: item.template.name,
          imageSrc: itemImageSrc(item.template.name, item.template.itemType),
          quantity: item.quantity,
          rarity: item.rarity,
          description: (gc.showItemFlavourText && item.template.flavorText) || item.template.itemType,
          type: item.template.itemType,
          tier: item.template.tier,
          weightClass: item.template.weightClass ?? null,
          slot: item.template.slot,
          equippedSlot: item.equippedSlot,
          durability,
          baseStats: item.template.baseStats,
          bonusStats: item.bonusStats ?? null,
          requiredSkill: item.template.requiredSkill ?? null,
          requiredLevel: item.template.requiredLevel ?? 1,
          salvageCost,
          sellPrice: item.template.sellPrice ?? null,
        };
      })}
      capacity={gc.inventoryCapacity}
      usedSlots={gc.inventoryUsedSlots}
      gold={gc.gold}
      isInTown={currentZoneType === 'town'}
      onDrop={gc.handleDestroyItem}
      onSalvage={gc.handleSalvageItem}
      onSalvageBatch={gc.handleSalvageBatch}
      onRepair={gc.handleRepairItem}
      onEquip={gc.handleEquipItem}
      onUnequip={gc.handleUnequipSlot}
      onUse={gc.handleUseItem}
      onSell={gc.handleSellItem}
      onSellBatch={gc.handleSellBatch}
      onDeposit={gc.handleDepositItem}
      onDepositBatch={gc.handleDepositBatch}
      onWithdraw={gc.handleWithdrawItem}
      onWithdrawBatch={gc.handleWithdrawBatch}
      getSalvageCost={(templateId) => {
        if (!discountLookup.recipeByTemplateId.has(templateId)) {
          return null;
        }
        return getDiscountedCost(discountLookup, templateId, CRAFTING_CONSTANTS.SALVAGE_TURN_COST);
      }}
      zoneCraftingLevel={gc.zoneCraftingLevel}
      confirmRarity={gc.confirmRarity}
      showNpcDialogue={gc.showNpcDialogue}
      characterLevel={gc.characterProgression.characterLevel}
      skillLevels={discountLookup.skillByType}
    />
  );
}

export function EquipmentScreenRenderer({ gc }: { gc: GameControllerState }) {
  const equipmentStats = useEquipmentStats(gc.equipment);

  return (
    <Equipment
      slots={gc.equipment.map((entry) => {
        const label = titleCaseFromSnake(entry.slot);
        const template = entry.item?.template;
        const templateMax = template?.maxDurability ?? 0;
        const max = template ? (entry.item?.maxDurability ?? templateMax) : 0;
        const current = template ? (entry.item?.currentDurability ?? max) : 0;
        return {
          id: entry.slot,
          name: label,
          item: template ? {
            id: entry.item!.id,
            name: template.name,
            imageSrc: itemImageSrc(template.name, template.itemType),
            rarity: entry.item!.rarity,
            weightClass: template.weightClass ?? null,
            tier: template.tier ?? 1,
            durability: current,
            maxDurability: max,
            baseStats: template.baseStats,
            bonusStats: entry.item?.bonusStats ?? null,
          } : null,
        };
      })}
      inventoryItems={gc.inventory
        .filter((item) => Boolean(item.template.slot) && (item.template.itemType === 'weapon' || item.template.itemType === 'armor') && item.quantity === 1)
        .map((item) => {
          const templateMax = item.template.maxDurability ?? 0;
          const max = item.maxDurability ?? templateMax;
          const durability = max > 0 ? { current: item.currentDurability ?? max, max } : null;
          return {
            id: item.id,
            name: item.template.name,
            imageSrc: itemImageSrc(item.template.name, item.template.itemType),
            rarity: item.rarity,
            slot: item.template.slot as string,
            weightClass: item.template.weightClass ?? null,
            equippedSlot: item.equippedSlot,
            durability,
            baseStats: item.template.baseStats,
            bonusStats: item.bonusStats ?? null,
          };
        })}
      onEquip={gc.handleEquipItem}
      onUnequip={gc.handleUnequipSlot}
      onRepairItem={gc.handleRepairItem}
      onRepairAll={gc.handleRepairAllEquipped}
      turns={gc.turns}
      stats={equipmentStats}
    />
  );
}

export function SkillsScreenRenderer({ gc }: { gc: GameControllerState }) {
  return (
    <Skills
      skills={gc.skills
        .map((skill) => {
          const meta = SKILL_META[skill.skillType];
          if (!meta) {
            return null;
          }
          return {
            id: skill.skillType,
            name: meta.name,
            icon: meta.icon,
            imageSrc: skillIconSrc(skill.skillType),
            level: skill.level,
            currentXP: skill.xp,
            nextLevelXP: xpForLevel(skill.level + 1),
            xpRate: Math.round(calculateEfficiency(skill.dailyXpGained, skill.skillType as SkillType) * 100),
            color: meta.color,
          };
        })
        .filter(Boolean) as Array<{
          id: string;
          name: string;
          icon: typeof Sword;
          imageSrc: string;
          level: number;
          currentXP: number;
          nextLevelXP: number;
          xpRate: number;
          color: string;
        }>}
    />
  );
}

export function TrainingScreenRenderer({
  gc,
  currentZoneType,
}: {
  gc: GameControllerState;
  currentZoneType?: string | null;
}) {
  return (
    <TrainingGrounds
      bestiary={gc.bestiaryMobs
        .filter((mob) => mob.isDiscovered)
        .map((mob) => ({
          id: mob.id,
          name: mob.name,
          level: mob.level,
          prefixesEncountered: mob.prefixesEncountered,
        }))}
      cooldownSeconds={gc.trainingCooldown}
      onCooldownUpdate={gc.setTrainingCooldown}
      isInTown={currentZoneType === 'town'}
      combatLogSpeedMs={gc.combatLogSpeedMs}
    />
  );
}

export function TalentTreeScreenRenderer({ gc }: { gc: GameControllerState }) {
  return (
    <TalentTree
      skillPointState={gc.skillPointState!}
      skills={gc.skills}
      onAllocate={gc.handleAllocateSkillPoint}
      onRespec={gc.handleRespecSkillPoints}
      onNavigate={gc.setActiveScreen}
      initialTree={gc.starterWeaponType ?? undefined}
    />
  );
}
