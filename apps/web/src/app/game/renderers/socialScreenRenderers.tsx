'use client';

import React from 'react';
import { Achievements } from '@/components/screens/Achievements';
import AdminScreen from '@/components/screens/AdminScreen';
import { Casino } from '@/components/screens/Casino';
import { FriendsScreen } from '@/components/screens/FriendsScreen';
import { GuildScreen } from '@/components/screens/GuildScreen';
import { Leaderboard } from '@/components/screens/Leaderboard';
import { MailScreen } from '@/components/screens/MailScreen';
import { Quests } from '@/components/screens/Quests';
import { Settings } from '@/components/screens/Settings';
import { Templates } from '@/components/screens/Templates';
import { applyStateUpdates } from '../applyStateUpdates';
import type { GameControllerState, GameScreenPlayer, GameScreenRendererProps, MailRecipient } from './gameScreenRenderer.types';

export function SettingsScreenRenderer({
  gc,
  player,
  pushState,
  pushToggle,
  onLogout,
  onAccountRefresh,
  onForceRelogin,
}: {
  gc: GameControllerState;
  player: GameScreenPlayer | null;
  pushState: GameScreenRendererProps['pushState'];
  pushToggle: GameScreenRendererProps['pushToggle'];
  onLogout: () => void;
  onAccountRefresh: () => Promise<void>;
  onForceRelogin: () => void;
}) {
  return (
    <Settings
      username={player?.username}
      email={player?.email ?? ''}
      emailVerified={player?.emailVerified ?? false}
      isPremium={player?.isPremium ?? false}
      premiumExpiresAt={player?.premiumExpiresAt ?? null}
      combatLogSpeedMs={gc.combatLogSpeedMs}
      onCombatLogSpeedChange={gc.setCombatLogSpeedMs}
      onCombatLogSpeedCommit={gc.handleSetCombatLogSpeed}
      autoSkipKnownCombat={gc.autoSkipKnownCombat}
      onAutoSkipKnownCombatChange={gc.handleSetAutoSkipKnownCombat}
      lowHpWarning={gc.lowHpWarning}
      onLowHpWarningChange={gc.handleSetLowHpWarning}
      explorationSpeedMs={gc.explorationSpeedMs}
      onExplorationSpeedChange={gc.setExplorationSpeedMs}
      onExplorationSpeedCommit={gc.handleSetExplorationSpeed}
      defaultExploreTurns={gc.defaultExploreTurns}
      onDefaultExploreTurnsChange={gc.setDefaultExploreTurns}
      onDefaultExploreTurnsCommit={gc.handleSetDefaultExploreTurns}
      quickRestHealPercent={gc.quickRestHealPercent}
      onQuickRestHealPercentChange={gc.handleSetQuickRestHealPercent}
      defaultRefiningMax={gc.defaultRefiningMax}
      onDefaultRefiningMaxChange={gc.handleSetDefaultRefiningMax}
      confirmRarity={gc.confirmRarity}
      onConfirmRarityChange={gc.handleSetConfirmRarity}
      lootRevealRarity={gc.lootRevealRarity}
      onLootRevealRarityChange={gc.handleSetLootRevealRarity}
      forgeConfirmRarity={gc.forgeConfirmRarity}
      onForgeConfirmRarityChange={gc.handleSetForgeConfirmRarity}
      showNpcDialogue={gc.showNpcDialogue}
      onShowNpcDialogueChange={gc.handleSetShowNpcDialogue}
      showItemFlavourText={gc.showItemFlavourText}
      onShowItemFlavourTextChange={gc.handleSetShowItemFlavourText}
      showBestiaryLore={gc.showBestiaryLore}
      onShowBestiaryLoreChange={gc.handleSetShowBestiaryLore}
      pushState={pushState}
      onPushToggle={pushToggle}
      notificationPrefs={gc.notificationPrefs}
      onNotificationPrefChange={gc.handleSetNotificationPref}
      onAccountRefresh={onAccountRefresh}
      onForceRelogin={onForceRelogin}
      onLogout={onLogout}
    />
  );
}

export function AchievementsScreenRenderer({
  gc,
  achievementCategory,
  setAchievementCategory,
}: {
  gc: GameControllerState;
  achievementCategory: string | null;
  setAchievementCategory: (category: string | null) => void;
}) {
  return (
    <Achievements
      achievements={gc.achievementData?.achievements ?? []}
      unclaimedCount={gc.achievementUnclaimedCount}
      activeTitle={gc.activeTitle}
      onClaim={gc.handleClaimAchievement}
      onSetTitle={gc.handleSetActiveTitle}
      initialCategory={achievementCategory}
      onCategoryViewed={() => setAchievementCategory(null)}
    />
  );
}

