'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { screenBackgroundSrc, zoneImageSrc, type ExpeditionContext } from '@/lib/assets';
import {
  getActiveSeason,
  getCharacters,
  getSeasonArchives,
  joinSeason,
  switchPlayer,
  type ActiveSeasonResponse,
  type CharacterSummary,
  type SeasonArchiveSummary,
} from '@/lib/api';
import { AppShell } from '@/components/AppShell';
import { ChangelogModal } from '@/components/common/ChangelogModal';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { LootPicker } from '@/components/common/LootPicker';
import { LootReveal } from '@/components/common/LootReveal';
import { XpRateTutorial } from '@/components/common/XpRateTutorial';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { BottomNav } from '@/components/BottomNav';
import { SubNav } from '@/components/common/SubNav';
import { AchievementToast } from '@/components/AchievementToast';
import { QuestToast } from '@/components/QuestToast';
import { ForgeResultToast } from '@/components/ForgeResultToast';
import { RateLimitToast } from '@/components/RateLimitToast';
import { useRateLimitToast } from './hooks/useRateLimitToast';
import { ErrorToast } from '@/components/ErrorToast';
import { useErrorToast } from './hooks/useErrorToast';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { ConnectionBanner } from '@/components/common/ConnectionBanner';
import { TutorialBanner } from '@/components/TutorialBanner';
import { VerificationBanner } from '@/components/VerificationBanner';
import { TutorialDialog } from '@/components/TutorialDialog';
import { StarterWeaponPopup } from '@/components/StarterWeaponPopup';
import { JoinSeasonBanner } from '@/components/common/JoinSeasonBanner';
import type { SkillType } from '@pocketrealm/shared';
import { calculateEfficiency } from '@pocketrealm/game-engine';
import {
  isTutorialActive,
  TUTORIAL_STEPS,
  TUTORIAL_STEP_WELCOME,
  TUTORIAL_STEP_STARTER_WEAPON,
  TUTORIAL_STEP_DONE,
} from '@/lib/tutorial';
import { useGameController } from './useGameController';
import type { Screen } from './gameController.types';
import { useChat } from '@/hooks/useChat';
import { useCasinoSocket } from '@/hooks/useCasinoSocket';
import { ChatPanel } from '@/components/ChatPanel';
import { SKILL_META } from './pageConstants';
import { GameScreenRenderer } from './GameScreenRenderer';
import { PASSWORD_UPDATED_RELOGIN_MESSAGE, RELOGIN_MESSAGE_KEY } from '../login/reloginMessage';

