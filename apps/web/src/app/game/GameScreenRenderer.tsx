'use client';

import React from 'react';
import {
  ArenaScreenRenderer,
  BestiaryScreenRenderer,
  CombatScreenRenderer,
  ExploreScreenRenderer,
  HomeScreenRenderer,
  RestScreenRenderer,
  VexScreenRenderer,
  WorldEventsScreenRenderer,
  ZonesScreenRenderer,
} from './renderers/coreScreenRenderers';
import {
  EquipmentScreenRenderer,
  InventoryScreenRenderer,
  SkillsScreenRenderer,
  TalentTreeScreenRenderer,
  TrainingScreenRenderer,
} from './renderers/characterScreenRenderers';
import {
  CraftingScreenRenderer,
  ForgeScreenRenderer,
  GatheringScreenRenderer,
} from './renderers/professionScreenRenderers';
import {
  AchievementsScreenRenderer,
  AdminScreenRenderer,
  CasinoScreenRenderer,
  FriendsScreenRenderer,
  GuildScreenRenderer,
  LeaderboardScreenRenderer,
  MailScreenRenderer,
  QuestsScreenRenderer,
  SettingsScreenRenderer,
  TemplatesScreenRenderer,
} from './renderers/socialScreenRenderers';
import type { GameScreenRendererProps } from './renderers/gameScreenRenderer.types';

export function GameScreenRenderer({
  gc,
  player,
  seasonArchives,
  realmLabel,
  realmEndsAt,
  activePlayerId,
  characters,
  switchingPlayerId,
  onSwitchPlayer,
  casinoSocket,
  achievementCategory,
  setAchievementCategory,
  setExpeditionContext,
  mailRecipient,
  setMailRecipient,
  deepLinkTab,
  pushState,
  pushToggle,
  onGuildMembershipChange,
  onLogout,
  onReportBug,
  onAccountRefresh,
  onForceRelogin,
}: GameScreenRendererProps) {
  switch (gc.activeScreen) {
    case 'home':
      return <HomeScreenRenderer gc={gc} player={player} />;
    case 'explore':
      return <ExploreScreenRenderer gc={gc} />;
    case 'inventory':
      return <InventoryScreenRenderer gc={gc} currentZoneType={gc.currentZone?.zoneType} />;
    case 'equipment':
      return <EquipmentScreenRenderer gc={gc} />;
    case 'skills':
      return <SkillsScreenRenderer gc={gc} />;
    case 'zones':
      return <ZonesScreenRenderer gc={gc} />;
    case 'bestiary':
      return <BestiaryScreenRenderer gc={gc} />;
    case 'crafting':
      return <CraftingScreenRenderer gc={gc} />;
    case 'forge':
      return <ForgeScreenRenderer gc={gc} />;
    case 'gathering':
      return <GatheringScreenRenderer gc={gc} />;
    case 'combat':
      return <CombatScreenRenderer gc={gc} player={player} />;
    case 'arena':
      return <ArenaScreenRenderer gc={gc} player={player} />;
    case 'rest':
      return <RestScreenRenderer gc={gc} />;
    case 'settings':
      return (
        <SettingsScreenRenderer
          gc={gc}
          player={player}
          seasonArchives={seasonArchives}
          realmLabel={realmLabel}
          realmEndsAt={realmEndsAt}
          activePlayerId={activePlayerId}
          characters={characters}
          switchingPlayerId={switchingPlayerId}
          onSwitchPlayer={onSwitchPlayer}
          pushState={pushState}
          pushToggle={pushToggle}
          onLogout={onLogout}
          onReportBug={onReportBug}
          onAccountRefresh={onAccountRefresh}
          onForceRelogin={onForceRelogin}
        />
      );
    case 'worldEvents':
      return <WorldEventsScreenRenderer gc={gc} player={player} />;
    case 'vex':
      return <VexScreenRenderer gc={gc} />;
    case 'achievements':
      return (
        <AchievementsScreenRenderer
          gc={gc}
          achievementCategory={achievementCategory}
          setAchievementCategory={setAchievementCategory}
        />
      );
    case 'quests':
      return <QuestsScreenRenderer gc={gc} />;
    case 'leaderboard':
      return <LeaderboardScreenRenderer player={player} />;
    case 'guild':
      return (
        <GuildScreenRenderer
          gc={gc}
          player={player}
          deepLinkTab={deepLinkTab}
          setExpeditionContext={setExpeditionContext}
          onGuildMembershipChange={onGuildMembershipChange}
        />
      );
    case 'friends':
      return (
        <FriendsScreenRenderer
          gc={gc}
          player={player}
          setMailRecipient={setMailRecipient}
        />
      );
    case 'mail':
      return <MailScreenRenderer gc={gc} player={player} mailRecipient={mailRecipient} />;
    case 'templates':
      return <TemplatesScreenRenderer gc={gc} />;
    case 'talentTree':
      return <TalentTreeScreenRenderer gc={gc} />;
    case 'casino':
      return <CasinoScreenRenderer gc={gc} player={player} casinoSocket={casinoSocket} />;
    case 'training':
      return <TrainingScreenRenderer gc={gc} currentZoneType={gc.currentZone?.zoneType} />;
    case 'admin':
      return <AdminScreenRenderer gc={gc} />;
    default:
      return null;
  }
}
