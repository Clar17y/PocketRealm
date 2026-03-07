'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { itemImageSrc, monsterImageSrc, resourceImageSrc, screenBackgroundSrc, skillIconSrc, zoneImageSrc } from '@/lib/assets';
import { AppShell } from '@/components/AppShell';
import { ChangelogModal } from '@/components/common/ChangelogModal';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { LootPicker } from '@/components/common/LootPicker';
import { LootReveal } from '@/components/common/LootReveal';
import { ResourceStatusBar } from '@/components/common/ResourceStatusBar';
import { SubNav } from '@/components/common/SubNav';
import { XpRateTutorial } from '@/components/common/XpRateTutorial';
import { BottomNav } from '@/components/BottomNav';
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
import { AchievementToast } from '@/components/AchievementToast';
import { QuestToast } from '@/components/QuestToast';
import { Leaderboard } from '@/components/screens/Leaderboard';
import { Casino } from '@/components/screens/Casino';
import { Settings } from '@/components/screens/Settings';
import { TrainingGrounds } from '@/components/screens/TrainingGrounds';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { rarityFromTier } from '@/lib/rarity';
import { titleCaseFromSnake } from '@/lib/format';
import { buildRecipeDiscountLookup, getDiscountedCost, getRecipeSkillInfo } from '@/lib/recipeDiscount';
import { CRAFTING_CONSTANTS, TURN_CONSTANTS, type SkillType } from '@pocketrealm/shared';
import { calculateEfficiency, xpForLevel } from '@pocketrealm/game-engine';
import { Sword, Shield, Crosshair, Sparkles, Pickaxe, Hammer, Leaf, FlaskConical, Axe, Scissors, Anvil, Gem } from 'lucide-react';
import { TutorialBanner } from '@/components/TutorialBanner';
import { TutorialDialog } from '@/components/TutorialDialog';
import {
  isTutorialActive,
  TUTORIAL_STEPS,
  TUTORIAL_STEP_WELCOME,
  TUTORIAL_STEP_EXPLORE,
  TUTORIAL_STEP_DONE,
} from '@/lib/tutorial';
import AdminScreen from '@/components/screens/AdminScreen';
import { ArenaScreen } from './screens/ArenaScreen';
import { GuildScreen } from '@/components/screens/GuildScreen';
import { FriendsScreen } from '@/components/screens/FriendsScreen';
import { MailScreen } from '@/components/screens/MailScreen';
import { Templates } from '@/components/screens/Templates';
import { TalentTree } from '@/components/screens/TalentTree';
import { Quests } from '@/components/screens/Quests';
import { CombatScreen } from './screens/CombatScreen';
import { useGameController } from './useGameController';
import { isMobKnown } from './combatHelpers';
import type { Screen } from './gameController.types';
import { useChat } from '@/hooks/useChat';
import { useCasinoSocket } from '@/hooks/useCasinoSocket';
import { ChatPanel } from '@/components/ChatPanel';

const SKILL_META: Record<string, { name: string; icon: typeof Sword; color: string }> = {
  melee: { name: 'Melee', icon: Sword, color: 'var(--rpg-red)' },
  ranged: { name: 'Ranged', icon: Crosshair, color: 'var(--rpg-green-light)' },
  magic: { name: 'Magic', icon: Sparkles, color: 'var(--rpg-purple)' },
  mining: { name: 'Mining', icon: Pickaxe, color: 'var(--rpg-text-secondary)' },
  foraging: { name: 'Foraging', icon: Leaf, color: 'var(--rpg-green-light)' },
  woodcutting: { name: 'Woodcutting', icon: Axe, color: 'var(--rpg-text-secondary)' },
  refining: { name: 'Refining', icon: Hammer, color: 'var(--rpg-blue-light)' },
  tanning: { name: 'Tanning', icon: Shield, color: 'var(--rpg-gold)' },
  weaving: { name: 'Weaving', icon: Scissors, color: 'var(--rpg-purple)' },
  weaponsmithing: { name: 'Weaponsmithing', icon: Hammer, color: 'var(--rpg-gold)' },
  armorsmithing: { name: 'Armorsmithing', icon: Anvil, color: 'var(--rpg-blue-light)' },
  leatherworking: { name: 'Leatherworking', icon: Shield, color: 'var(--rpg-green-light)' },
  tailoring: { name: 'Tailoring', icon: Scissors, color: 'var(--rpg-purple)' },
  alchemy: { name: 'Alchemy', icon: FlaskConical, color: 'var(--rpg-purple)' },
  jewelcrafting: { name: 'Jewelcrafting', icon: Gem, color: 'var(--rpg-gold)' },
};

const GATHERING_SKILL_TABS = [
  { id: 'mining', label: 'Mining' },
  { id: 'foraging', label: 'Foraging' },
  { id: 'woodcutting', label: 'Woodcutting' },
] as const;

const CRAFTING_SKILL_TABS = [
  { id: 'refining', label: 'Refining' },
  { id: 'tanning', label: 'Tanning' },
  { id: 'weaving', label: 'Weaving' },
  { id: 'weaponsmithing', label: 'Weaponsmithing' },
  { id: 'armorsmithing', label: 'Armorsmithing' },
  { id: 'leatherworking', label: 'Leatherworking' },
  { id: 'tailoring', label: 'Tailoring' },
  { id: 'alchemy', label: 'Alchemy' },
  { id: 'jewelcrafting', label: 'Jewelcrafting' },
] as const;

