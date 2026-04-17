'use client';

import React, { useMemo } from 'react';
import { itemImageSrc, monsterImageSrc, resourceImageSrc, skillIconSrc, zoneImageSrc, type ExpeditionContext } from '@/lib/assets';
import { Dashboard } from '@/components/screens/Dashboard';
import { Exploration } from '@/components/screens/Exploration';
import { Inventory } from '@/components/screens/Inventory';
import { Equipment } from '@/components/screens/Equipment';
import { Skills } from '@/components/screens/Skills';
import { ZoneMap } from '@/components/screens/ZoneMap';
import { Bestiary } from '@/components/screens/Bestiary';
import { Crafting } from '@/components/screens/Crafting';
import { Forge } from '@/components/screens/Forge';
import { Gathering } from '@/components/screens/Gathering';
import { Rest } from '@/components/screens/Rest';
import { WorldEvents } from '@/components/screens/WorldEvents';
import { Achievements } from '@/components/screens/Achievements';
import { Leaderboard } from '@/components/screens/Leaderboard';
import { Casino } from '@/components/screens/Casino';
import { Settings } from '@/components/screens/Settings';
import { TrainingGrounds } from '@/components/screens/TrainingGrounds';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { rarityFromTier } from '@/lib/rarity';
import { titleCaseFromSnake } from '@/lib/format';
import { buildRecipeDiscountLookup, getDiscountedCost, getRecipeSkillInfo } from '@/lib/recipeDiscount';
import { CRAFTING_CONSTANTS, PREMIUM_CONSTANTS, TURN_CONSTANTS, type SkillType } from '@pocketrealm/shared';
import { calculateEfficiency, xpForLevel } from '@pocketrealm/game-engine';
import type { Sword } from 'lucide-react';
import {
  TUTORIAL_STEP_EXPLORE,
} from '@/lib/tutorial';
import AdminScreen from '@/components/screens/AdminScreen';
import { ArenaScreen } from './screens/ArenaScreen';
import { applyStateUpdates } from './applyStateUpdates';
import { GuildScreen } from '@/components/screens/GuildScreen';
import { FriendsScreen } from '@/components/screens/FriendsScreen';
import { MailScreen } from '@/components/screens/MailScreen';
import { Templates } from '@/components/screens/Templates';
import { TalentTree } from '@/components/screens/TalentTree';
import { Quests } from '@/components/screens/Quests';
import { CombatScreen } from './screens/CombatScreen';
import { isMobKnown } from './combatHelpers';
import type { Screen } from './gameController.types';
import { SKILL_META, GATHERING_SKILL_TABS, CRAFTING_SKILL_TABS } from './pageConstants';
import type { useGameController } from './useGameController';
import type { useCasinoSocket } from '@/hooks/useCasinoSocket';
import type { usePushNotifications } from '@/hooks/usePushNotifications';

type GC = ReturnType<typeof useGameController>;

interface GameScreenRendererProps {
  gc: GC;
  player: {
    id?: string;
    username?: string;
    role?: string;
    email?: string;
    emailVerified?: boolean;
    isPremium?: boolean;
    premiumExpiresAt?: string | null;
  } | null;
  casinoSocket: ReturnType<typeof useCasinoSocket>;
  achievementCategory: string | null;
  setAchievementCategory: (cat: string | null) => void;
  expeditionContext: ExpeditionContext | null;
  setExpeditionContext: (ctx: ExpeditionContext | null) => void;
  mailRecipient: { id: string; name: string } | null;
  setMailRecipient: (r: { id: string; name: string } | null) => void;
  deepLinkTab: string | null;
  pushState: ReturnType<typeof usePushNotifications>['state'];
  pushToggle: ReturnType<typeof usePushNotifications>['toggle'];
  onLogout: () => void;
  onAccountRefresh: () => Promise<void>;
  onForceRelogin: () => void;
}

