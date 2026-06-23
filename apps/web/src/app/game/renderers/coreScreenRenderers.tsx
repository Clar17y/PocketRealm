'use client';

import React, { useMemo } from 'react';
import type { Sword } from 'lucide-react';
import { PixelButton } from '@/components/PixelButton';
import { PixelCard } from '@/components/PixelCard';
import { Dashboard } from '@/components/screens/Dashboard';
import { Exploration } from '@/components/screens/Exploration';
import { ZoneMap } from '@/components/screens/ZoneMap';
import { Bestiary } from '@/components/screens/Bestiary';
import { Rest } from '@/components/screens/Rest';
import { VexScreen } from '@/components/screens/VexScreen';
import { WorldEvents } from '@/components/screens/WorldEvents';
import { PREMIUM_CONSTANTS, TURN_CONSTANTS, type SkillType } from '@pocketrealm/shared';
import { calculateEfficiency, xpForLevel } from '@pocketrealm/game-engine';
import { itemImageSrc, monsterImageSrc, skillIconSrc, zoneImageSrc } from '@/lib/assets';
import { titleCaseFromSnake } from '@/lib/format';
import { hasActivePremium } from '@/lib/premium';
import { TUTORIAL_STEP_EXPLORE } from '@/lib/tutorial';
import { isMobKnown } from '../combatHelpers';
import type { Screen } from '../gameController.types';
import { CombatScreen } from '../screens/CombatScreen';
import { ArenaScreen } from '../screens/ArenaScreen';
import { SKILL_META } from '../pageConstants';
import type { GameControllerState, GameScreenPlayer } from './gameScreenRenderer.types';

interface SharedCoreRendererProps {
  gc: GameControllerState;
  player: GameScreenPlayer | null;
}

function useCombatPlaybackMeta(gc: GameControllerState) {
  const bestiaryMobsForPlayback = useMemo(
    () => gc.bestiaryMobs.map((mob) => ({
      id: mob.id,
      isDiscovered: mob.isDiscovered,
      prefixesEncountered: mob.prefixesEncountered,
    })),
    [gc.bestiaryMobs]
  );

  const primaryCombatXpRate = useMemo(() => {
    const mainHand = gc.equipment.find((entry) => entry.slot === 'main_hand');
    const requiredSkill = mainHand?.item?.template?.requiredSkill;
    const attackSkill: 'melee' | 'ranged' | 'magic' =
      requiredSkill === 'melee' || requiredSkill === 'ranged' || requiredSkill === 'magic'
        ? requiredSkill
        : 'melee';
    const skillData = gc.skills.find((skill) => skill.skillType === attackSkill);
    const rate = skillData
      ? Math.round(calculateEfficiency(skillData.dailyXpGained, attackSkill as SkillType) * 100)
      : 100;

    return {
      skillName: attackSkill.charAt(0).toUpperCase() + attackSkill.slice(1),
      rate,
    };
  }, [gc.skills, gc.equipment]);

  return { bestiaryMobsForPlayback, primaryCombatXpRate };
}

export function HomeScreenRenderer({ gc, player }: SharedCoreRendererProps) {
  const hasActivePremiumTurns = hasActivePremium(player);
  const displayedTurnCap = hasActivePremiumTurns ? PREMIUM_CONSTANTS.TURN_BANK_CAP : TURN_CONSTANTS.BANK_CAP;
  const displayedTurnRegenRate = hasActivePremiumTurns ? PREMIUM_CONSTANTS.TURN_REGEN_RATE : TURN_CONSTANTS.REGEN_RATE;
  const currentLevelFloorXp = xpForLevel(gc.characterProgression.characterLevel);
  const nextLevelTotalXp = xpForLevel(gc.characterProgression.characterLevel + 1);
  const currentLevelXp = Math.max(0, gc.characterProgression.characterXp - currentLevelFloorXp);
  const requiredLevelXp = Math.max(1, nextLevelTotalXp - currentLevelFloorXp);

  return (
    <Dashboard
      playerData={{
        turns: gc.turns,
        maxTurns: displayedTurnCap,
        turnsRegenRate: displayedTurnRegenRate * 60,
        gold: gc.gold,
        currentXP: gc.characterProgression.characterXp,
        nextLevelXP: nextLevelTotalXp,
        currentLevelXp,
        requiredLevelXp,
        currentZone: gc.currentZone?.name ?? 'Unknown',
        isRecovering: gc.hpState.isRecovering,
        isOverEncumbered: gc.isOverEncumbered,
        recoveryCost: gc.hpState.recoveryCost,
        isActivityLocked: gc.isActivityLocked,
        activityLockReason: gc.activityLockReason,
      }}
      characterProgression={gc.characterProgression}
      skills={gc.skills
        .map((skill) => {
          const meta = SKILL_META[skill.skillType];
          if (!meta) {
            return null;
          }
          return {
            name: meta.name,
            level: skill.level,
            icon: meta.icon,
            imageSrc: skillIconSrc(skill.skillType),
          };
        })
        .filter(Boolean) as Array<{ name: string; level: number; icon: typeof Sword; imageSrc: string }>}
      onNavigate={gc.handleNavigate}
      activityLog={gc.activityLog}
      onAllocateAttribute={gc.handleAllocateAttribute}
    />
  );
}