export function QuestsScreenRenderer({ gc }: { gc: GameControllerState }) {
  return (
    <Quests
      quests={gc.quests}
      questState={gc.questState}
      loading={gc.questsLoading}
      error={gc.questsError}
      onClaimReward={gc.handleClaimQuestReward}
      onClaimBonus={gc.handleClaimDailyBonus}
      onReroll={gc.handleRerollQuest}
      onShopPurchase={(updates) => {
        if (updates) {
          applyStateUpdates(updates, gc.stateSetters);
        }
        gc.loadAll();
      }}
      zones={gc.zones.filter((zone) => zone.discovered).map((zone) => ({
        id: zone.id,
        name: zone.name,
        zoneType: zone.zoneType,
      }))}
      homeTownId={gc.homeTownId}
      showNpcDialogue={gc.showNpcDialogue}
    />
  );
}

export function GuildScreenRenderer({
  gc,
  player,
  deepLinkTab,
  setExpeditionContext,
}: {
  gc: GameControllerState;
  player: GameScreenPlayer | null;
  deepLinkTab: string | null;
  setExpeditionContext: (context: GameScreenRendererProps['expeditionContext']) => void;
}) {
  return (
    <GuildScreen
      playerId={player?.id ?? null}
      characterLevel={gc.characterProgression.characterLevel}
      initialTab={gc.activeScreen === 'guild' && deepLinkTab ? deepLinkTab as 'expeditions' : undefined}
      onStateUpdates={(updates) => applyStateUpdates(updates, gc.stateSetters)}
      onExpeditionContextChange={setExpeditionContext}
      showNpcDialogue={gc.showNpcDialogue}
    />
  );
}

export function FriendsScreenRenderer({
  gc,
  player,
  setMailRecipient,
}: {
  gc: GameControllerState;
  player: GameScreenPlayer | null;
  setMailRecipient: (recipient: MailRecipient | null) => void;
}) {
  return (
    <FriendsScreen
      playerId={player?.id ?? null}
      onStateUpdates={(updates) => applyStateUpdates(updates, gc.stateSetters)}
      onFriendCountsChanged={() => void gc.loadFriendCounts()}
      combatSpeedMs={gc.combatLogSpeedMs}
      onNavigateToMail={(recipientId, recipientName) => {
        setMailRecipient({ id: recipientId, name: recipientName });
        gc.setActiveScreen('mail');
      }}
    />
  );
}

export function MailScreenRenderer({
  gc,
  player,
  mailRecipient,
}: {
  gc: GameControllerState;
  player: GameScreenPlayer | null;
  mailRecipient: MailRecipient | null;
}) {
  return (
    <MailScreen
      playerId={player?.id ?? null}
      onMailCountChanged={() => void gc.loadFriendCounts()}
      initialRecipientId={mailRecipient?.id}
      initialRecipientName={mailRecipient?.name}
    />
  );
}

export function TemplatesScreenRenderer({ gc }: { gc: GameControllerState }) {
  return (
    <Templates
      templates={gc.templates}
      unlockedActions={gc.skillPointState?.unlockedActions ?? []}
      staminaState={gc.staminaState}
      manaState={gc.manaState}
      onLoadTemplates={gc.handleLoadTemplates}
      onNavigate={gc.setActiveScreen}
      onTemplateSaved={gc.handleTemplateSaved}
    />
  );
}

export function CasinoScreenRenderer({
  gc,
  player,
  casinoSocket,
}: {
  gc: GameControllerState;
  player: GameScreenPlayer | null;
  casinoSocket: GameScreenRendererProps['casinoSocket'];
}) {
  return (
    <Casino
      gold={gc.gold}
      turns={gc.turns}
      onExchangeGold={gc.handleExchangeGold}
      onPlaceBet={gc.handlePlaceBet}
      onGoldUpdate={gc.setGold}
      onTurnsUpdate={gc.setTurns}
      isInTown={gc.currentZone?.zoneType === 'town'}
      liveBets={casinoSocket.liveBets}
      sessionBets={casinoSocket.sessionBets}
      sessionProfit={casinoSocket.sessionProfit}
      lastResult={casinoSocket.lastResult}
      trackBet={casinoSocket.trackBet}
      playerName={player?.username ?? null}
      showNpcDialogue={gc.showNpcDialogue}
    />
  );
}

export function AdminScreenRenderer({ gc }: { gc: GameControllerState }) {
  return (
    <AdminScreen
      onStateUpdates={(updates) => applyStateUpdates(updates, gc.stateSetters)}
      setTurns={gc.setTurns}
      reloadZones={gc.reloadZones}
    />
  );
}

export function LeaderboardScreenRenderer({ player }: { player: GameScreenPlayer | null }) {
  return <Leaderboard playerId={player?.id ?? null} />;
}