export default function GamePage() {
  const router = useRouter();
  const { player, isLoading, isAuthenticated, logout, refreshPlayer, storeTokens } = useAuth();
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [seasonArchives, setSeasonArchives] = useState<SeasonArchiveSummary[]>([]);
  const [activeSeason, setActiveSeason] = useState<ActiveSeasonResponse | null>(null);
  const [realmActionError, setRealmActionError] = useState<string | null>(null);
  const [switchingPlayerId, setSwitchingPlayerId] = useState<string | null>(null);
  const [joiningSeason, setJoiningSeason] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  const loadRealmData = useCallback(async () => {
    if (!isAuthenticated) return;

    const [archivesRes, charactersRes, activeSeasonRes] = await Promise.all([
      getSeasonArchives(),
      getCharacters(),
      getActiveSeason(),
    ]);

    if (archivesRes.data) {
      setSeasonArchives(archivesRes.data.archives);
    }

    if (charactersRes.data) {
      setCharacters(charactersRes.data.characters);
    }

    if (activeSeasonRes.data) {
      setActiveSeason(activeSeasonRes.data.season);
    }
  }, [isAuthenticated]);

  const gc = useGameController({ isAuthenticated });
  const {
    activeScreen, setActiveScreen,
    handleNavigate,
    getActiveTab,
    turns,
    skills,
    equipment,
    activeCraftingSkill,
    pvpNotificationCount,
    incomingFriendRequestCount,
    mailUnreadCount,
    playbackActive,
    currentZone,
    activeZoneId,
    busyAction, slowAction, actionError,
    hpState,
    tutorialStep, skipTutorial, advanceTutorial, handleClaimStarterWeapon,
    showChangelog, dismissChangelog, openChangelog,
    achievementUnclaimedCount,
    quests,
    pendingLootSession,
    handleClaimLoot, handleDismissLoot, handleReopenLoot,
    confirmAbandonLoot, abandonLootAndTravel, cancelAbandonLoot,
    lootRevealItems, handleDismissLootReveal,
    inventoryCapacity, inventoryUsedSlots,
  } = gc;

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      void loadRealmData();
    }
  }, [isLoading, isAuthenticated, loadRealmData, player?.id]);

  useRateLimitToast();
  useErrorToast(gc.isOffline);
  const { state: pushState, toggle: pushToggle } = usePushNotifications();

  // Navigate to screen from query param (e.g. push notification deep link)
  const [deepLinkTab, setDeepLinkTab] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const screen = params.get('screen');
    if (screen) {
      setActiveScreen(screen as Screen);
      setDeepLinkTab(params.get('tab'));
      window.history.replaceState(null, '', '/game');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [achievementCategory, setAchievementCategory] = useState<string | null>(null);
  const [expeditionContext, setExpeditionContext] = useState<ExpeditionContext | null>(null);
  const chat = useChat({ isAuthenticated, currentZoneId: activeZoneId });
  const casinoSocket = useCasinoSocket(activeScreen === 'casino', player?.id ?? null);
  const lastDealerCountRef = useRef(0);
  const errorRef = useRef<HTMLDivElement>(null);
  const [mailRecipient, setMailRecipient] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (actionError && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [actionError]);

  useEffect(() => {
    if (activeScreen === 'achievements') void gc.loadAchievements();
  }, [activeScreen, gc.loadAchievements]);

  useEffect(() => {
    if (activeScreen === 'quests') void gc.loadQuests();
  }, [activeScreen, gc.loadQuests]);

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

  const tutorialPulseTabs = useMemo(() => {
    if (!isTutorialActive(tutorialStep)) return undefined;
    const stepDef = TUTORIAL_STEPS[tutorialStep];
    if (!stepDef?.pulseTab) return undefined;
    return new Set([stepDef.pulseTab]);
  }, [tutorialStep]);

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

  const activeCharacter = useMemo(
    () => characters.find((character) => character.id === player?.id) ?? null,
    [characters, player?.id],
  );

  const hasCharacterInActiveSeason = useMemo(
    () => activeSeason ? characters.some((character) => character.seasonId === activeSeason.id) : false,
    [activeSeason, characters],
  );

  const showJoinSeasonBanner = Boolean(activeSeason && !hasCharacterInActiveSeason && player);
  const showRealmErrorBanner = Boolean(realmActionError && !showJoinSeasonBanner);

  const syncSession = useCallback(async (accessToken: string, refreshToken: string) => {
    storeTokens(accessToken, refreshToken);
    await refreshPlayer();
    await loadRealmData();
  }, [loadRealmData, refreshPlayer, storeTokens]);

  const handleSwitchPlayer = useCallback(async (playerId: string) => {
    setRealmActionError(null);
    setSwitchingPlayerId(playerId);

    const response = await switchPlayer(playerId);
    if (!response.data) {
      setRealmActionError(response.error?.message ?? 'Failed to switch characters.');
      setSwitchingPlayerId(null);
      return;
    }

    try {
      await syncSession(response.data.accessToken, response.data.refreshToken);
    } catch {
      setRealmActionError('Character switched, but account refresh failed.');
    } finally {
      setSwitchingPlayerId(null);
    }
  }, [syncSession]);

  const handleJoinSeason = useCallback(async (username: string) => {
    setRealmActionError(null);
    setJoiningSeason(true);

    const response = await joinSeason(username);
    if (!response.data) {
      setRealmActionError(response.error?.message ?? 'Failed to join the season.');
      setJoiningSeason(false);
      return;
    }

    try {
      await syncSession(response.data.accessToken, response.data.refreshToken);
      setActiveScreen('home');
    } catch {
      setRealmActionError('Season character created, but account refresh failed.');
    } finally {
      setJoiningSeason(false);
    }
  }, [setActiveScreen, syncSession]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--rpg-background)] flex items-center justify-center">
        <p className="text-[var(--rpg-text-secondary)]">Loading...</p>
      </div>
    );
  }

  const activeTab = getActiveTab();

  return (
    <>
      <ConnectionBanner />
      <ErrorBoundary>
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
          screenBackgroundSrc(activeScreen, activeCraftingSkill, expeditionContext ?? undefined)
          ?? (['home', 'explore', 'combat', 'gathering', 'rest'].includes(activeScreen) && currentZone?.name && currentZone.name !== '???'
            ? zoneImageSrc(currentZone.name)
            : undefined)
        }
        realmLabel={activeCharacter?.seasonName ?? 'Permanent Realm'}
        realmEndsAt={activeCharacter?.seasonEndsAt ?? null}
        activePlayerId={player?.id ?? null}
        characters={characters}
        switchingPlayerId={switchingPlayerId}
        onSwitchPlayer={(playerId) => void handleSwitchPlayer(playerId)}
      >
        {showJoinSeasonBanner && activeSeason && player && (
          <JoinSeasonBanner
            seasonName={activeSeason.name}
            seasonEndsAt={activeSeason.endsAt}
            suggestedUsername={player.username}
            isJoining={joiningSeason}
            error={realmActionError}
            onJoin={handleJoinSeason}
          />
        )}

        {showRealmErrorBanner ? (
          <div className="mb-3 rounded-lg border border-[var(--rpg-red)] bg-[var(--rpg-red)]/10 p-2 text-sm text-[var(--rpg-red)]">
            {realmActionError}
          </div>
        ) : null}
        {/* Broken gear warning banner */}
        {equipment.some((e) => {
          if (!e.item) return false;
          const maxDur = e.item.template?.maxDurability ?? 0;
          if (maxDur <= 0) return false;
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

        {player && <VerificationBanner emailVerified={player.emailVerified} />}

        <TutorialBanner tutorialStep={tutorialStep} onSkip={skipTutorial} />

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

        {activeTab === 'social' && (
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
            role="alert"
            className={`mb-4 p-3 rounded bg-[var(--rpg-background)] animate-error-flash ${
              actionError.includes('active expedition')
                ? 'border border-[var(--rpg-gold)] text-[var(--rpg-gold)]'
                : 'border border-[var(--rpg-red)] text-[var(--rpg-red)]'
            }`}
          >
            {actionError}
            {actionError.includes('active expedition') && (
              <button
                onClick={() => setActiveScreen('guild')}
                className="block mt-1 text-xs underline text-[var(--rpg-gold)] hover:text-[var(--rpg-text-primary)]"
              >
                Go to Guild Expeditions
              </button>
            )}
          </div>
        )}

        {busyAction && slowAction && (
          <div className="text-center text-xs text-[var(--rpg-gold)] animate-pulse py-1" role="status" aria-live="polite">
            Still working...
          </div>
        )}

        <GameScreenRenderer
          gc={gc}
          player={player}
          seasonArchives={seasonArchives}
          realmLabel={activeCharacter?.seasonName ?? 'Permanent Realm'}
          realmEndsAt={activeCharacter?.seasonEndsAt ?? null}
          activePlayerId={player?.id ?? null}
          characters={characters}
          switchingPlayerId={switchingPlayerId}
          onSwitchPlayer={(playerId) => void handleSwitchPlayer(playerId)}
          casinoSocket={casinoSocket}
          achievementCategory={achievementCategory}
          setAchievementCategory={setAchievementCategory}
          expeditionContext={expeditionContext}
          setExpeditionContext={setExpeditionContext}
          mailRecipient={mailRecipient}
          setMailRecipient={setMailRecipient}
          deepLinkTab={deepLinkTab}
          pushState={pushState}
          pushToggle={pushToggle}
          onLogout={() => { logout(); router.push('/'); }}
          onAccountRefresh={async () => { await refreshPlayer(); }}
          onForceRelogin={() => {
            sessionStorage.setItem(RELOGIN_MESSAGE_KEY, PASSWORD_UPDATED_RELOGIN_MESSAGE);
            logout();
            router.push('/login');
          }}
        />
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
      {tutorialStep === TUTORIAL_STEP_STARTER_WEAPON && (
        <StarterWeaponPopup onSelect={handleClaimStarterWeapon} />
      )}
      <AchievementToast onNavigate={(category) => { setAchievementCategory(category); setActiveScreen('achievements'); }} />
      <QuestToast />
      <ForgeResultToast />
      <RateLimitToast />
      <ErrorToast />
    </ErrorBoundary>
    </>
  );
}
