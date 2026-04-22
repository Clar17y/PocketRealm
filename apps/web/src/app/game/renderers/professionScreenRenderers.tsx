'use client';

import React, { useMemo } from 'react';
import type { SkillType } from '@pocketrealm/shared';
import { calculateEfficiency } from '@pocketrealm/game-engine';
import { Crafting } from '@/components/screens/Crafting';
import { Forge } from '@/components/screens/Forge';
import { Gathering } from '@/components/screens/Gathering';
import { itemImageSrc, resourceImageSrc } from '@/lib/assets';
import { titleCaseFromSnake } from '@/lib/format';
import { buildRecipeDiscountLookup, getRecipeSkillInfo } from '@/lib/recipeDiscount';
import { rarityFromTier } from '@/lib/rarity';
import { CRAFTING_SKILL_TABS, GATHERING_SKILL_TABS, SKILL_META } from '../pageConstants';
import type { GameControllerState } from './gameScreenRenderer.types';

function useEquipmentLuck(gc: GameControllerState) {
  return useMemo(() => {
    let equipmentLuck = 0;
    for (const entry of gc.equipment) {
      const base = entry.item?.template?.baseStats as Record<string, unknown> | undefined;
      const bonus = entry.item?.bonusStats ?? undefined;
      if (base && typeof base.luck === 'number') {
        equipmentLuck += base.luck;
      }
      if (bonus && typeof bonus.luck === 'number') {
        equipmentLuck += bonus.luck;
      }
    }
    return equipmentLuck;
  }, [gc.equipment]);
}