export default function GamePage() {
  const router = useRouter();
  const { player, isLoading, isAuthenticated, logout } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  const {
    activeScreen,
    setActiveScreen,
    handleNavigate,
    getActiveTab,
    handleTravelToZone,
    turns,
    setTurns,
    zones,
    activeZoneId,
    zoneConnections,
    undiscoveredZones,
    skills,
    characterProgression,
    inventory,
    equipment,
    gatheringNodes,
    gatheringLoading,
    gatheringError,
    gatheringPage,
    gatheringPagination,
    gatheringFilters,
    gatheringZoneFilter,
    gatheringResourceTypeFilter,
    activeGatheringSkill,
    setActiveGatheringSkill,
    craftingRecipes,
    activeCraftingSkill,
    setActiveCraftingSkill,
    activityLog,
    pushLog,
    pendingEncounters,
    pendingEncountersLoading,
    pendingEncountersError,
    pendingEncounterPage,
    pendingEncounterPagination,
    pendingEncounterFilters,
    pendingEncounterZoneFilter,
    pendingEncounterMobFilter,
    pendingEncounterSort,
    pendingClockMs,
    lastCombat,
    busyAction,
    actionError,
    bestiaryMobs,
    bestiaryLoading,
    bestiaryError,
    bestiaryPrefixSummary,
    hpState,
    setHpState,
    staminaState,
    manaState,
    skillPointState,
    handleAllocateSkillPoint,
    handleRespecSkillPoints,
    templates,
    handleLoadTemplates,
    pvpNotificationCount,
    incomingFriendRequestCount,
    mailUnreadCount,
    loadFriendCounts,
    playbackActive,
    combatPlaybackData,
    combatPlaybackQueue,
    combatPlaybackIndex,
    roomTransition,
    explorationPlaybackData,
    travelPlaybackData,
    currentZone,
    ownedByTemplateId,
    handleStartExploration,
    handleExplorationPlaybackComplete,
    handlePlaybackSkip,
    handleStartCombat,
    handleSelectStrategy,
    handleCombatPlaybackComplete,
    handleTravelPlaybackComplete,
    handleTravelPlaybackSkip,
    handleMine,
    handleGatheringPageChange,
    handleGatheringZoneFilterChange,
    handleGatheringResourceTypeFilterChange,
    handlePendingEncounterPageChange,
    handlePendingEncounterZoneFilterChange,
    handlePendingEncounterMobFilterChange,
    handlePendingEncounterSortChange,
    handleCraft,
    handleSalvageItem,
    handleSalvageBatch,
    handleForgeUpgrade,
    handleForgeReroll,
    handleDestroyItem,
    handleRepairItem,
    handleRepairAllEquipped,
    handleUseItem,
    handleEquipItem,
    handleUnequipSlot,
    handleAllocateAttribute,
    combatLogSpeedMs,
    setCombatLogSpeedMs,
    handleSetCombatLogSpeed,
    explorationSpeedMs,
    setExplorationSpeedMs,
    handleSetExplorationSpeed,
    autoSkipKnownCombat,
    handleSetAutoSkipKnownCombat,
    defaultExploreTurns,
    setDefaultExploreTurns,
    handleSetDefaultExploreTurns,
    quickRestHealPercent,
    handleSetQuickRestHealPercent,
    defaultRefiningMax,
    handleSetDefaultRefiningMax,
    lowHpWarning,
    handleSetLowHpWarning,
    confirmRarity,
    handleSetConfirmRarity,
    lootRevealRarity,
    handleSetLootRevealRarity,
    handleQuickRest,
    guildTaxRate,
    showChangelog,
    dismissChangelog,
    openChangelog,
    zoneCraftingLevel,
    zoneCraftingName,
    loadTurnsAndHp,
    loadPvpNotificationCount,
    achievementData,
    achievementUnclaimedCount,
    activeTitle,
    handleClaimAchievement,
    handleSetActiveTitle,
    loadAchievements,
    quests,
    questState,
    questsLoading,
    questsError,
    loadQuests,
    handleClaimQuestReward,
    handleClaimDailyBonus,
    handleRerollQuest,
    tutorialStep, skipTutorial, advanceTutorial,
    loadAll,
    combatLogPrefetch,
    inventoryCapacity,
    inventoryUsedSlots,
    isOverEncumbered,
    backpackFull,
    gold,
    setGold,
    trainingCooldown,
    setTrainingCooldown,
    handleExchangeGold,
    handlePlaceBet,
    pendingLootSession,
    handleSellItem,
    handleSellBatch,
    handleDepositItem,
    handleDepositBatch,
    handleWithdrawItem,
    handleWithdrawBatch,
    handleClaimLoot,
    handleDismissLoot,
    handleReopenLoot,
    confirmAbandonLoot,
    abandonLootAndTravel,
    cancelAbandonLoot,
    lootRevealItems,
    handleDismissLootReveal,
  } = useGameController({ isAuthenticated });

  const [achievementCategory, setAchievementCategory] = useState<string | null>(null);
  const chat = useChat({ isAuthenticated, currentZoneId: activeZoneId });
  const casinoSocket = useCasinoSocket(activeScreen === 'casino', player?.id ?? null);
  const lastDealerCountRef = useRef(0);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (actionError && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [actionError]);

  useEffect(() => {
    if (activeScreen === 'achievements') {
      void loadAchievements();
    }
  }, [activeScreen, loadAchievements]);

  useEffect(() => {
    if (activeScreen === 'quests') {
      void loadQuests();
    }
  }, [activeScreen, loadQuests]);

  useEffect(() => {
    if (activeScreen === 'casino') {
      chat.joinCasino();
      return () => chat.leaveCasino();
    }
  }, [activeScreen, chat.joinCasino, chat.leaveCasino]);

  // Inject dealer messages from casino socket into casino chat (batched)
  useEffect(() => {
    const msgs = casinoSocket.dealerMessages;
    if (msgs.length > lastDealerCountRef.current) {
      const newTexts = msgs.slice(lastDealerCountRef.current).map((m) => m.text);
      chat.injectCasinoSystemMessage(newTexts);
      lastDealerCountRef.current = msgs.length;
    }
  }, [casinoSocket.dealerMessages, chat.injectCasinoSystemMessage]);

  // Auto-navigate to the relevant screen when the tutorial step changes
  useEffect(() => {
    if (!isTutorialActive(tutorialStep)) return;
    const stepDef = TUTORIAL_STEPS[tutorialStep];
    if (stepDef?.navigateTo) {
      setActiveScreen(stepDef.navigateTo as Screen);
    }
  }, [tutorialStep, setActiveScreen]);

  const tutorialPulseTabs = React.useMemo(() => {
    if (!isTutorialActive(tutorialStep)) return undefined;
    const stepDef = TUTORIAL_STEPS[tutorialStep];
    if (!stepDef?.pulseTab) return undefined;
    return new Set([stepDef.pulseTab]);
  }, [tutorialStep]);

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

  const lowestXpRate = useMemo(() => {
    let lowest = { skillName: '', rate: 100 };
    for (const s of skills) {
      const rate = Math.round(calculateEfficiency(s.dailyXpGained, s.skillType as SkillType) * 100);
      if (rate < lowest.rate) {
        const meta = SKILL_META[s.skillType];
        lowest = { skillName: meta?.name ?? s.skillType, rate };
      }
    }
    return lowest;
  }, [skills]);

  const badgeTabs = useMemo(() => {
    const tabs = new Set<string>();
    if (achievementUnclaimedCount > 0 || quests.some(q => q.status === 'completed')) tabs.add('home');
    if (incomingFriendRequestCount > 0 || mailUnreadCount > 0) tabs.add('social');
    return tabs.size > 0 ? tabs : undefined;
  }, [achievementUnclaimedCount, quests, incomingFriendRequestCount, mailUnreadCount]);

  // Mail compose recipient (set when clicking "Send Mail" from friend profile)
  const [mailRecipient, setMailRecipient] = useState<{ id: string; name: string } | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--rpg-background)] flex items-center justify-center">
        <p className="text-[var(--rpg-text-secondary)]">Loading...</p>
      </div>
    );
  }

  const activeTab = getActiveTab();
  const activeGatheringSkillMeta = SKILL_META[activeGatheringSkill];
  const activeCraftingSkillMeta = SKILL_META[activeCraftingSkill];
  const activeGatheringSkillData = skills.find((s) => s.skillType === activeGatheringSkill);
  const activeCraftingSkillData = skills.find((s) => s.skillType === activeCraftingSkill);
  const filteredGatheringNodes = useMemo(() => gatheringNodes.filter((n) => n.skillRequired === activeGatheringSkill), [gatheringNodes, activeGatheringSkill]);
  const filteredCraftingRecipes = useMemo(() => craftingRecipes.filter((recipe) => recipe.skillType === activeCraftingSkill), [craftingRecipes, activeCraftingSkill]);
  const ownedResourceNames = useMemo(() => new Set(
    inventory.filter((i) => i.template.stackable && i.template.itemType === 'resource' && !i.equippedSlot).map((i) => i.template.name),
  ), [inventory]);
  const discountLookup = useMemo(() => buildRecipeDiscountLookup(craftingRecipes, skills), [craftingRecipes, skills]);
  const equipmentStats = useMemo(() => {
    const stats = { attack: 0, defence: 0, magicDefence: 0, hp: 0, dodge: 0, accuracy: 0, critChance: 0, critDamage: 0 };
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
        if (typeof src.critChance === 'number') stats.critChance += src.critChance;
        if (typeof src.critDamage === 'number') stats.critDamage += src.critDamage;
      }
    }
    return stats;
  }, [equipment]);

  const renderScreen = () => {
    switch (activeScreen) {
      case 'home':
        const currentLevelFloorXp = xpForLevel(characterProgression.characterLevel);
        const nextLevelTotalXp = xpForLevel(characterProgression.characterLevel + 1);
        const currentLevelXp = Math.max(0, characterProgression.characterXp - currentLevelFloorXp);
        const requiredLevelXp = Math.max(1, nextLevelTotalXp - currentLevelFloorXp);
        return (
          <>
            <Dashboard
              playerData={{
                turns,
                maxTurns: TURN_CONSTANTS.BANK_CAP,
                turnsRegenRate: TURN_CONSTANTS.REGEN_RATE * 60,
                gold,
                currentXP: characterProgression.characterXp,
                nextLevelXP: nextLevelTotalXp,
                currentLevelXp,
                requiredLevelXp,
                currentZone: currentZone?.name ?? 'Unknown',
                isRecovering: hpState.isRecovering,
                isOverEncumbered,
                recoveryCost: hpState.recoveryCost,
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
          </>
        );
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
              imageSrc:
                currentZone?.name && currentZone.name !== '???'
                  ? zoneImageSrc(currentZone.name)
                  : undefined,
            }}
            explorationProgress={currentZone?.exploration ? {
              turnsExplored: currentZone.exploration.turnsExplored,
              turnsToExplore: currentZone.exploration.turnsToExplore,
              percent: currentZone.exploration.percent,
              tiers: currentZone.exploration.tiers,
            } : null}
            availableTurns={turns}
            onStartExploration={handleStartExploration}
            activityLog={activityLog}
            isRecovering={hpState.isRecovering}
            isOverEncumbered={isOverEncumbered}
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
            onNavigateToRest={() => handleNavigate('rest')}
            guildTaxRate={guildTaxRate}
            combatLogPrefetch={combatLogPrefetch}
            combatXpRate={primaryCombatXpRate}
          />
        );
      case 'inventory': {
        return (
          <Inventory
            items={inventory.map((item) => {
              const isEquip = ['weapon', 'armor'].includes(item.template.itemType);
              const hasSalvageRecipe = isEquip && discountLookup.recipeByTemplateId.has(item.template.id);
              const salvageCost = hasSalvageRecipe
                ? getDiscountedCost(discountLookup, item.template.id, CRAFTING_CONSTANTS.SALVAGE_TURN_COST)
                : null;
              return {
                id: item.id,
                name: item.template.name,
                imageSrc: itemImageSrc(item.template.name, item.template.itemType),
                quantity: item.quantity,
                rarity: item.rarity,
                description: item.template.itemType,
                type: item.template.itemType,
                weightClass: item.template.weightClass ?? null,
                slot: item.template.slot,
                equippedSlot: item.equippedSlot,
                durability: (() => {
                  const templateMax = item.template.maxDurability ?? 0;
                  const max = item.maxDurability ?? templateMax;
                  if (!['weapon', 'armor'].includes(item.template.itemType) || max <= 0) return null;
                  const cur = item.currentDurability ?? max;
                  return { current: cur, max };
                })(),
                baseStats: item.template.baseStats,
                bonusStats: item.bonusStats ?? null,
                requiredSkill: item.template.requiredSkill ?? null,
                requiredLevel: item.template.requiredLevel ?? 1,
                salvageCost,
                sellPrice: item.template.sellPrice ?? null,
              };
            })}
            capacity={inventoryCapacity}
            usedSlots={inventoryUsedSlots}
            gold={gold}
            isInTown={currentZone?.zoneType === 'town'}
            onDrop={handleDestroyItem}
            onSalvage={handleSalvageItem}
            onSalvageBatch={handleSalvageBatch}
            onRepair={handleRepairItem}
            onEquip={handleEquipItem}
            onUnequip={handleUnequipSlot}
            onUse={handleUseItem}
            onSell={handleSellItem}
            onSellBatch={handleSellBatch}
            onDeposit={handleDepositItem}
            onDepositBatch={handleDepositBatch}
            onWithdraw={handleWithdrawItem}
            onWithdrawBatch={handleWithdrawBatch}
            getSalvageCost={(templateId) => {
              if (!discountLookup.recipeByTemplateId.has(templateId)) return null;
              return getDiscountedCost(discountLookup, templateId, CRAFTING_CONSTANTS.SALVAGE_TURN_COST);
            }}
            zoneCraftingLevel={zoneCraftingLevel}
            confirmRarity={confirmRarity}
          />
        );
      }
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
                id: e.slot,
                name: label,
                item: template
                  ? {
                      id: e.item!.id,
                      name: template.name,
                      imageSrc: itemImageSrc(template.name, template.itemType),
                      rarity: e.item!.rarity,
                      weightClass: template.weightClass ?? null,
                      durability: cur,
                      maxDurability: max,
                      baseStats: template.baseStats,
                      bonusStats: e.item?.bonusStats ?? null,
                    }
                  : null,
              };
            })}
            inventoryItems={inventory
              .filter((item) => Boolean(item.template.slot) && ['weapon', 'armor'].includes(item.template.itemType) && item.quantity === 1)
              .map((item) => {
                const templateMax = item.template.maxDurability ?? 0;
                const max = item.maxDurability ?? templateMax;
                const durability =
                  max > 0 ? { current: item.currentDurability ?? max, max } : null;
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
            onEquip={handleEquipItem}
            onUnequip={handleUnequipSlot}
            onRepairItem={handleRepairItem}
            onRepairAll={handleRepairAllEquipped}
            turns={turns}
            stats={equipmentStats}
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
                  id: s.skillType,
                  name: meta.name,
                  icon: meta.icon,
                  imageSrc: skillIconSrc(s.skillType),
                  level: s.level,
                  currentXP: s.xp,
                  nextLevelXP: xpForLevel(s.level + 1),
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
              id: z.id,
              name: z.name,
              description: z.description,
              difficulty: z.difficulty,
              travelCost: z.travelCost,
              discovered: z.discovered ?? true,
              zoneType: z.zoneType ?? 'wild',
              imageSrc: z.discovered && z.name !== '???' ? zoneImageSrc(z.name) : undefined,
              exploration: z.exploration ?? null,
            }))}
            connections={zoneConnections}
            currentZoneId={activeZoneId ?? ''}
            availableTurns={turns}
            isRecovering={hpState.isRecovering}
            isOverEncumbered={isOverEncumbered}
            playbackActive={playbackActive}
            travelPlaybackData={travelPlaybackData}
            onTravelPlaybackComplete={handleTravelPlaybackComplete}
            onTravelPlaybackSkip={handleTravelPlaybackSkip}
            onPushLog={pushLog}
            activityLog={activityLog}
            combatSpeedMs={combatLogSpeedMs}
            explorationSpeedMs={explorationSpeedMs}
            autoSkipKnownCombat={autoSkipKnownCombat}
            bestiaryMobs={bestiaryMobsForPlayback}
            onTravel={handleTravelToZone}
            onExploreCurrentZone={() => setActiveScreen('explore')}
            guildTaxRate={guildTaxRate}
            undiscoveredZones={undiscoveredZones}
            combatLogPrefetch={combatLogPrefetch}
            playerStartStamina={staminaState.current}
            playerStartMana={manaState.current}
            playerMaxStamina={staminaState.max}
            playerMaxMana={manaState.max}
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
              id: m.id,
              name: m.name,
              imageSrc: m.isDiscovered ? monsterImageSrc(m.name) : undefined,
              level: m.level,
              isDiscovered: m.isDiscovered,
              killCount: m.killCount,
              stats: m.stats,
              zones: m.zones,
              description: m.description,
              prefixesEncountered: m.prefixesEncountered,
              explorationTier: m.explorationTier,
              tierLocked: m.tierLocked,
              bossRotation: m.bossRotation,
              drops: m.drops.map((d) => ({
                name: d.item.name,
                imageSrc: itemImageSrc(d.item.name, d.item.itemType),
                dropRate: d.dropRate,
                rarity: d.rarity,
              })),
            }))}
            prefixSummary={bestiaryPrefixSummary}
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
              skillName={activeCraftingSkillMeta?.name ?? 'Crafting'}
              skillLevel={activeCraftingSkillData?.level ?? 1}
              xpRate={Math.round(calculateEfficiency(activeCraftingSkillData?.dailyXpGained ?? 0, activeCraftingSkill as SkillType) * 100)}
              recipes={filteredCraftingRecipes.map((r) => ({
                id: r.id,
                name: r.resultTemplate.name,
                imageSrc: itemImageSrc(r.resultTemplate.name, r.resultTemplate.itemType),
                isAdvanced: r.isAdvanced,
                isDiscovered: r.isDiscovered,
                discoveryHint: r.discoveryHint,
                soulbound: r.soulbound,
                resultQuantity: 1,
                requiredLevel: r.requiredLevel,
                turnCost: r.turnCost,
                xpReward: r.xpReward,
                baseStats: r.resultTemplate.baseStats,
                materials: r.materials.map((m) => {
                  const meta = r.materialTemplates.find((t) => t.id === m.templateId);
                  const owned = ownedByTemplateId.get(m.templateId) ?? 0;
                  return {
                    name: meta?.name ?? 'Unknown',
                    icon: '?',
                    imageSrc: meta ? itemImageSrc(meta.name, meta.itemType) : undefined,
                    required: m.quantity,
                    owned,
                  };
                }),
                rarity: rarityFromTier(r.resultTemplate.tier),
              }))}
              onCraft={handleCraft}
              activityLog={activityLog}
              isRecovering={hpState.isRecovering}
              isOverEncumbered={isOverEncumbered}
              recoveryCost={hpState.recoveryCost}
              zoneCraftingLevel={zoneCraftingLevel}
              zoneName={zoneCraftingName}
              defaultMaxQuantity={activeCraftingSkill === 'refining' && defaultRefiningMax}
              guildTaxRate={guildTaxRate}
              backpackFull={backpackFull}
            />
          </div>
        );
      case 'forge': {
        return (
          <Forge
            items={inventory
              .filter((item) => ['weapon', 'armor'].includes(item.template.itemType) && item.quantity === 1)
              .map((item) => {
                const info = getRecipeSkillInfo(discountLookup, item.template.id);
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
                  recipeSkillLevel: info?.recipeSkillLevel ?? null,
                  recipeRequiredLevel: info?.recipeRequiredLevel ?? null,
                };
              })}
            equippedLuck={equipment.reduce((sum, slot) => {
              const base = slot.item?.template?.baseStats as Record<string, unknown> | undefined;
              const bonus = slot.item?.bonusStats as Record<string, unknown> | undefined;
              const baseLuck = typeof base?.luck === 'number' ? base.luck : 0;
              const bonusLuck = typeof bonus?.luck === 'number' ? bonus.luck : 0;
              return sum + baseLuck + bonusLuck;
            }, 0)}
            activityLog={activityLog}
            onUpgrade={handleForgeUpgrade}
            onReroll={handleForgeReroll}
            isRecovering={hpState.isRecovering}
            recoveryCost={hpState.recoveryCost}
            zoneCraftingLevel={zoneCraftingLevel}
            guildTaxRate={guildTaxRate}
          />
        );
      }
      case 'gathering':
        return (
          <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {GATHERING_SKILL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveGatheringSkill(tab.id);
                    handleGatheringPageChange(1);
                  }}
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
              skillName={activeGatheringSkillMeta?.name ?? 'Gathering'}
              skillLevel={activeGatheringSkillData?.level ?? 1}
              xpRate={Math.round(calculateEfficiency(activeGatheringSkillData?.dailyXpGained ?? 0, activeGatheringSkill as SkillType) * 100)}
              nodes={filteredGatheringNodes.map((n) => ({
                id: n.id,
                name: titleCaseFromSnake(n.resourceType),
                imageSrc: resourceImageSrc(n.resourceType),
                levelRequired: n.levelRequired,
                baseYield: n.baseYield,
                zoneId: n.zoneId,
                zoneName: n.zoneName,
                resourceTypeCategory: n.resourceTypeCategory,
                remainingCapacity: n.remainingCapacity,
                maxCapacity: n.maxCapacity,
                sizeName: n.sizeName,
                weathered: n.weathered,
                eventModifiers: n.eventModifiers,
              }))}
              currentZoneId={activeZoneId}
              availableTurns={turns}
              activityLog={activityLog}
              nodesLoading={gatheringLoading}
              nodesError={gatheringError}
              page={gatheringPage}
              pagination={gatheringPagination}
              filters={gatheringFilters}
              zoneFilter={gatheringZoneFilter}
              resourceTypeFilter={gatheringResourceTypeFilter}
              onPageChange={handleGatheringPageChange}
              onZoneFilterChange={handleGatheringZoneFilterChange}
              onResourceTypeFilterChange={handleGatheringResourceTypeFilterChange}
              onStartGathering={handleMine}
              isRecovering={hpState.isRecovering}
              isOverEncumbered={isOverEncumbered}
              backpackFull={backpackFull}
              ownedResourceNames={ownedResourceNames}
              recoveryCost={hpState.recoveryCost}
              guildTaxRate={guildTaxRate}
            />
          </div>
        );
      case 'combat': {
        const shouldAutoSkipCombat = autoSkipKnownCombat && combatPlaybackData &&
          isMobKnown(combatPlaybackData.mobTemplateId, combatPlaybackData.mobPrefix, bestiaryMobs);
        return (
          <CombatScreen
            hpState={hpState}
            isOverEncumbered={isOverEncumbered}
            currentTurns={turns}
            currentZoneId={activeZoneId}
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
            busyAction={busyAction}
            lastCombat={lastCombat}
            bestiaryMobs={bestiaryMobs.map((mob) => ({ id: mob.id, isDiscovered: mob.isDiscovered }))}
            onStartCombat={handleStartCombat}
            onSelectStrategy={handleSelectStrategy}
            onPendingEncounterPageChange={handlePendingEncounterPageChange}
            onPendingEncounterZoneFilterChange={handlePendingEncounterZoneFilterChange}
            onPendingEncounterMobFilterChange={handlePendingEncounterMobFilterChange}
            onPendingEncounterSortChange={handlePendingEncounterSortChange}
            combatPlaybackData={combatPlaybackData}
            combatSpeedMs={combatLogSpeedMs}
            autoSkipCombat={!!shouldAutoSkipCombat}
            onCombatPlaybackComplete={handleCombatPlaybackComplete}
            fightProgress={combatPlaybackQueue && combatPlaybackQueue.length > 1
              ? {
                  current: combatPlaybackIndex + 1,
                  total: combatPlaybackQueue.length,
                  room: combatPlaybackQueue[combatPlaybackIndex]?.room,
                }
              : null
            }
            roomTransition={roomTransition}
            lowHpWarning={lowHpWarning}
            onQuickRest={handleQuickRest}
            quickRestPercent={quickRestHealPercent}
            onNavigateToRest={() => handleNavigate('rest')}
            combatXpRate={primaryCombatXpRate}
            staminaState={staminaState}
            manaState={manaState}
          />
        );
      }
      case 'arena':
        return (
          <ArenaScreen
            characterLevel={characterProgression.characterLevel}
            busyAction={busyAction}
            currentTurns={turns}
            playerId={player?.id ?? null}
            isInTown={currentZone?.zoneType === 'town'}
            onTurnsChanged={() => void loadTurnsAndHp()}
            onNotificationsChanged={() => void loadPvpNotificationCount()}
            onHpChanged={() => void loadTurnsAndHp()}
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
            combatLogSpeedMs={combatLogSpeedMs}
            onCombatLogSpeedChange={setCombatLogSpeedMs}
            onCombatLogSpeedCommit={handleSetCombatLogSpeed}
            autoSkipKnownCombat={autoSkipKnownCombat}
            onAutoSkipKnownCombatChange={handleSetAutoSkipKnownCombat}
            lowHpWarning={lowHpWarning}
            onLowHpWarningChange={handleSetLowHpWarning}
            explorationSpeedMs={explorationSpeedMs}
            onExplorationSpeedChange={setExplorationSpeedMs}
            onExplorationSpeedCommit={handleSetExplorationSpeed}
            defaultExploreTurns={defaultExploreTurns}
            onDefaultExploreTurnsChange={setDefaultExploreTurns}
            onDefaultExploreTurnsCommit={handleSetDefaultExploreTurns}
            quickRestHealPercent={quickRestHealPercent}
            onQuickRestHealPercentChange={handleSetQuickRestHealPercent}
            defaultRefiningMax={defaultRefiningMax}
            onDefaultRefiningMaxChange={handleSetDefaultRefiningMax}
            confirmRarity={confirmRarity}
            onConfirmRarityChange={handleSetConfirmRarity}
            lootRevealRarity={lootRevealRarity}
            onLootRevealRarityChange={handleSetLootRevealRarity}
            onLogout={() => { logout(); router.push('/'); }}
          />
        );
      case 'worldEvents':
        return (
          <WorldEvents
            currentZoneId={activeZoneId}
            currentZoneName={currentZone?.name ?? null}
            playerId={player?.id ?? null}
            onNavigate={(s) => setActiveScreen(s as Screen)}
          />
        );
      case 'achievements':
        return (
          <Achievements
            achievements={achievementData?.achievements ?? []}
            unclaimedCount={achievementUnclaimedCount}
            activeTitle={activeTitle}
            onClaim={handleClaimAchievement}
            onSetTitle={handleSetActiveTitle}
            initialCategory={achievementCategory}
            onCategoryViewed={() => setAchievementCategory(null)}
          />
        );
      case 'quests':
        return (
          <Quests
            quests={quests}
            questState={questState}
            loading={questsLoading}
            error={questsError}
            onClaimReward={handleClaimQuestReward}
            onClaimBonus={handleClaimDailyBonus}
            onReroll={handleRerollQuest}
          />
        );
      case 'leaderboard':
        return <Leaderboard playerId={player?.id ?? null} />;
      case 'guild':
        return (
          <GuildScreen
            playerId={player?.id ?? null}
            characterLevel={characterProgression.characterLevel}
            onTurnsChanged={() => void loadTurnsAndHp()}
          />
        );
      case 'friends':
        return (
          <FriendsScreen
            playerId={player?.id ?? null}
            onTurnsChanged={() => void loadTurnsAndHp()}
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
            staminaState={staminaState}
            manaState={manaState}
            onLoadTemplates={handleLoadTemplates}
            onNavigate={setActiveScreen}
          />
        );
      case 'talentTree':
        return (
          <TalentTree
            skillPointState={skillPointState!}
            skills={skills}
            onAllocate={handleAllocateSkillPoint}
            onRespec={handleRespecSkillPoints}
            onNavigate={setActiveScreen}
          />
        );
      case 'casino':
        return (
          <Casino
            gold={gold}
            turns={turns}
            onExchangeGold={handleExchangeGold}
            onPlaceBet={handlePlaceBet}
            onGoldUpdate={setGold}
            onTurnsUpdate={setTurns}
            isInTown={currentZone?.zoneType === 'town'}
            liveBets={casinoSocket.liveBets}
            sessionBets={casinoSocket.sessionBets}
            sessionProfit={casinoSocket.sessionProfit}
            lastResult={casinoSocket.lastResult}
            trackBet={casinoSocket.trackBet}
            playerName={player?.username ?? null}
          />
        );
      case 'training':
        return (
          <TrainingGrounds
            bestiary={bestiaryMobs
              .filter((m) => m.isDiscovered)
              .map((m) => ({
                id: m.id,
                name: m.name,
                level: m.level,
                prefixesEncountered: m.prefixesEncountered,
              }))}
            cooldownSeconds={trainingCooldown}
            onCooldownUpdate={setTrainingCooldown}
            isInTown={currentZone?.zoneType === 'town'}
            combatLogSpeedMs={combatLogSpeedMs}
          />
        );
      case 'admin':
        return <AdminScreen onAction={loadAll} />;
      default:
        return null;
    }
  };

  return (
    <>
      {showChangelog && <ChangelogModal onDismiss={dismissChangelog} />}
      {confirmAbandonLoot && (
        <ConfirmModal
          title="Abandon Loot?"
          message="You have unclaimed overflow loot. Travelling to another zone will leave it behind forever."
          confirmLabel="Travel Anyway"
          cancelLabel="Stay"
          variant="warning"
          onConfirm={abandonLootAndTravel}
          onCancel={cancelAbandonLoot}
        />
      )}
      {lootRevealItems && lootRevealItems.length > 0 && (
        <LootReveal items={lootRevealItems} onContinue={handleDismissLootReveal} />
      )}
      {pendingLootSession && !pendingLootSession.minimized && (
        <LootPicker
          sessionId={pendingLootSession.sessionId}
          items={pendingLootSession.items}
          availableSlots={Math.max(0, inventoryCapacity - inventoryUsedSlots)}
          onClaim={handleClaimLoot}
          onDismiss={handleDismissLoot}
        />
      )}
      <AppShell
  turns={turns}
  username={player?.username}
  mailUnreadCount={mailUnreadCount}
  onMailClick={() => setActiveScreen('mail')}
  onSettings={() => handleNavigate('settings')}
  onLogout={() => { logout(); router.push('/'); }}
  onWhatsNew={openChangelog}
  hasUnseenChangelog={showChangelog}
  backgroundSrc={
    screenBackgroundSrc(activeScreen, activeCraftingSkill)
    ?? (['home', 'explore', 'combat', 'gathering', 'rest'].includes(activeScreen) && currentZone?.name && currentZone.name !== '???'
      ? zoneImageSrc(currentZone.name)
      : undefined)
  }
>
        {/* Broken gear warning banner */}
        {equipment.some((e) => {
          if (!e.item) return false;
          const maxDur = e.item.template?.maxDurability ?? 0;
          if (maxDur <= 0) return false; // no durability system (e.g. backpacks)
          const cur = e.item.currentDurability ?? maxDur;
          return cur <= 0;
        }) && (
          <div className="mb-3 p-2 rounded-lg bg-[var(--rpg-red)]/10 border border-[var(--rpg-red)] text-[var(--rpg-red)] text-sm text-center">
            You have broken equipment! Broken gear provides no stats. Visit your inventory to repair.
          </div>
        )}

        {pendingLootSession?.minimized && (
          <button
            onClick={handleReopenLoot}
            className="mb-3 w-full p-2 rounded-lg bg-[var(--rpg-gold)]/10 border border-[var(--rpg-gold)] text-[var(--rpg-gold)] text-sm text-center hover:bg-[var(--rpg-gold)]/20 transition-colors"
          >
            You have unclaimed loot! Tap to pick up items.
          </button>
        )}

        <TutorialBanner
          tutorialStep={tutorialStep}
          onSkip={skipTutorial}
        />

        {/* Sub-navigation for screens */}
        {activeTab === 'home' && (
          <SubNav
            tabs={[
              { id: 'home', label: 'Dashboard' },
              { id: 'zones', label: 'Map' },
              { id: 'worldEvents', label: 'Events' },
              { id: 'achievements', label: 'Achievements', badge: achievementUnclaimedCount },
              { id: 'quests', label: 'Quests', badge: quests.filter(q => q.status === 'completed').length },
              { id: 'leaderboard', label: 'Rankings' },
              { id: 'bestiary', label: 'Bestiary' },
              { id: 'skills', label: 'Skills' },
              ...(currentZone?.zoneType === 'town' ? [
                { id: 'casino', label: 'Casino' },
                { id: 'training', label: 'Training' },
              ] : []),
              ...(player?.role === 'admin' ? [{ id: 'admin', label: 'Admin' }] : []),
            ]}
            activeId={activeScreen}
            onSelect={(id) => setActiveScreen(id as Screen)}
          />
        )}

        {activeTab === 'explore' && (
          <SubNav
            tabs={[
              { id: 'explore', label: 'Explore' },
              { id: 'gathering', label: 'Gathering' },
              { id: 'crafting', label: 'Crafting' },
              { id: 'forge', label: 'Forge' },
            ]}
            activeId={activeScreen}
            onSelect={(id) => setActiveScreen(id as Screen)}
          />
        )}

        {activeTab === 'inventory' && (
          <SubNav
            tabs={[
              { id: 'inventory', label: 'Items' },
              { id: 'equipment', label: 'Equipment' },
            ]}
            activeId={activeScreen}
            onSelect={(id) => setActiveScreen(id as Screen)}
          />
        )}

        {activeTab === 'combat' && (
          <SubNav
            tabs={[
              { id: 'combat', label: 'Combat' },
              { id: 'templates', label: 'Templates' },
              { id: 'talentTree', label: 'Skill Tree' },
              { id: 'arena', label: 'Arena', badge: pvpNotificationCount },
            ]}
            activeId={activeScreen}
            onSelect={(id) => setActiveScreen(id as Screen)}
          />
        )}

        {getActiveTab() === 'social' && (
          <SubNav
            tabs={[
              { id: 'guild', label: 'Guild' },
              { id: 'friends', label: 'Friends', badge: incomingFriendRequestCount },
              { id: 'mail', label: 'Mail', badge: mailUnreadCount },
            ]}
            activeId={activeScreen}
            onSelect={(id) => {
              if (id !== 'mail') setMailRecipient(null);
              setActiveScreen(id as Screen);
            }}
          />
        )}

        {actionError && (
          <div
            ref={errorRef}
            className="mb-4 p-3 rounded bg-[var(--rpg-background)] border border-[var(--rpg-red)] text-[var(--rpg-red)] animate-error-flash"
          >
            {actionError}
          </div>
        )}

        {renderScreen()}
        <XpRateTutorial skillName={lowestXpRate.skillName} rate={lowestXpRate.rate} />
      </AppShell>
      <ChatPanel
        isOpen={chat.isOpen}
        toggleChat={chat.toggleChat}
        activeChannel={chat.activeChannel}
        setActiveChannel={chat.setActiveChannel}
        worldMessages={chat.worldMessages}
        zoneMessages={chat.zoneMessages}
        casinoMessages={chat.casinoMessages}
        presence={chat.presence}
        unreadWorld={chat.unreadWorld}
        unreadZone={chat.unreadZone}
        unreadCasino={chat.unreadCasino}
        casinoActive={chat.casinoActive}
        sendMessage={chat.sendMessage}
        rateLimitError={chat.rateLimitError}
        currentZoneId={activeZoneId}
        currentZoneName={currentZone?.name ?? null}
        playerId={player?.id ?? null}
        pinnedMessage={chat.activeChannel === 'casino' ? null : chat.activeChannel === 'world' ? chat.pinnedWorld : chat.pinnedZone}
      />
      <BottomNav
        activeTab={activeTab}
        onNavigate={handleNavigate}
        badgeTabs={badgeTabs}
        pulseTabs={tutorialPulseTabs}
      />
      <TutorialDialog
        tutorialStep={tutorialStep}
        onDismiss={() => {
          if (tutorialStep === TUTORIAL_STEP_WELCOME) {
            advanceTutorial(TUTORIAL_STEP_WELCOME);
          } else if (tutorialStep === TUTORIAL_STEP_DONE) {
            advanceTutorial(TUTORIAL_STEP_DONE);
          }
        }}
      />
      <AchievementToast onNavigate={(category) => { setAchievementCategory(category); setActiveScreen('achievements'); }} />
      <QuestToast />
    </>
  );
}