export function ExploreScreenRenderer({ gc }: { gc: GameControllerState }) {
  const { bestiaryMobsForPlayback, primaryCombatXpRate } = useCombatPlaybackMeta(gc);

  if (gc.currentZone?.zoneType === 'town' && !gc.explorationPlaybackData) {
    return (
      <PixelCard>
        <div className="text-center py-8">
          <h2 className="text-xl font-bold text-[var(--rpg-text-primary)] mb-2">
            {gc.currentZone.name}
          </h2>
          <p className="text-sm text-[var(--rpg-text-secondary)] mb-4">
            This is a peaceful town. Use the World Map to travel to a wild zone for exploration.
          </p>
          <PixelButton variant="gold" onClick={() => gc.setActiveScreen('zones')}>
            Open World Map
          </PixelButton>
        </div>
      </PixelCard>
    );
  }

  return (
    <Exploration
      currentZone={{
        name: gc.currentZone?.name ?? 'Unknown',
        description: gc.currentZone?.description ?? 'Select a zone from Map.',
        minLevel: Math.max(1, (gc.currentZone?.difficulty ?? 1) * 5),
        imageSrc: gc.currentZone?.name && gc.currentZone.name !== '???' ? zoneImageSrc(gc.currentZone.name) : undefined,
      }}
      explorationProgress={gc.currentZone?.exploration ? {
        turnsExplored: gc.currentZone.exploration.turnsExplored,
        turnsToExplore: gc.currentZone.exploration.turnsToExplore,
        percent: gc.currentZone.exploration.percent,
        tiers: gc.currentZone.exploration.tiers,
      } : null}
      trackableMobFamilies={gc.currentZone?.trackableMobFamilies ?? []}
      prospectableResourceNodes={gc.currentZone?.prospectableResourceNodes ?? []}
      skills={gc.skills}
      availableTurns={gc.turns}
      onStartExploration={gc.handleStartExploration}
      activityLog={gc.activityLog}
      isRecovering={gc.hpState.isRecovering}
      isOverEncumbered={gc.isOverEncumbered}
      isActivityLocked={gc.isActivityLocked}
      activityLockReason={gc.activityLockReason}
      recoveryCost={gc.hpState.recoveryCost}
      currentHp={gc.hpState.currentHp}
      maxHp={gc.hpState.maxHp}
      currentStamina={gc.staminaState.current}
      maxStamina={gc.staminaState.max}
      currentMana={gc.manaState.current}
      maxMana={gc.manaState.max}
      regenPerSecond={gc.hpState.regenPerSecond}
      staminaRegenPerSecond={gc.staminaState.regenPerSecond}
      manaRegenPerSecond={gc.manaState.regenPerSecond}
      playbackData={gc.explorationPlaybackData}
      onPlaybackComplete={gc.handleExplorationPlaybackComplete}
      onPlaybackSkip={gc.handlePlaybackSkip}
      onPushLog={gc.pushLog}
      combatSpeedMs={gc.combatLogSpeedMs}
      explorationSpeedMs={gc.explorationSpeedMs}
      autoSkipKnownCombat={gc.autoSkipKnownCombat}
      bestiaryMobs={bestiaryMobsForPlayback}
      defaultTurns={gc.defaultExploreTurns}
      tutorialLocked={gc.tutorialStep === TUTORIAL_STEP_EXPLORE}
      lowHpWarning={gc.lowHpWarning}
      onQuickRest={gc.handleQuickRest}
      quickRestPercent={gc.quickRestHealPercent}
      busyAction={gc.busyAction}
      isOffline={gc.isOffline}
      onNavigateToRest={() => gc.handleNavigate('rest')}
      guildTaxRate={gc.guildTaxRate}
      combatLogPrefetch={gc.combatLogPrefetch}
      combatXpRate={primaryCombatXpRate}
    />
  );
}