export function GameScreenRenderer({
  gc, player,
  casinoSocket,
  achievementCategory, setAchievementCategory,
  expeditionContext, setExpeditionContext,
  mailRecipient, setMailRecipient,
  deepLinkTab,
  pushState, pushToggle,
  onLogout,
  onAccountRefresh,
  onForceRelogin,
}: GameScreenRendererProps) {
  const {
    activeScreen, setActiveScreen,
    handleNavigate,
    turns, setTurns, gold, setGold,
    zones, activeZoneId, zoneConnections, undiscoveredZones, reloadZones,
    skills, characterProgression, inventory, equipment,
    gatheringNodes, gatheringLoading, gatheringError,
    gatheringPage, gatheringPagination, gatheringFilters,
    gatheringZoneFilter, gatheringResourceTypeFilter,
    activeGatheringSkill, setActiveGatheringSkill,
    craftingRecipes, activeCraftingSkill, setActiveCraftingSkill,
    activityLog, pushLog,
    pendingEncounters, pendingEncountersLoading, pendingEncountersError,
    pendingEncounterPage, pendingEncounterPagination, pendingEncounterFilters,
    pendingEncounterZoneFilter, pendingEncounterMobFilter, pendingEncounterSort,
    pendingClockMs,
    lastCombat, busyAction, slowAction, isOffline, actionError,
    bestiaryMobs, bestiaryLoading, bestiaryError, bestiaryPrefixSummary,
    expeditionThemes, worldBosses,
    hpState, setHpState, staminaState, manaState,
    skillPointState, handleAllocateSkillPoint, handleRespecSkillPoints,
    templates, handleLoadTemplates, handleTemplateSaved,
    pvpNotificationCount, loadPvpNotificationCount,
    playbackActive,
    combatPlaybackData, combatPlaybackQueue, combatPlaybackIndex, roomTransition,
    explorationPlaybackData, travelPlaybackData,
    currentZone, ownedByTemplateId,
    handleStartExploration, handleExplorationPlaybackComplete, handlePlaybackSkip,
    handleCombatPlaybackComplete, handleTravelPlaybackComplete, handleTravelPlaybackSkip,
    handleMine, handleCraft,
    handleGatheringPageChange, handleGatheringZoneFilterChange, handleGatheringResourceTypeFilterChange,
    handlePendingEncounterPageChange, handlePendingEncounterZoneFilterChange,
    handlePendingEncounterMobFilterChange, handlePendingEncounterSortChange,
    handleSalvageItem, handleSalvageBatch, handleForgeUpgrade, handleForgeReroll,
    handleDestroyItem, handleRepairItem, handleRepairAllEquipped, handleUseItem,
    handleEquipItem, handleUnequipSlot, handleAllocateAttribute,
    combatLogSpeedMs, setCombatLogSpeedMs, handleSetCombatLogSpeed,
    explorationSpeedMs, setExplorationSpeedMs, handleSetExplorationSpeed,
    autoSkipKnownCombat, handleSetAutoSkipKnownCombat,
    defaultExploreTurns, setDefaultExploreTurns, handleSetDefaultExploreTurns,
    quickRestHealPercent, handleSetQuickRestHealPercent,
    defaultRefiningMax, handleSetDefaultRefiningMax,
    lowHpWarning, handleSetLowHpWarning,
    confirmRarity, handleSetConfirmRarity,
    lootRevealRarity, handleSetLootRevealRarity,
    forgeConfirmRarity, handleSetForgeConfirmRarity,
    handleQuickRest,
    guildTaxRate, homeTownId, handleSetHomeTown,
    showNpcDialogue, showItemFlavourText, showBestiaryLore,
    handleSetShowNpcDialogue, handleSetShowItemFlavourText, handleSetShowBestiaryLore,
    notificationPrefs, handleSetNotificationPref,
    zoneCraftingLevel, zoneCraftingName,
    achievementData, achievementUnclaimedCount, activeTitle,
    handleClaimAchievement, handleSetActiveTitle, loadAchievements,
    quests, questState, questsLoading, questsError,
    loadQuests, handleClaimQuestReward, handleClaimDailyBonus, handleRerollQuest,
    tutorialStep, advanceTutorial, starterWeaponType,
    loadAll, activeBuffs, combatLogPrefetch,
    inventoryCapacity, inventoryUsedSlots, isOverEncumbered, backpackFull,
    trainingCooldown, setTrainingCooldown,
    handleExchangeGold, handlePlaceBet,
    handleSellItem, handleSellBatch, handleDepositItem, handleDepositBatch,
    handleWithdrawItem, handleWithdrawBatch,
    handleTravelToZone,
    stateSetters, refreshPendingEncounters, setActionError,
    activeEncounterSiteId, setActiveEncounterSiteId,
    isActivityLocked, activityLockReason,
    loadFriendCounts,
  } = gc;

  // Screen-specific memos
  const filteredGatheringNodes = useMemo(() => gatheringNodes.filter((n) => n.skillRequired === activeGatheringSkill), [gatheringNodes, activeGatheringSkill]);
  const filteredCraftingRecipes = useMemo(() => craftingRecipes.filter((recipe) => recipe.skillType === activeCraftingSkill), [craftingRecipes, activeCraftingSkill]);
  const ownedResourceNames = useMemo(() => new Set(
    inventory.filter((i) => i.template.stackable && i.template.itemType === 'resource' && !i.equippedSlot).map((i) => i.template.name),
  ), [inventory]);
  const discountLookup = useMemo(() => buildRecipeDiscountLookup(craftingRecipes, skills), [craftingRecipes, skills]);
  const equipmentStats = useMemo(() => {
    const stats = { attack: 0, defence: 0, magicDefence: 0, hp: 0, dodge: 0, accuracy: 0, magicPower: 0, rangedPower: 0, luck: 0, critChance: 0, critDamage: 0 };
    for (const e of equipment) {
      const base = e.item?.template?.baseStats as Record<string, unknown> | undefined;
      const bonus = e.item?.bonusStats ?? undefined;
      for (const src of [base, bonus]) {
        if (!src) continue;
        if (typeof src.attack === 'number') stats.attack += src.attack;
        if (typeof src.armor === 'number') stats.defence += src.armor;
        if (typeof src.magicDefence === 'number') stats.magicDefence += src.magicDefence;
        if (typeof src.health === 'number') stats.hp += src.health;
        if (typeof src.dodge === 'number') stats.dodge += src.dodge;
        if (typeof src.accuracy === 'number') stats.accuracy += src.accuracy;
        if (typeof src.magicPower === 'number') stats.magicPower += src.magicPower;
        if (typeof src.rangedPower === 'number') stats.rangedPower += src.rangedPower;
        if (typeof src.luck === 'number') stats.luck += src.luck;
        if (typeof src.critChance === 'number') stats.critChance += src.critChance;
        if (typeof src.critDamage === 'number') stats.critDamage += src.critDamage;
      }
    }
    return stats;
  }, [equipment]);

  const bestiaryMobsForPlayback = useMemo(
    () => bestiaryMobs.map(m => ({ id: m.id, isDiscovered: m.isDiscovered, prefixesEncountered: m.prefixesEncountered })),
    [bestiaryMobs],
  );

  const primaryCombatXpRate = useMemo(() => {
    const mainHand = equipment.find((e) => e.slot === 'main_hand');
    const requiredSkill = mainHand?.item?.template?.requiredSkill;
    const attackSkill: 'melee' | 'ranged' | 'magic' =
      requiredSkill === 'melee' || requiredSkill === 'ranged' || requiredSkill === 'magic'
        ? requiredSkill
        : 'melee';
    const skillData = skills.find((s) => s.skillType === attackSkill);
    const rate = skillData
      ? Math.round(calculateEfficiency(skillData.dailyXpGained, attackSkill as SkillType) * 100)
      : 100;
    return {
      skillName: attackSkill.charAt(0).toUpperCase() + attackSkill.slice(1),
      rate,
    };
  }, [skills, equipment]);

  const activeGatheringSkillMeta = SKILL_META[activeGatheringSkill];
  const activeCraftingSkillMeta = SKILL_META[activeCraftingSkill];
  const activeGatheringSkillData = skills.find((s) => s.skillType === activeGatheringSkill);
  const activeCraftingSkillData = skills.find((s) => s.skillType === activeCraftingSkill);
  const hasActivePremiumTurns = Boolean(
    player?.isPremium
    && player.premiumExpiresAt
    && new Date(player.premiumExpiresAt).getTime() > Date.now(),
  );
  const displayedTurnCap = hasActivePremiumTurns ? PREMIUM_CONSTANTS.TURN_BANK_CAP : TURN_CONSTANTS.BANK_CAP;
  const displayedTurnRegenRate = hasActivePremiumTurns ? PREMIUM_CONSTANTS.TURN_REGEN_RATE : TURN_CONSTANTS.REGEN_RATE;

  switch (activeScreen) {
    case 'home': {
      const currentLevelFloorXp = xpForLevel(characterProgression.characterLevel);
      const nextLevelTotalXp = xpForLevel(characterProgression.characterLevel + 1);
      const currentLevelXp = Math.max(0, characterProgression.characterXp - currentLevelFloorXp);
      const requiredLevelXp = Math.max(1, nextLevelTotalXp - currentLevelFloorXp);
      return (
        <Dashboard
          playerData={{
            turns,
            maxTurns: displayedTurnCap,
            turnsRegenRate: displayedTurnRegenRate * 60,
            gold,
            currentXP: characterProgression.characterXp,
            nextLevelXP: nextLevelTotalXp,
            currentLevelXp,
            requiredLevelXp,
            currentZone: currentZone?.name ?? 'Unknown',
            isRecovering: hpState.isRecovering,
            isOverEncumbered,
            recoveryCost: hpState.recoveryCost,
            isActivityLocked,
            activityLockReason,
          }}
          characterProgression={characterProgression}
          skills={skills
            .map((s) => {
              const meta = SKILL_META[s.skillType];
              if (!meta) return null;
              return { name: meta.name, level: s.level, icon: meta.icon, imageSrc: skillIconSrc(s.skillType) };
            })
            .filter(Boolean) as Array<{ name: string; level: number; icon: typeof Sword; imageSrc: string }>}
          onNavigate={handleNavigate}
          activityLog={activityLog}
          onAllocateAttribute={handleAllocateAttribute}
        />
      );
    }
    case 'explore':
      if (currentZone?.zoneType === 'town' && !explorationPlaybackData) {
        return (
          <PixelCard>
            <div className="text-center py-8">
              <h2 className="text-xl font-bold text-[var(--rpg-text-primary)] mb-2">
                {currentZone.name}
              </h2>
              <p className="text-sm text-[var(--rpg-text-secondary)] mb-4">
                This is a peaceful town. Use the World Map to travel to a wild zone for exploration.
              </p>
              <PixelButton variant="gold" onClick={() => setActiveScreen('zones')}>
                Open World Map
              </PixelButton>
            </div>
          </PixelCard>
        );
      }
      return (
        <Exploration
          currentZone={{
            name: currentZone?.name ?? 'Unknown',
            description: currentZone?.description ?? 'Select a zone from Map.',
            minLevel: Math.max(1, (currentZone?.difficulty ?? 1) * 5),
            imageSrc: currentZone?.name && currentZone.name !== '???' ? zoneImageSrc(currentZone.name) : undefined,
          }}
          explorationProgress={currentZone?.exploration ? {
            turnsExplored: currentZone.exploration.turnsExplored,
            turnsToExplore: currentZone.exploration.turnsToExplore,
            percent: currentZone.exploration.percent,
            tiers: currentZone.exploration.tiers,
          } : null}
          trackableMobFamilies={currentZone?.trackableMobFamilies ?? []}
          availableTurns={turns}
          onStartExploration={handleStartExploration}
          activityLog={activityLog}
          isRecovering={hpState.isRecovering}
          isOverEncumbered={isOverEncumbered}
          isActivityLocked={isActivityLocked}
          activityLockReason={activityLockReason}
          recoveryCost={hpState.recoveryCost}
          currentHp={hpState.currentHp}
          maxHp={hpState.maxHp}
          currentStamina={staminaState.current}
          maxStamina={staminaState.max}
          currentMana={manaState.current}
          maxMana={manaState.max}
          regenPerSecond={hpState.regenPerSecond}
          staminaRegenPerSecond={staminaState.regenPerSecond}
          manaRegenPerSecond={manaState.regenPerSecond}
          playbackData={explorationPlaybackData}
          onPlaybackComplete={handleExplorationPlaybackComplete}
          onPlaybackSkip={handlePlaybackSkip}
          onPushLog={pushLog}
          combatSpeedMs={combatLogSpeedMs}
          explorationSpeedMs={explorationSpeedMs}
          autoSkipKnownCombat={autoSkipKnownCombat}
          bestiaryMobs={bestiaryMobsForPlayback}
          defaultTurns={defaultExploreTurns}
          tutorialLocked={tutorialStep === TUTORIAL_STEP_EXPLORE}
          lowHpWarning={lowHpWarning}
          onQuickRest={handleQuickRest}
          quickRestPercent={quickRestHealPercent}
          busyAction={busyAction}
          isOffline={isOffline}
          onNavigateToRest={() => handleNavigate('rest')}
          guildTaxRate={guildTaxRate}
          combatLogPrefetch={combatLogPrefetch}
          combatXpRate={primaryCombatXpRate}
        />
      );
    case 'inventory':
      return (
        <Inventory
          items={inventory.map((item) => {
            const isEquip = ['weapon', 'armor'].includes(item.template.itemType);
            const hasSalvageRecipe = isEquip && discountLookup.recipeByTemplateId.has(item.template.id);
            const salvageCost = hasSalvageRecipe
              ? getDiscountedCost(discountLookup, item.template.id, CRAFTING_CONSTANTS.SALVAGE_TURN_COST)
              : null;
            return {
              id: item.id, name: item.template.name,
              imageSrc: itemImageSrc(item.template.name, item.template.itemType),
              quantity: item.quantity, rarity: item.rarity,
              description: (showItemFlavourText && item.template.flavorText) || item.template.itemType,
              type: item.template.itemType, tier: item.template.tier,
              weightClass: item.template.weightClass ?? null,
              slot: item.template.slot, equippedSlot: item.equippedSlot,
              durability: (() => {
                const templateMax = item.template.maxDurability ?? 0;
                const max = item.maxDurability ?? templateMax;
                if (!['weapon', 'armor'].includes(item.template.itemType) || max <= 0) return null;
                const cur = item.currentDurability ?? max;
                return { current: cur, max };
              })(),
              baseStats: item.template.baseStats, bonusStats: item.bonusStats ?? null,
              requiredSkill: item.template.requiredSkill ?? null,
              requiredLevel: item.template.requiredLevel ?? 1,
              salvageCost, sellPrice: item.template.sellPrice ?? null,
            };
          })}
          capacity={inventoryCapacity} usedSlots={inventoryUsedSlots} gold={gold}
          isInTown={currentZone?.zoneType === 'town'}
          onDrop={handleDestroyItem} onSalvage={handleSalvageItem} onSalvageBatch={handleSalvageBatch}
          onRepair={handleRepairItem} onEquip={handleEquipItem} onUnequip={handleUnequipSlot}
          onUse={handleUseItem} onSell={handleSellItem} onSellBatch={handleSellBatch}
          onDeposit={handleDepositItem} onDepositBatch={handleDepositBatch}
          onWithdraw={handleWithdrawItem} onWithdrawBatch={handleWithdrawBatch}
          getSalvageCost={(templateId) => {
            if (!discountLookup.recipeByTemplateId.has(templateId)) return null;
            return getDiscountedCost(discountLookup, templateId, CRAFTING_CONSTANTS.SALVAGE_TURN_COST);
          }}
          zoneCraftingLevel={zoneCraftingLevel} confirmRarity={confirmRarity} showNpcDialogue={showNpcDialogue}
          characterLevel={characterProgression.characterLevel}
          skillLevels={discountLookup.skillByType}
        />
      );
    case 'equipment':
      return (
        <Equipment
          slots={equipment.map((e) => {
            const label = titleCaseFromSnake(e.slot);
            const template = e.item?.template;
            const templateMax = template?.maxDurability ?? 0;
            const max = template ? (e.item?.maxDurability ?? templateMax) : 0;
            const cur = template ? (e.item?.currentDurability ?? max) : 0;
            return {
              id: e.slot, name: label,
              item: template ? {
                id: e.item!.id, name: template.name,
                imageSrc: itemImageSrc(template.name, template.itemType),
                rarity: e.item!.rarity, weightClass: template.weightClass ?? null,
                tier: template.tier ?? 1, durability: cur, maxDurability: max,
                baseStats: template.baseStats, bonusStats: e.item?.bonusStats ?? null,
              } : null,
            };
          })}
          inventoryItems={inventory
            .filter((item) => Boolean(item.template.slot) && ['weapon', 'armor'].includes(item.template.itemType) && item.quantity === 1)
            .map((item) => {
              const templateMax = item.template.maxDurability ?? 0;
              const max = item.maxDurability ?? templateMax;
              const durability = max > 0 ? { current: item.currentDurability ?? max, max } : null;
              return {
                id: item.id, name: item.template.name,
                imageSrc: itemImageSrc(item.template.name, item.template.itemType),
                rarity: item.rarity, slot: item.template.slot as string,
                weightClass: item.template.weightClass ?? null,
                equippedSlot: item.equippedSlot, durability,
                baseStats: item.template.baseStats, bonusStats: item.bonusStats ?? null,
              };
            })}
          onEquip={handleEquipItem} onUnequip={handleUnequipSlot}
          onRepairItem={handleRepairItem} onRepairAll={handleRepairAllEquipped}
          turns={turns} stats={equipmentStats}
        />
      );
    case 'skills':
      return (
        <Skills
          skills={skills
            .map((s) => {
              const meta = SKILL_META[s.skillType];
              if (!meta) return null;
              return {
                id: s.skillType, name: meta.name, icon: meta.icon,
                imageSrc: skillIconSrc(s.skillType), level: s.level,
                currentXP: s.xp, nextLevelXP: xpForLevel(s.level + 1),
                xpRate: Math.round(calculateEfficiency(s.dailyXpGained, s.skillType as SkillType) * 100),
                color: meta.color,
              };
            })
            .filter(Boolean) as any}
        />
      );
    case 'zones':
      return (
        <ZoneMap
          zones={zones.map((z) => ({
            id: z.id, name: z.name, description: z.description, difficulty: z.difficulty,
            travelCost: z.travelCost, discovered: z.discovered ?? true,
            zoneType: z.zoneType ?? 'wild',
            imageSrc: z.discovered && z.name !== '???' ? zoneImageSrc(z.name) : undefined,
            exploration: z.exploration ?? null, arrivalText: z.arrivalText ?? null,
            ambientTexts: z.ambientTexts ?? null,
          }))}
          connections={zoneConnections} currentZoneId={activeZoneId ?? ''} availableTurns={turns}
          isRecovering={hpState.isRecovering} isOverEncumbered={isOverEncumbered}
          isActivityLocked={isActivityLocked} activityLockReason={activityLockReason}
          playbackActive={playbackActive} travelPlaybackData={travelPlaybackData}
          onTravelPlaybackComplete={handleTravelPlaybackComplete}
          onTravelPlaybackSkip={handleTravelPlaybackSkip}
          onPushLog={pushLog} activityLog={activityLog}
          combatSpeedMs={combatLogSpeedMs} explorationSpeedMs={explorationSpeedMs}
          autoSkipKnownCombat={autoSkipKnownCombat} bestiaryMobs={bestiaryMobsForPlayback}
          onTravel={handleTravelToZone} onExploreCurrentZone={() => setActiveScreen('explore')}
          guildTaxRate={guildTaxRate} undiscoveredZones={undiscoveredZones}
          combatLogPrefetch={combatLogPrefetch}
          playerStartStamina={staminaState.current} playerStartMana={manaState.current}
          playerMaxStamina={staminaState.max} playerMaxMana={manaState.max}
          homeTownId={homeTownId} onSetHomeTown={(zoneId) => void handleSetHomeTown(zoneId)}
          showNpcDialogue={showNpcDialogue} isInTown={currentZone?.zoneType === 'town'}
        />
      );
    case 'bestiary':
      if (bestiaryLoading) {
        return <div className="text-[var(--rpg-text-secondary)]">Loading bestiary...</div>;
      }
      if (bestiaryError) {
        return (
          <div className="p-3 rounded bg-[var(--rpg-background)] border border-[var(--rpg-red)] text-[var(--rpg-red)]">
            {bestiaryError}
          </div>
        );
      }
      return (
        <Bestiary
          monsters={bestiaryMobs.map((m) => ({
            id: m.id, name: m.name,
            imageSrc: m.isDiscovered ? monsterImageSrc(m.name) : undefined,
            level: m.level, isDiscovered: m.isDiscovered, killCount: m.killCount,
            stats: m.stats, zones: m.zones, description: m.description,
            flavorAppearance: m.flavorAppearance, flavorBehavior: m.flavorBehavior,
            flavorLore: m.flavorLore, prefixesEncountered: m.prefixesEncountered,
            explorationTier: m.explorationTier, tierLocked: m.tierLocked,
            bossRotation: m.bossRotation,
            drops: m.drops.map((d) => ({
              name: d.item.name, imageSrc: itemImageSrc(d.item.name, d.item.itemType),
              dropRate: d.dropRate, rarity: d.rarity,
            })),
          }))}
          prefixSummary={bestiaryPrefixSummary} expeditionThemes={expeditionThemes}
          worldBosses={worldBosses} showBestiaryLore={showBestiaryLore}
        />
      );
    case 'crafting':
      return (
        <div className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CRAFTING_SKILL_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveCraftingSkill(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  activeCraftingSkill === tab.id
                    ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                    : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <Crafting
            skillType={activeCraftingSkill}
            skillName={activeCraftingSkillMeta?.name ?? 'Crafting'}
            skillLevel={activeCraftingSkillData?.level ?? 1}
            xpRate={Math.round(calculateEfficiency(activeCraftingSkillData?.dailyXpGained ?? 0, activeCraftingSkill as SkillType) * 100)}
            recipes={filteredCraftingRecipes.map((r) => ({
              id: r.id, name: r.resultTemplate.name,
              imageSrc: itemImageSrc(r.resultTemplate.name, r.resultTemplate.itemType),
              isAdvanced: r.isAdvanced, isDiscovered: r.isDiscovered,
              discoveryHint: r.discoveryHint, soulbound: r.soulbound,
              stackable: r.resultTemplate.stackable, resultQuantity: 1,
              requiredLevel: r.requiredLevel, turnCost: r.turnCost, xpReward: r.xpReward,
              baseStats: r.resultTemplate.baseStats,
              materials: r.materials.map((m) => {
                const meta = r.materialTemplates.find((t) => t.id === m.templateId);
                const owned = ownedByTemplateId.get(m.templateId) ?? 0;
                return {
                  name: meta?.name ?? 'Unknown', icon: '?',
                  imageSrc: meta ? itemImageSrc(meta.name, meta.itemType) : undefined,
                  required: m.quantity, owned,
                };
              }),
              rarity: rarityFromTier(r.resultTemplate.tier),
            }))}
            onCraft={handleCraft} activityLog={activityLog}
            isRecovering={hpState.isRecovering} isOverEncumbered={isOverEncumbered}
            isActivityLocked={isActivityLocked} activityLockReason={activityLockReason}
            recoveryCost={hpState.recoveryCost}
            zoneCraftingLevel={zoneCraftingLevel} zoneName={zoneCraftingName}
            defaultMaxQuantity={defaultRefiningMax} guildTaxRate={guildTaxRate}
            backpackFull={backpackFull}
            availableSlots={Math.max(0, inventoryCapacity - inventoryUsedSlots)}
            showNpcDialogue={showNpcDialogue}
          />
        </div>
      );
    case 'forge':
      return (
        <Forge
          items={inventory
            .filter((item) => ['weapon', 'armor'].includes(item.template.itemType) && item.quantity === 1)
            .map((item) => {
              const info = getRecipeSkillInfo(discountLookup, item.template.id);
              return {
                id: item.id, templateId: item.template.id, name: item.template.name,
                imageSrc: itemImageSrc(item.template.name, item.template.itemType),
                rarity: item.rarity, type: item.template.itemType, equippedSlot: item.equippedSlot,
                baseStats: item.template.baseStats, bonusStats: item.bonusStats ?? null,
                recipeSkillLevel: info?.recipeSkillLevel ?? null,
                recipeRequiredLevel: info?.recipeRequiredLevel ?? null,
              };
            })}
          equippedLuck={equipmentStats.luck + characterProgression.attributes.luck}
          activityLog={activityLog}
          onUpgrade={handleForgeUpgrade} onReroll={handleForgeReroll}
          isRecovering={hpState.isRecovering} recoveryCost={hpState.recoveryCost}
          zoneCraftingLevel={zoneCraftingLevel} zoneName={zoneCraftingName}
          guildTaxRate={guildTaxRate}
          forgeLuckUses={activeBuffs.find(b => b.buffType === 'forge_luck')?.remainingUses ?? 0}
          forgeProtectionUses={activeBuffs.find(b => b.buffType === 'forge_protection')?.remainingUses ?? 0}
          forgeConfirmRarity={forgeConfirmRarity} showNpcDialogue={showNpcDialogue}
        />
      );
    case 'gathering':
      return (
        <div className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {GATHERING_SKILL_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveGatheringSkill(tab.id); handleGatheringPageChange(1); }}
                className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  activeGatheringSkill === tab.id
                    ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                    : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <Gathering
            skillType={activeGatheringSkill}
            skillName={activeGatheringSkillMeta?.name ?? 'Gathering'}
            skillLevel={activeGatheringSkillData?.level ?? 1}
            xpRate={Math.round(calculateEfficiency(activeGatheringSkillData?.dailyXpGained ?? 0, activeGatheringSkill as SkillType) * 100)}
            nodes={filteredGatheringNodes.map((n) => ({
              id: n.id, name: titleCaseFromSnake(n.resourceType),
              imageSrc: resourceImageSrc(n.resourceType),
              levelRequired: n.levelRequired, baseYield: n.baseYield,
              zoneId: n.zoneId, zoneName: n.zoneName,
              resourceTypeCategory: n.resourceTypeCategory,
              remainingCapacity: n.remainingCapacity, maxCapacity: n.maxCapacity,
              sizeName: n.sizeName, weathered: n.weathered, eventModifiers: n.eventModifiers,
            }))}
            currentZoneId={activeZoneId} availableTurns={turns} activityLog={activityLog}
            nodesLoading={gatheringLoading} nodesError={gatheringError}
            page={gatheringPage} pagination={gatheringPagination}
            filters={gatheringFilters} zoneFilter={gatheringZoneFilter}
            resourceTypeFilter={gatheringResourceTypeFilter}
            onPageChange={handleGatheringPageChange}
            onZoneFilterChange={handleGatheringZoneFilterChange}
            onResourceTypeFilterChange={handleGatheringResourceTypeFilterChange}
            onStartGathering={handleMine}
            isRecovering={hpState.isRecovering} isOverEncumbered={isOverEncumbered}
            isActivityLocked={isActivityLocked} activityLockReason={activityLockReason}
            backpackFull={backpackFull} ownedResourceNames={ownedResourceNames}
            recoveryCost={hpState.recoveryCost} guildTaxRate={guildTaxRate}
            showNpcDialogue={showNpcDialogue}
          />
        </div>
      );
    case 'combat': {
      const shouldAutoSkipCombat = autoSkipKnownCombat && combatPlaybackData &&
        isMobKnown(combatPlaybackData.mobTemplateId, combatPlaybackData.mobPrefix, bestiaryMobs);
      return (
        <CombatScreen
          hpState={hpState} isOverEncumbered={isOverEncumbered}
          isActivityLocked={isActivityLocked} activityLockReason={activityLockReason}
          currentTurns={turns} currentZoneId={activeZoneId}
          pendingEncounters={pendingEncounters}
          pendingEncountersLoading={pendingEncountersLoading}
          pendingEncountersError={pendingEncountersError}
          pendingEncounterPage={pendingEncounterPage}
          pendingEncounterPagination={pendingEncounterPagination}
          pendingEncounterFilters={pendingEncounterFilters}
          pendingEncounterZoneFilter={pendingEncounterZoneFilter}
          pendingEncounterMobFilter={pendingEncounterMobFilter}
          pendingEncounterSort={pendingEncounterSort}
          pendingClockMs={pendingClockMs}
          busyAction={busyAction} isOffline={isOffline} lastCombat={lastCombat}
          bestiaryMobs={bestiaryMobs.map((mob) => ({ id: mob.id, isDiscovered: mob.isDiscovered }))}
          templates={templates} onActivateTemplate={handleTemplateSaved}
          onStateUpdates={(updates) => applyStateUpdates(updates, stateSetters)}
          refreshPendingEncounters={refreshPendingEncounters}
          setError={setActionError}
          onPendingEncounterPageChange={handlePendingEncounterPageChange}
          onPendingEncounterZoneFilterChange={handlePendingEncounterZoneFilterChange}
          onPendingEncounterMobFilterChange={handlePendingEncounterMobFilterChange}
          onPendingEncounterSortChange={handlePendingEncounterSortChange}
          combatPlaybackData={combatPlaybackData} combatSpeedMs={combatLogSpeedMs}
          autoSkipCombat={!!shouldAutoSkipCombat}
          onCombatPlaybackComplete={handleCombatPlaybackComplete}
          fightProgress={combatPlaybackQueue && combatPlaybackQueue.length > 1
            ? { current: combatPlaybackIndex + 1, total: combatPlaybackQueue.length, room: combatPlaybackQueue[combatPlaybackIndex]?.room }
            : null}
          roomTransition={roomTransition}
          lowHpWarning={lowHpWarning} onQuickRest={handleQuickRest}
          quickRestPercent={quickRestHealPercent}
          onNavigateToRest={() => handleNavigate('rest')}
          combatXpRate={primaryCombatXpRate}
          staminaState={staminaState} manaState={manaState}
          advanceTutorial={advanceTutorial}
          activeEncounterSiteId={activeEncounterSiteId}
          onActiveEncounterSiteIdChange={setActiveEncounterSiteId}
        />
      );
    }
    case 'arena':
      return (
        <ArenaScreen
          characterLevel={characterProgression.characterLevel}
          busyAction={busyAction} isOffline={isOffline} currentTurns={turns}
          playerId={player?.id ?? null} isInTown={currentZone?.zoneType === 'town'}
          onStateUpdates={(updates) => applyStateUpdates(updates, stateSetters)}
          onNotificationsChanged={() => void loadPvpNotificationCount()}
          onNavigate={(s) => setActiveScreen(s as Screen)}
          combatSpeedMs={combatLogSpeedMs}
        />
      );
    case 'rest':
      return (
        <Rest
          onComplete={() => setActiveScreen('home')}
          onTurnsUpdate={(newTurns) => setTurns(newTurns)}
          onHpUpdate={(hp) => setHpState(hp)}
          availableTurns={turns}
        />
      );
    case 'settings':
      return (
        <Settings
          username={player?.username}
          email={player?.email ?? ''}
          emailVerified={player?.emailVerified ?? false}
          combatLogSpeedMs={combatLogSpeedMs} onCombatLogSpeedChange={setCombatLogSpeedMs}
          onCombatLogSpeedCommit={handleSetCombatLogSpeed}
          autoSkipKnownCombat={autoSkipKnownCombat} onAutoSkipKnownCombatChange={handleSetAutoSkipKnownCombat}
          lowHpWarning={lowHpWarning} onLowHpWarningChange={handleSetLowHpWarning}
          explorationSpeedMs={explorationSpeedMs} onExplorationSpeedChange={setExplorationSpeedMs}
          onExplorationSpeedCommit={handleSetExplorationSpeed}
          defaultExploreTurns={defaultExploreTurns} onDefaultExploreTurnsChange={setDefaultExploreTurns}
          onDefaultExploreTurnsCommit={handleSetDefaultExploreTurns}
          quickRestHealPercent={quickRestHealPercent} onQuickRestHealPercentChange={handleSetQuickRestHealPercent}
          defaultRefiningMax={defaultRefiningMax} onDefaultRefiningMaxChange={handleSetDefaultRefiningMax}
          confirmRarity={confirmRarity} onConfirmRarityChange={handleSetConfirmRarity}
          lootRevealRarity={lootRevealRarity} onLootRevealRarityChange={handleSetLootRevealRarity}
          forgeConfirmRarity={forgeConfirmRarity} onForgeConfirmRarityChange={handleSetForgeConfirmRarity}
          showNpcDialogue={showNpcDialogue} onShowNpcDialogueChange={handleSetShowNpcDialogue}
          showItemFlavourText={showItemFlavourText} onShowItemFlavourTextChange={handleSetShowItemFlavourText}
          showBestiaryLore={showBestiaryLore} onShowBestiaryLoreChange={handleSetShowBestiaryLore}
          pushState={pushState} onPushToggle={pushToggle}
          notificationPrefs={notificationPrefs} onNotificationPrefChange={handleSetNotificationPref}
          onAccountRefresh={onAccountRefresh}
          onForceRelogin={onForceRelogin}
          onLogout={onLogout}
        />
      );
    case 'worldEvents':
      return (
        <WorldEvents
          currentZoneId={activeZoneId} currentZoneName={currentZone?.name ?? null}
          playerId={player?.id ?? null}
          onNavigate={(s) => setActiveScreen(s as Screen)}
        />
      );
    case 'achievements':
      return (
        <Achievements
          achievements={achievementData?.achievements ?? []}
          unclaimedCount={achievementUnclaimedCount} activeTitle={activeTitle}
          onClaim={handleClaimAchievement} onSetTitle={handleSetActiveTitle}
          initialCategory={achievementCategory}
          onCategoryViewed={() => setAchievementCategory(null)}
        />
      );
    case 'quests':
      return (
        <Quests
          quests={quests} questState={questState} loading={questsLoading} error={questsError}
          onClaimReward={handleClaimQuestReward} onClaimBonus={handleClaimDailyBonus}
          onReroll={handleRerollQuest} onShopPurchase={(updates) => { if (updates) applyStateUpdates(updates, stateSetters); loadAll(); }}
          zones={zones.filter(z => z.discovered).map(z => ({ id: z.id, name: z.name, zoneType: z.zoneType }))}
          homeTownId={homeTownId} showNpcDialogue={showNpcDialogue}
        />
      );
    case 'leaderboard':
      return <Leaderboard playerId={player?.id ?? null} />;
    case 'guild':
      return (
        <GuildScreen
          playerId={player?.id ?? null}
          characterLevel={characterProgression.characterLevel}
          initialTab={activeScreen === 'guild' && deepLinkTab ? deepLinkTab as 'expeditions' : undefined}
          onStateUpdates={(updates) => applyStateUpdates(updates, stateSetters)}
          onExpeditionContextChange={setExpeditionContext}
          showNpcDialogue={showNpcDialogue}
        />
      );
    case 'friends':
      return (
        <FriendsScreen
          playerId={player?.id ?? null}
          onStateUpdates={(updates) => applyStateUpdates(updates, stateSetters)}
          onFriendCountsChanged={() => void loadFriendCounts()}
          combatSpeedMs={combatLogSpeedMs}
          onNavigateToMail={(recipientId, recipientName) => {
            setMailRecipient({ id: recipientId, name: recipientName });
            setActiveScreen('mail');
          }}
        />
      );
    case 'mail':
      return (
        <MailScreen
          playerId={player?.id ?? null}
          onMailCountChanged={() => void loadFriendCounts()}
          initialRecipientId={mailRecipient?.id}
          initialRecipientName={mailRecipient?.name}
        />
      );
    case 'templates':
      return (
        <Templates
          templates={templates}
          unlockedActions={skillPointState?.unlockedActions ?? []}
          staminaState={staminaState} manaState={manaState}
          onLoadTemplates={handleLoadTemplates} onNavigate={setActiveScreen}
          onTemplateSaved={handleTemplateSaved}
        />
      );
    case 'talentTree':
      return (
        <TalentTree
          skillPointState={skillPointState!} skills={skills}
          onAllocate={handleAllocateSkillPoint} onRespec={handleRespecSkillPoints}
          onNavigate={setActiveScreen} initialTree={starterWeaponType ?? undefined}
        />
      );
    case 'casino':
      return (
        <Casino
          gold={gold} turns={turns}
          onExchangeGold={handleExchangeGold} onPlaceBet={handlePlaceBet}
          onGoldUpdate={setGold} onTurnsUpdate={setTurns}
          isInTown={currentZone?.zoneType === 'town'}
          liveBets={casinoSocket.liveBets} sessionBets={casinoSocket.sessionBets}
          sessionProfit={casinoSocket.sessionProfit} lastResult={casinoSocket.lastResult}
          trackBet={casinoSocket.trackBet} playerName={player?.username ?? null}
          showNpcDialogue={showNpcDialogue}
        />
      );
    case 'training':
      return (
        <TrainingGrounds
          bestiary={bestiaryMobs
            .filter((m) => m.isDiscovered)
            .map((m) => ({ id: m.id, name: m.name, level: m.level, prefixesEncountered: m.prefixesEncountered }))}
          cooldownSeconds={trainingCooldown} onCooldownUpdate={setTrainingCooldown}
          isInTown={currentZone?.zoneType === 'town'} combatLogSpeedMs={combatLogSpeedMs}
        />
      );
    case 'admin':
      return <AdminScreen onStateUpdates={(updates) => applyStateUpdates(updates, stateSetters)} setTurns={setTurns} reloadZones={reloadZones} />;
    default:
      return null;
  }
}
