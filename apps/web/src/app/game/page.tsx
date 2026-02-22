'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { itemImageSrc, monsterImageSrc, resourceImageSrc, skillIconSrc, zoneImageSrc } from '@/lib/assets';
import { AppShell } from '@/components/AppShell';
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
import { Leaderboard } from '@/components/screens/Leaderboard';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { Slider } from '@/components/ui/Slider';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { rarityFromTier } from '@/lib/rarity';
import { titleCaseFromSnake } from '@/lib/format';
import { TURN_CONSTANTS, type SkillType } from '@adventure/shared';
import { calculateEfficiency, xpForLevel } from '@adventure/game-engine';
import { Sword, Shield, Crosshair, Sparkles, Pickaxe, Hammer, Leaf, FlaskConical, Axe, Scissors, Anvil } from 'lucide-react';
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
import { CombatScreen } from './screens/CombatScreen';
import { useGameController, type Screen } from './useGameController';
import { useChat } from '@/hooks/useChat';
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
] as const;

/* Mock data for demo - will be replaced with API calls
const mockPlayerData = {
  turns: 45000,
  maxTurns: 64800,
  turnsRegenRate: 60,
  gold: 1250,
  currentXP: 15420,
  nextLevelXP: 20000,
  currentZone: 'Forest Edge',
};

const mockSkills = [
  { name: 'Melee', level: 15, icon: Sword },
  { name: 'Defence', level: 12, icon: Shield },
  { name: 'Ranged', level: 8, icon: Crosshair },
  { name: 'Vitality', level: 10, icon: Heart },
  { name: 'Magic', level: 5, icon: Sparkles },
  { name: 'Evasion', level: 7, icon: Zap },
  { name: 'Mining', level: 20, icon: Pickaxe },
  { name: 'Smithing', level: 14, icon: Hammer },
];

const mockDetailedSkills = [
  { id: '1', name: 'Melee', icon: Sword, level: 15, currentXP: 12500, nextLevelXP: 15000, efficiency: 85, color: 'var(--rpg-red)' },
  { id: '2', name: 'Defence', icon: Shield, level: 12, currentXP: 8200, nextLevelXP: 10000, efficiency: 78, color: 'var(--rpg-blue-light)' },
  { id: '3', name: 'Ranged', icon: Crosshair, level: 8, currentXP: 3500, nextLevelXP: 5000, efficiency: 72, color: 'var(--rpg-green-light)' },
  { id: '4', name: 'Vitality', icon: Heart, level: 10, currentXP: 5800, nextLevelXP: 7500, efficiency: 80, color: 'var(--rpg-green-light)' },
  { id: '5', name: 'Magic', icon: Sparkles, level: 5, currentXP: 1200, nextLevelXP: 2000, efficiency: 65, color: 'var(--rpg-purple)' },
  { id: '6', name: 'Evasion', icon: Zap, level: 7, currentXP: 2800, nextLevelXP: 4000, efficiency: 70, color: 'var(--rpg-gold)' },
  { id: '7', name: 'Mining', icon: Pickaxe, level: 20, currentXP: 18500, nextLevelXP: 22000, efficiency: 92, color: 'var(--rpg-text-secondary)' },
  { id: '8', name: 'Smithing', icon: Hammer, level: 14, currentXP: 11200, nextLevelXP: 14000, efficiency: 88, color: 'var(--rpg-gold)' },
];

const mockInventory = [
  { id: '1', name: 'Iron Sword', icon: '⚔️', quantity: 1, rarity: 'uncommon' as const, description: 'A sturdy iron sword.', type: 'weapon' },
  { id: '2', name: 'Health Potion', icon: '🧪', quantity: 5, rarity: 'common' as const, description: 'Restores 50 HP.', type: 'consumable' },
  { id: '3', name: 'Iron Ore', icon: '🪨', quantity: 24, rarity: 'common' as const, description: 'Raw iron ore for smelting.', type: 'material' },
  { id: '4', name: 'Dragon Scale', icon: '🐲', quantity: 2, rarity: 'epic' as const, description: 'A rare scale from a dragon.', type: 'material' },
  { id: '5', name: 'Leather Boots', icon: '👢', quantity: 1, rarity: 'common' as const, description: 'Basic leather boots.', type: 'armor' },
];

const mockEquipmentSlots = [
  { id: 'head', name: 'Head', item: { name: 'Iron Helmet', icon: '🪖', rarity: 'uncommon' as const, durability: 85, maxDurability: 100 } },
  { id: 'neck', name: 'Neck', item: null },
  { id: 'chest', name: 'Chest', item: { name: 'Leather Chest', icon: '🥋', rarity: 'common' as const, durability: 72, maxDurability: 100 } },
  { id: 'mainHand', name: 'Main Hand', item: { name: 'Iron Sword', icon: '⚔️', rarity: 'uncommon' as const, durability: 90, maxDurability: 100 } },
  { id: 'offHand', name: 'Off Hand', item: { name: 'Iron Shield', icon: '🛡️', rarity: 'uncommon' as const, durability: 65, maxDurability: 100 } },
  { id: 'gloves', name: 'Gloves', item: null },
  { id: 'belt', name: 'Belt', item: null },
  { id: 'ring', name: 'Ring', item: null },
  { id: 'legs', name: 'Legs', item: { name: 'Leather Legs', icon: '👖', rarity: 'common' as const, durability: 80, maxDurability: 100 } },
  { id: 'boots', name: 'Boots', item: { name: 'Leather Boots', icon: '👢', rarity: 'common' as const, durability: 95, maxDurability: 100 } },
  { id: 'charm', name: 'Charm', item: null },
];

const mockEquipmentStats = { attack: 45, defence: 32, hp: 120, evasion: 8 };

const mockZones = [
  { id: '1', name: 'Starter Village', icon: '🏘️', difficulty: 1, travelCost: 0, isLocked: false, isCurrent: false, description: 'A peaceful village for beginners.' },
  { id: '2', name: 'Forest Edge', icon: '🌲', difficulty: 2, travelCost: 10, isLocked: false, isCurrent: true, description: 'Light forest with weak creatures.' },
  { id: '3', name: 'Deep Forest', icon: '🌳', difficulty: 3, travelCost: 25, isLocked: false, isCurrent: false, description: 'Dense forest with stronger foes.' },
  { id: '4', name: 'Cave Entrance', icon: '🕳️', difficulty: 4, travelCost: 50, isLocked: false, isCurrent: false, description: 'Dark caves with valuable ores.' },
  { id: '5', name: 'Dragon\'s Lair', icon: '🐉', difficulty: 5, travelCost: 100, isLocked: true, isCurrent: false, description: 'Home of the fearsome dragon.' },
];

const mockMonsters = [
  { id: '1', name: 'Rat', icon: '🐀', level: 1, isDiscovered: true, killCount: 25, stats: { hp: 10, attack: 2, defence: 1 }, drops: [{ name: 'Rat Tail', icon: '🐀', dropRate: 50, rarity: 'common' as const }], zones: ['Starter Village'], description: 'A common pest.' },
  { id: '2', name: 'Wolf', icon: '🐺', level: 5, isDiscovered: true, killCount: 12, stats: { hp: 35, attack: 8, defence: 4 }, drops: [{ name: 'Wolf Pelt', icon: '🐺', dropRate: 30, rarity: 'uncommon' as const }], zones: ['Forest Edge', 'Deep Forest'], description: 'A fierce forest predator.' },
  { id: '3', name: 'Goblin', icon: '👺', level: 8, isDiscovered: true, killCount: 7, stats: { hp: 45, attack: 12, defence: 6 }, drops: [{ name: 'Goblin Dagger', icon: '🗡️', dropRate: 15, rarity: 'rare' as const }], zones: ['Deep Forest', 'Cave Entrance'], description: 'A cunning cave dweller.' },
  { id: '4', name: 'Skeleton', icon: '💀', level: 12, isDiscovered: true, killCount: 3, stats: { hp: 60, attack: 18, defence: 8 }, drops: [{ name: 'Bone Shard', icon: '🦴', dropRate: 40, rarity: 'common' as const }], zones: ['Cave Entrance'], description: 'An undead warrior.' },
  { id: '5', name: 'Dragon', icon: '🐲', level: 50, isDiscovered: false, killCount: 0, stats: { hp: 500, attack: 100, defence: 50 }, drops: [{ name: 'Dragon Scale', icon: '🐲', dropRate: 5, rarity: 'legendary' as const }], zones: ['Dragon\'s Lair'], description: '???' },
];

const mockCraftingRecipes = [
  { id: '1', name: 'Iron Sword', icon: '⚔️', resultQuantity: 1, requiredLevel: 10, turnCost: 50, xpReward: 150, materials: [{ name: 'Iron Ingot', icon: '🪙', required: 3, owned: 5 }, { name: 'Leather Strip', icon: '🎗️', required: 1, owned: 2 }], rarity: 'uncommon' as const },
  { id: '2', name: 'Iron Shield', icon: '🛡️', resultQuantity: 1, requiredLevel: 12, turnCost: 60, xpReward: 180, materials: [{ name: 'Iron Ingot', icon: '🪙', required: 4, owned: 5 }, { name: 'Wood Plank', icon: '🪵', required: 2, owned: 1 }], rarity: 'uncommon' as const },
  { id: '3', name: 'Health Potion', icon: '🧪', resultQuantity: 3, requiredLevel: 5, turnCost: 20, xpReward: 50, materials: [{ name: 'Herbs', icon: '🌿', required: 2, owned: 8 }, { name: 'Water Flask', icon: '💧', required: 1, owned: 3 }], rarity: 'common' as const },
];

const mockGatheringNodes = [
  { id: '1', name: 'Copper Vein', icon: '🟤', levelRequired: 1, baseYield: 5, description: 'Basic copper ore deposits.' },
  { id: '2', name: 'Iron Vein', icon: '⬛', levelRequired: 10, baseYield: 4, description: 'Rich iron ore deposits.' },
  { id: '3', name: 'Gold Vein', icon: '🟡', levelRequired: 25, baseYield: 2, description: 'Rare gold ore deposits.' },
];

*/

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
    pvpNotificationCount,
    playbackActive,
    combatPlaybackData,
    combatPlaybackQueue,
    combatPlaybackIndex,
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
    handleForgeUpgrade,
    handleForgeReroll,
    handleDestroyItem,
    handleRepairItem,
    handleUseItem,
    handleEquipItem,
    handleUnequipSlot,
    handleAllocateAttribute,
    handleSetAutoPotionThreshold,
    autoPotionThreshold,
    setAutoPotionThreshold,
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
    handleQuickRest,
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
    tutorialStep, skipTutorial, advanceTutorial,
    loadAll,
  } = useGameController({ isAuthenticated });

  const [achievementCategory, setAchievementCategory] = useState<string | null>(null);
  const chat = useChat({ isAuthenticated, currentZoneId: activeZoneId });

  useEffect(() => {
    if (activeScreen === 'achievements') {
      void loadAchievements();
    }
  }, [activeScreen, loadAchievements]);

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--rpg-background)] flex items-center justify-center">
        <p className="text-[var(--rpg-text-secondary)]">Loading...</p>
      </div>
    );
  }

  const activeGatheringSkillMeta = SKILL_META[activeGatheringSkill];
  const activeCraftingSkillMeta = SKILL_META[activeCraftingSkill];
  const activeGatheringSkillData = skills.find((s) => s.skillType === activeGatheringSkill);
  const activeCraftingSkillData = skills.find((s) => s.skillType === activeCraftingSkill);
  const filteredGatheringNodes = gatheringNodes.filter((n) => n.skillRequired === activeGatheringSkill);
  const filteredCraftingRecipes = craftingRecipes.filter((recipe) => recipe.skillType === activeCraftingSkill);

  const renderScreen = () => {
    switch (activeScreen) {
      case 'home':
        const currentLevelFloorXp = xpForLevel(characterProgression.characterLevel);
        const nextLevelTotalXp = xpForLevel(characterProgression.characterLevel + 1);
        const currentLevelXp = Math.max(0, characterProgression.characterXp - currentLevelFloorXp);
        const requiredLevelXp = Math.max(1, nextLevelTotalXp - currentLevelFloorXp);
        return (
          <Dashboard
            playerData={{
              turns,
              maxTurns: TURN_CONSTANTS.BANK_CAP,
              turnsRegenRate: TURN_CONSTANTS.REGEN_RATE * 60,
              gold: 0,
              currentXP: characterProgression.characterXp,
              nextLevelXP: nextLevelTotalXp,
              currentLevelXp,
              requiredLevelXp,
              currentZone: currentZone?.name ?? 'Unknown',
              currentHp: hpState.currentHp,
              maxHp: hpState.maxHp,
              hpRegenRate: hpState.regenPerSecond,
              isRecovering: hpState.isRecovering,
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
            onQuickRest={handleQuickRest}
            quickRestPercent={quickRestHealPercent}
            busyAction={busyAction}
          />
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
            } : null}
            availableTurns={turns}
            onStartExploration={handleStartExploration}
            activityLog={activityLog}
            isRecovering={hpState.isRecovering}
            recoveryCost={hpState.recoveryCost}
            playbackData={explorationPlaybackData}
            onPlaybackComplete={handleExplorationPlaybackComplete}
            onPlaybackSkip={handlePlaybackSkip}
            onPushLog={pushLog}
            combatSpeedMs={combatLogSpeedMs}
            explorationSpeedMs={explorationSpeedMs}
            defaultTurns={defaultExploreTurns}
            tutorialLocked={tutorialStep === TUTORIAL_STEP_EXPLORE}
          />
        );
      case 'inventory':
        return (
          <Inventory
            items={inventory.map((item) => ({
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
            }))}
            onDrop={handleDestroyItem}
            onSalvage={handleSalvageItem}
            onRepair={handleRepairItem}
            onEquip={handleEquipItem}
            onUnequip={handleUnequipSlot}
            onUse={handleUseItem}
            zoneCraftingLevel={zoneCraftingLevel}
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
            stats={(() => {
              let attack = 0;
              let defence = 0;
              let magicDefence = 0;
              let hp = 0;
              let dodge = 0;
              let accuracy = 0;
              let critChance = 0;
              let critDamage = 0;
              for (const e of equipment) {
                const base = e.item?.template?.baseStats as Record<string, unknown> | undefined;
                const bonus = e.item?.bonusStats ?? undefined;
                if (base) {
                  if (typeof base.attack === 'number') attack += base.attack;
                  if (typeof base.armor === 'number') defence += base.armor;
                  if (typeof base.magicDefence === 'number') magicDefence += base.magicDefence;
                  if (typeof base.health === 'number') hp += base.health;
                  if (typeof base.dodge === 'number') dodge += base.dodge;
                  if (typeof base.accuracy === 'number') accuracy += base.accuracy;
                  if (typeof base.critChance === 'number') critChance += base.critChance;
                  if (typeof base.critDamage === 'number') critDamage += base.critDamage;
                }
                if (bonus) {
                  if (typeof bonus.attack === 'number') attack += bonus.attack;
                  if (typeof bonus.armor === 'number') defence += bonus.armor;
                  if (typeof bonus.magicDefence === 'number') magicDefence += bonus.magicDefence;
                  if (typeof bonus.health === 'number') hp += bonus.health;
                  if (typeof bonus.dodge === 'number') dodge += bonus.dodge;
                  if (typeof bonus.accuracy === 'number') accuracy += bonus.accuracy;
                  if (typeof bonus.critChance === 'number') critChance += bonus.critChance;
                  if (typeof bonus.critDamage === 'number') critDamage += bonus.critDamage;
                }
              }
              return { attack, defence, magicDefence, hp, dodge, accuracy, critChance, critDamage };
            })()}
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
                  efficiency: Math.round(calculateEfficiency(s.dailyXpGained, s.skillType as SkillType) * 100),
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
            playbackActive={playbackActive}
            travelPlaybackData={travelPlaybackData}
            onTravelPlaybackComplete={handleTravelPlaybackComplete}
            onTravelPlaybackSkip={handleTravelPlaybackSkip}
            onPushLog={pushLog}
            activityLog={activityLog}
            combatSpeedMs={combatLogSpeedMs}
            explorationSpeedMs={explorationSpeedMs}
            onTravel={handleTravelToZone}
            onExploreCurrentZone={() => setActiveScreen('explore')}
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
              recoveryCost={hpState.recoveryCost}
              zoneCraftingLevel={zoneCraftingLevel}
              zoneName={zoneCraftingName}
              defaultMaxQuantity={activeCraftingSkill === 'refining' && defaultRefiningMax}
            />
          </div>
        );
      case 'forge':
        return (
          <Forge
            items={inventory
              .filter((item) => ['weapon', 'armor'].includes(item.template.itemType) && item.quantity === 1)
              .map((item) => ({
                id: item.id,
                templateId: item.template.id,
                name: item.template.name,
                imageSrc: itemImageSrc(item.template.name, item.template.itemType),
                rarity: item.rarity,
                type: item.template.itemType,
                equippedSlot: item.equippedSlot,
                baseStats: item.template.baseStats,
                bonusStats: item.bonusStats ?? null,
              }))}
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
          />
        );
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
              efficiency={Math.round(calculateEfficiency(activeGatheringSkillData?.dailyXpGained ?? 0, activeGatheringSkill as SkillType) * 100)}
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
              recoveryCost={hpState.recoveryCost}
            />
          </div>
        );
      case 'combat': {
        const shouldAutoSkipCombat = autoSkipKnownCombat && combatPlaybackData && (() => {
          const mob = bestiaryMobs.find(m => m.id === combatPlaybackData.mobTemplateId);
          if (!mob?.isDiscovered) return false;
          if (combatPlaybackData.mobPrefix) {
            return mob.prefixesEncountered.includes(combatPlaybackData.mobPrefix);
          }
          return true;
        })();
        return (
          <CombatScreen
            hpState={hpState}
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
              ? { current: combatPlaybackIndex + 1, total: combatPlaybackQueue.length }
              : null
            }
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
      case 'settings': {
        const speedLabel = (ms: number) =>
          ms <= 100 ? 'Very Fast' : ms <= 300 ? 'Fast' : ms <= 500 ? 'Normal' : ms <= 700 ? 'Slow' : 'Very Slow';
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[var(--rpg-text-primary)]">Settings</h2>
            <p className="text-[var(--rpg-text-secondary)]">Username: {player?.username}</p>

            {/* Combat */}
            <PixelCard>
              <h3 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-3">Combat</h3>

              <div className="space-y-4">
                <div>
                  <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">Combat Log Speed</p>
                  <div className="flex items-center gap-3">
                    <Slider min={100} max={1000} step={100}
                      value={[combatLogSpeedMs]}
                      onValueChange={(val) => setCombatLogSpeedMs(val[0])}
                      onValueCommit={(val) => handleSetCombatLogSpeed(val[0])}
                    />
                    <span className="text-xs font-mono text-[var(--rpg-text-primary)] w-20 text-right shrink-0">
                      {speedLabel(combatLogSpeedMs)}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-[var(--rpg-text-secondary)]">Auto-Skip Known Combat</p>
                      <p className="text-xs text-[var(--rpg-text-secondary)] opacity-60">Skip playback for mob+prefix combos you&apos;ve killed before</p>
                    </div>
                    <ToggleSwitch checked={autoSkipKnownCombat} onChange={handleSetAutoSkipKnownCombat} />
                  </div>
                </div>

                <div>
                  <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">Auto-Potion Threshold</p>
                  <p className="text-xs text-[var(--rpg-text-secondary)] opacity-60 mb-2">
                    Drink a health potion when HP drops below this threshold during combat.
                  </p>
                  <div className="flex items-center gap-3">
                    <Slider min={0} max={100} step={5}
                      value={[autoPotionThreshold]}
                      onValueChange={(val) => setAutoPotionThreshold(val[0])}
                      onValueCommit={(val) => handleSetAutoPotionThreshold(val[0])}
                    />
                    <span className="text-sm font-mono text-[var(--rpg-text-primary)] w-16 text-right shrink-0">
                      {autoPotionThreshold === 0 ? 'Off' : `${autoPotionThreshold}%`}
                    </span>
                  </div>
                </div>
              </div>
            </PixelCard>

            {/* Exploration */}
            <PixelCard>
              <h3 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-3">Exploration</h3>

              <div className="space-y-4">
                <div>
                  <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">Exploration Playback Speed</p>
                  <div className="flex items-center gap-3">
                    <Slider min={100} max={1000} step={100}
                      value={[explorationSpeedMs]}
                      onValueChange={(val) => setExplorationSpeedMs(val[0])}
                      onValueCommit={(val) => handleSetExplorationSpeed(val[0])}
                    />
                    <span className="text-xs font-mono text-[var(--rpg-text-primary)] w-20 text-right shrink-0">
                      {speedLabel(explorationSpeedMs)}
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">Default Explore Turns</p>
                  <div className="flex items-center gap-3">
                    <Slider min={10} max={10000} step={10}
                      value={[defaultExploreTurns]}
                      onValueChange={(val) => setDefaultExploreTurns(val[0])}
                      onValueCommit={(val) => handleSetDefaultExploreTurns(val[0])}
                    />
                    <span className="text-sm font-mono text-[var(--rpg-text-primary)] w-16 text-right shrink-0">
                      {defaultExploreTurns.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </PixelCard>

            {/* Recovery */}
            <PixelCard>
              <h3 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-3">Recovery</h3>
              <p className="text-xs text-[var(--rpg-text-secondary)] mb-2">Quick-Rest Heal Target</p>
              <p className="text-xs text-[var(--rpg-text-secondary)] opacity-60 mb-2">
                Used by the Quick Rest button on the dashboard.
              </p>
              <div className="flex gap-2">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => handleSetQuickRestHealPercent(pct)}
                    className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${
                      quickRestHealPercent === pct
                        ? 'bg-[var(--rpg-green-light)] text-black'
                        : 'bg-[var(--rpg-background)] text-[var(--rpg-text-secondary)] hover:bg-[var(--rpg-border)]'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </PixelCard>

            {/* Crafting */}
            <PixelCard>
              <h3 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-3">Crafting</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[var(--rpg-text-secondary)]">Default Refining to Max</p>
                  <p className="text-xs text-[var(--rpg-text-secondary)] opacity-60">Auto-set refining quantity to maximum when selecting a recipe</p>
                </div>
                <ToggleSwitch checked={defaultRefiningMax} onChange={handleSetDefaultRefiningMax} />
              </div>
            </PixelCard>

            {/* Account */}
            <button
              onClick={() => { logout(); router.push('/'); }}
              className="w-full px-4 py-2 bg-[var(--rpg-red)] rounded text-white"
            >
              Logout
            </button>
          </div>
        );
      }
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
      case 'leaderboard':
        return <Leaderboard playerId={player?.id ?? null} />;
      case 'admin':
        return <AdminScreen onAction={loadAll} />;
      default:
        return null;
    }
  };

  return (
    <>
      <AppShell turns={turns} username={player?.username}>
        {/* Broken gear warning banner */}
        {equipment.some((e) => {
          if (!e.item) return false;
          const cur = e.item.currentDurability ?? e.item.template?.maxDurability ?? 1;
          return cur <= 0;
        }) && (
          <div className="mb-3 p-2 rounded-lg bg-[var(--rpg-red)]/10 border border-[var(--rpg-red)] text-[var(--rpg-red)] text-sm text-center">
            You have broken equipment! Broken gear provides no stats. Visit your inventory to repair.
          </div>
        )}

        <TutorialBanner
          tutorialStep={tutorialStep}
          onSkip={skipTutorial}
        />

        {/* Sub-navigation for screens */}
        {getActiveTab() === 'home' && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            {[
              { id: 'home', label: 'Dashboard', badge: 0 },
              { id: 'zones', label: 'Map', badge: 0 },
              { id: 'worldEvents', label: 'Events', badge: 0 },
              { id: 'achievements', label: 'Achievements', badge: achievementUnclaimedCount },
              { id: 'leaderboard', label: 'Rankings', badge: 0 },
              { id: 'bestiary', label: 'Bestiary', badge: 0 },
              { id: 'skills', label: 'Skills', badge: 0 },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveScreen(tab.id as Screen)}
                className={`relative px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  activeScreen === tab.id
                    ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                    : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
                }`}
              >
                {tab.label}
                {tab.badge > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-[var(--rpg-red)] text-white font-bold">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
            {player?.role === 'admin' && (
              <button
                onClick={() => setActiveScreen('admin')}
                className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  activeScreen === 'admin'
                    ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                    : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
                }`}
              >
                Admin
              </button>
            )}
          </div>
        )}

        {getActiveTab() === 'explore' && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            {[
              { id: 'explore', label: 'Explore' },
              { id: 'gathering', label: 'Gathering' },
              { id: 'crafting', label: 'Crafting' },
              { id: 'forge', label: 'Forge' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveScreen(tab.id as Screen)}
                className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  activeScreen === tab.id
                    ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                    : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {getActiveTab() === 'inventory' && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            {[
              { id: 'inventory', label: 'Items' },
              { id: 'equipment', label: 'Equipment' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveScreen(tab.id as Screen)}
                className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  activeScreen === tab.id
                    ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                    : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {getActiveTab() === 'combat' && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            {[
              { id: 'combat', label: 'Combat', badge: 0 },
              { id: 'arena', label: 'Arena', badge: pvpNotificationCount },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveScreen(tab.id as Screen)}
                className={`relative px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  activeScreen === tab.id
                    ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                    : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
                }`}
              >
                {tab.label}
                {tab.badge > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-[var(--rpg-red)] text-white font-bold">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {actionError && (
          <div className="mb-4 p-3 rounded bg-[var(--rpg-background)] border border-[var(--rpg-red)] text-[var(--rpg-red)]">
            {actionError}
          </div>
        )}

        {renderScreen()}
      </AppShell>
      <ChatPanel
        isOpen={chat.isOpen}
        toggleChat={chat.toggleChat}
        activeChannel={chat.activeChannel}
        setActiveChannel={chat.setActiveChannel}
        worldMessages={chat.worldMessages}
        zoneMessages={chat.zoneMessages}
        presence={chat.presence}
        unreadWorld={chat.unreadWorld}
        unreadZone={chat.unreadZone}
        sendMessage={chat.sendMessage}
        rateLimitError={chat.rateLimitError}
        currentZoneId={activeZoneId}
        currentZoneName={currentZone?.name ?? null}
        playerId={player?.id ?? null}
        pinnedMessage={chat.activeChannel === 'world' ? chat.pinnedWorld : chat.pinnedZone}
      />
      <BottomNav
        activeTab={getActiveTab()}
        onNavigate={handleNavigate}
        badgeTabs={achievementUnclaimedCount > 0 ? new Set(['home']) : undefined}
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
    </>
  );
}