export function ZonesScreenRenderer({ gc }: { gc: GameControllerState }) {
  const { bestiaryMobsForPlayback } = useCombatPlaybackMeta(gc);

  return (
    <ZoneMap
      zones={gc.zones.map((zone) => ({
        id: zone.id,
        name: zone.name,
        description: zone.description,
        difficulty: zone.difficulty,
        travelCost: zone.travelCost,
        discovered: zone.discovered ?? true,
        zoneType: zone.zoneType ?? 'wild',
        imageSrc: zone.discovered && zone.name !== '???' ? zoneImageSrc(zone.name) : undefined,
        exploration: zone.exploration ?? null,
        arrivalText: zone.arrivalText ?? null,
        ambientTexts: zone.ambientTexts ?? null,
      }))}
      connections={gc.zoneConnections}
      currentZoneId={gc.activeZoneId ?? ''}
      availableTurns={gc.turns}
      isRecovering={gc.hpState.isRecovering}
      isOverEncumbered={gc.isOverEncumbered}
      isActivityLocked={gc.isActivityLocked}
      activityLockReason={gc.activityLockReason}
      playbackActive={gc.playbackActive}
      travelPlaybackData={gc.travelPlaybackData}
      onTravelPlaybackComplete={gc.handleTravelPlaybackComplete}
      onTravelPlaybackSkip={gc.handleTravelPlaybackSkip}
      onPushLog={gc.pushLog}
      activityLog={gc.activityLog}
      combatSpeedMs={gc.combatLogSpeedMs}
      explorationSpeedMs={gc.explorationSpeedMs}
      autoSkipKnownCombat={gc.autoSkipKnownCombat}
      bestiaryMobs={bestiaryMobsForPlayback}
      onTravel={gc.handleTravelToZone}
      onExploreCurrentZone={() => gc.setActiveScreen('explore')}
      guildTaxRate={gc.guildTaxRate}
      undiscoveredZones={gc.undiscoveredZones}
      combatLogPrefetch={gc.combatLogPrefetch}
      playerStartStamina={gc.staminaState.current}
      playerStartMana={gc.manaState.current}
      playerMaxStamina={gc.staminaState.max}
      playerMaxMana={gc.manaState.max}
      homeTownId={gc.homeTownId}
      onSetHomeTown={(zoneId) => void gc.handleSetHomeTown(zoneId)}
      showNpcDialogue={gc.showNpcDialogue}
      isInTown={gc.currentZone?.zoneType === 'town'}
    />
  );
}

export function BestiaryScreenRenderer({ gc }: { gc: GameControllerState }) {
  if (gc.bestiaryLoading) {
    return <div className="text-[var(--rpg-text-secondary)]">Loading bestiary...</div>;
  }

  if (gc.bestiaryError) {
    return (
      <div className="p-3 rounded bg-[var(--rpg-background)] border border-[var(--rpg-red)] text-[var(--rpg-red)]">
        {gc.bestiaryError}
      </div>
    );
  }

  return (
    <Bestiary
      monsters={gc.bestiaryMobs.map((mob) => ({
        id: mob.id,
        name: mob.name,
        imageSrc: mob.isDiscovered ? monsterImageSrc(mob.name) : undefined,
        level: mob.level,
        isDiscovered: mob.isDiscovered,
        killCount: mob.killCount,
        stats: mob.stats,
        zones: mob.zones,
        description: mob.description,
        flavorAppearance: mob.flavorAppearance,
        flavorBehavior: mob.flavorBehavior,
        flavorLore: mob.flavorLore,
        prefixesEncountered: mob.prefixesEncountered,
        explorationTier: mob.explorationTier,
        tierLocked: mob.tierLocked,
        bossRotation: mob.bossRotation,
        drops: mob.drops.map((drop) => ({
          name: drop.item.name,
          imageSrc: itemImageSrc(drop.item.name, drop.item.itemType),
          dropRate: drop.dropRate,
          rarity: drop.rarity,
        })),
      }))}
      prefixSummary={gc.bestiaryPrefixSummary}
      expeditionThemes={gc.expeditionThemes}
      worldBosses={gc.worldBosses}
      showBestiaryLore={gc.showBestiaryLore}
    />
  );
}