export function CraftingScreenRenderer({ gc }: { gc: GameControllerState }) {
  const activeCraftingSkillMeta = SKILL_META[gc.activeCraftingSkill];
  const activeCraftingSkillData = gc.skills.find((skill) => skill.skillType === gc.activeCraftingSkill);
  const filteredCraftingRecipes = useMemo(
    () => gc.craftingRecipes.filter((recipe) => recipe.skillType === gc.activeCraftingSkill),
    [gc.craftingRecipes, gc.activeCraftingSkill]
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CRAFTING_SKILL_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => gc.setActiveCraftingSkill(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
              gc.activeCraftingSkill === tab.id
                ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <Crafting
        skillType={gc.activeCraftingSkill}
        skillName={activeCraftingSkillMeta?.name ?? 'Crafting'}
        skillLevel={activeCraftingSkillData?.level ?? 1}
        xpRate={Math.round(calculateEfficiency(activeCraftingSkillData?.dailyXpGained ?? 0, gc.activeCraftingSkill as SkillType) * 100)}
        recipes={filteredCraftingRecipes.map((recipe) => ({
          id: recipe.id,
          name: recipe.resultTemplate.name,
          imageSrc: itemImageSrc(recipe.resultTemplate.name, recipe.resultTemplate.itemType),
          isAdvanced: recipe.isAdvanced,
          isDiscovered: recipe.isDiscovered,
          discoveryHint: recipe.discoveryHint,
          soulbound: recipe.soulbound,
          stackable: recipe.resultTemplate.stackable,
          resultQuantity: 1,
          requiredLevel: recipe.requiredLevel,
          turnCost: recipe.turnCost,
          xpReward: recipe.xpReward,
          baseStats: recipe.resultTemplate.baseStats,
          materials: recipe.materials.map((material) => {
            const meta = recipe.materialTemplates.find((template) => template.id === material.templateId);
            const owned = gc.ownedByTemplateId.get(material.templateId) ?? 0;
            return {
              name: meta?.name ?? 'Unknown',
              icon: '?',
              imageSrc: meta ? itemImageSrc(meta.name, meta.itemType) : undefined,
              required: material.quantity,
              owned,
            };
          }),
          rarity: rarityFromTier(recipe.resultTemplate.tier),
        }))}
        onCraft={gc.handleCraft}
        activityLog={gc.activityLog}
        isRecovering={gc.hpState.isRecovering}
        isOverEncumbered={gc.isOverEncumbered}
        isActivityLocked={gc.isActivityLocked}
        activityLockReason={gc.activityLockReason}
        recoveryCost={gc.hpState.recoveryCost}
        zoneCraftingLevel={gc.zoneCraftingLevel}
        zoneName={gc.zoneCraftingName}
        defaultMaxQuantity={gc.defaultRefiningMax}
        guildTaxRate={gc.guildTaxRate}
        backpackFull={gc.backpackFull}
        availableSlots={Math.max(0, gc.inventoryCapacity - gc.inventoryUsedSlots)}
        showNpcDialogue={gc.showNpcDialogue}
      />
    </div>
  );
}

export function ForgeScreenRenderer({ gc }: { gc: GameControllerState }) {
  const equipmentLuck = useEquipmentLuck(gc);
  const discountLookup = useMemo(
    () => buildRecipeDiscountLookup(gc.craftingRecipes, gc.skills),
    [gc.craftingRecipes, gc.skills]
  );

  return (
    <Forge
      items={gc.inventory
        .filter((item) => (item.template.itemType === 'weapon' || item.template.itemType === 'armor') && item.quantity === 1)
        .map((item) => {
          const recipeInfo = getRecipeSkillInfo(discountLookup, item.template.id);
          return {
            id: item.id,
            templateId: item.template.id,
            name: item.template.name,
            imageSrc: itemImageSrc(item.template.name, item.template.itemType),
            rarity: item.rarity,
            type: item.template.itemType,
            equippedSlot: item.equippedSlot,
            baseStats: item.template.baseStats,
            bonusStats: item.bonusStats ?? null,
            recipeSkillLevel: recipeInfo?.recipeSkillLevel ?? null,
            recipeRequiredLevel: recipeInfo?.recipeRequiredLevel ?? null,
          };
        })}
      equippedLuck={equipmentLuck + gc.characterProgression.attributes.luck}
      activityLog={gc.activityLog}
      onUpgrade={gc.handleForgeUpgrade}
      onReroll={gc.handleForgeReroll}
      isRecovering={gc.hpState.isRecovering}
      recoveryCost={gc.hpState.recoveryCost}
      zoneCraftingLevel={gc.zoneCraftingLevel}
      zoneName={gc.zoneCraftingName}
      guildTaxRate={gc.guildTaxRate}
      forgeLuckUses={gc.activeBuffs.find((buff) => buff.buffType === 'forge_luck')?.remainingUses ?? 0}
      forgeProtectionUses={gc.activeBuffs.find((buff) => buff.buffType === 'forge_protection')?.remainingUses ?? 0}
      forgeConfirmRarity={gc.forgeConfirmRarity}
      showNpcDialogue={gc.showNpcDialogue}
    />
  );
}

export function GatheringScreenRenderer({ gc }: { gc: GameControllerState }) {
  const activeGatheringSkillMeta = SKILL_META[gc.activeGatheringSkill];
  const activeGatheringSkillData = gc.skills.find((skill) => skill.skillType === gc.activeGatheringSkill);
  const filteredGatheringNodes = useMemo(
    () => gc.gatheringNodes.filter((node) => node.skillRequired === gc.activeGatheringSkill),
    [gc.gatheringNodes, gc.activeGatheringSkill]
  );
  const ownedResourceNames = useMemo(
    () => new Set(
      gc.inventory
        .filter((item) => item.template.stackable && item.template.itemType === 'resource' && !item.equippedSlot)
        .map((item) => item.template.name)
    ),
    [gc.inventory]
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {GATHERING_SKILL_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              gc.setActiveGatheringSkill(tab.id);
              gc.handleGatheringPageChange(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
              gc.activeGatheringSkill === tab.id
                ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <Gathering
        skillType={gc.activeGatheringSkill}
        skillName={activeGatheringSkillMeta?.name ?? 'Gathering'}
        skillLevel={activeGatheringSkillData?.level ?? 1}
        xpRate={Math.round(calculateEfficiency(activeGatheringSkillData?.dailyXpGained ?? 0, gc.activeGatheringSkill as SkillType) * 100)}
        nodes={filteredGatheringNodes.map((node) => ({
          id: node.id,
          name: titleCaseFromSnake(node.resourceType),
          imageSrc: resourceImageSrc(node.resourceType),
          levelRequired: node.levelRequired,
          baseYield: node.baseYield,
          zoneId: node.zoneId,
          zoneName: node.zoneName,
          resourceTypeCategory: node.resourceTypeCategory,
          remainingCapacity: node.remainingCapacity,
          maxCapacity: node.maxCapacity,
          sizeName: node.sizeName,
          weathered: node.weathered,
          eventModifiers: node.eventModifiers,
        }))}
        currentZoneId={gc.activeZoneId}
        availableTurns={gc.turns}
        activityLog={gc.activityLog}
        nodesLoading={gc.gatheringLoading}
        nodesError={gc.gatheringError}
        page={gc.gatheringPage}
        pagination={gc.gatheringPagination}
        filters={gc.gatheringFilters}
        zoneFilter={gc.gatheringZoneFilter}
        resourceTypeFilter={gc.gatheringResourceTypeFilter}
        onPageChange={gc.handleGatheringPageChange}
        onZoneFilterChange={gc.handleGatheringZoneFilterChange}
        onResourceTypeFilterChange={gc.handleGatheringResourceTypeFilterChange}
        onStartGathering={gc.handleMine}
        isRecovering={gc.hpState.isRecovering}
        isOverEncumbered={gc.isOverEncumbered}
        isActivityLocked={gc.isActivityLocked}
        activityLockReason={gc.activityLockReason}
        backpackFull={gc.backpackFull}
        ownedResourceNames={ownedResourceNames}
        recoveryCost={gc.hpState.recoveryCost}
        guildTaxRate={gc.guildTaxRate}
        showNpcDialogue={gc.showNpcDialogue}
      />
    </div>
  );
}