export function CombatScreenRenderer({ gc, player }: SharedCoreRendererProps) {
  const { primaryCombatXpRate } = useCombatPlaybackMeta(gc);
  const shouldAutoSkipCombat = gc.autoSkipKnownCombat
    && gc.combatPlaybackData
    && isMobKnown(gc.combatPlaybackData.mobTemplateId, gc.combatPlaybackData.mobPrefix, gc.bestiaryMobs);

  return (
    <CombatScreen
      hpState={gc.hpState}
      isOverEncumbered={gc.isOverEncumbered}
      isActivityLocked={gc.isActivityLocked}
      activityLockReason={gc.activityLockReason}
      currentTurns={gc.turns}
      currentZoneId={gc.activeZoneId}
      pendingEncounters={gc.pendingEncounters}
      pendingEncountersLoading={gc.pendingEncountersLoading}
      pendingEncountersError={gc.pendingEncountersError}
      pendingEncounterPage={gc.pendingEncounterPage}
      pendingEncounterPagination={gc.pendingEncounterPagination}
      pendingEncounterFilters={gc.pendingEncounterFilters}
      pendingEncounterZoneFilter={gc.pendingEncounterZoneFilter}
      pendingEncounterMobFilter={gc.pendingEncounterMobFilter}
      pendingEncounterSort={gc.pendingEncounterSort}
      pendingClockMs={gc.pendingClockMs}
      busyAction={gc.busyAction}
      isOffline={gc.isOffline}
      lastCombat={gc.lastCombat}
      bestiaryMobs={gc.bestiaryMobs.map((mob) => ({ id: mob.id, isDiscovered: mob.isDiscovered }))}
      templates={gc.templates}
      onActivateTemplate={gc.handleTemplateSaved}
      onStateUpdates={(updates) => void gc.handleStateUpdates(updates)}
      updateQuestProgress={gc.updateQuestProgress}
      refreshPendingEncounters={gc.refreshPendingEncounters}
      activatePendingLoot={gc.activatePendingLoot}
      setError={gc.setActionError}
      onPendingEncounterPageChange={gc.handlePendingEncounterPageChange}
      onPendingEncounterZoneFilterChange={gc.handlePendingEncounterZoneFilterChange}
      onPendingEncounterMobFilterChange={gc.handlePendingEncounterMobFilterChange}
      onPendingEncounterSortChange={gc.handlePendingEncounterSortChange}
      combatPlaybackData={gc.combatPlaybackData}
      combatSpeedMs={gc.combatLogSpeedMs}
      autoSkipCombat={Boolean(shouldAutoSkipCombat)}
      onCombatPlaybackComplete={gc.handleCombatPlaybackComplete}
      fightProgress={gc.combatPlaybackQueue && gc.combatPlaybackQueue.length > 1
        ? {
            current: gc.combatPlaybackIndex + 1,
            total: gc.combatPlaybackQueue.length,
            room: gc.combatPlaybackQueue[gc.combatPlaybackIndex]?.room,
          }
        : null}
      roomTransition={gc.roomTransition}
      lowHpWarning={gc.lowHpWarning}
      onQuickRest={gc.handleQuickRest}
      quickRestPercent={gc.quickRestHealPercent}
      onNavigateToRest={() => gc.handleNavigate('rest')}
      combatXpRate={primaryCombatXpRate}
      staminaState={gc.staminaState}
      manaState={gc.manaState}
      advanceTutorial={gc.advanceTutorial}
      activeEncounterSiteId={gc.activeEncounterSiteId}
      onActiveEncounterSiteIdChange={gc.setActiveEncounterSiteId}
    />
  );
}

export function ArenaScreenRenderer({ gc, player }: SharedCoreRendererProps) {
  return (
    <ArenaScreen
      characterLevel={gc.characterProgression.characterLevel}
      busyAction={gc.busyAction}
      isOffline={gc.isOffline}
      currentTurns={gc.turns}
      playerId={player?.id ?? null}
      isInTown={gc.currentZone?.zoneType === 'town'}
      onStateUpdates={(updates) => void gc.handleStateUpdates(updates)}
      onNotificationsChanged={() => void gc.loadPvpNotificationCount()}
      onNavigate={(screen) => gc.setActiveScreen(screen as Screen)}
      combatSpeedMs={gc.combatLogSpeedMs}
    />
  );
}

export function RestScreenRenderer({ gc }: { gc: GameControllerState }) {
  return (
    <Rest
      onComplete={() => gc.setActiveScreen('home')}
      onTurnsUpdate={gc.setTurns}
      onHpUpdate={gc.setHpState}
      availableTurns={gc.turns}
    />
  );
}

export function WorldEventsScreenRenderer({ gc, player }: SharedCoreRendererProps) {
  return (
    <WorldEvents
      currentZoneId={gc.activeZoneId}
      currentZoneName={gc.currentZone?.name ?? null}
      playerId={player?.id ?? null}
      onNavigate={gc.handleNavigate}
    />
  );
}

export function VexScreenRenderer({ gc }: { gc: GameControllerState }) {
  return (
    <VexScreen
      onStateUpdates={(updates) => void gc.handleStateUpdates(updates)}
      showNpcDialogue={gc.showNpcDialogue}
    />
  );
}
