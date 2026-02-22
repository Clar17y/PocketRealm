'use client';

import { useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import {
  getPvpRating,
  getPvpLadder,
  getPvpNotifications,
  getPvpHistory,
  getPvpMatchDetail,
  scoutPvpOpponent,
  challengePvpOpponent,
  markPvpNotificationsRead,
  type PvpRatingResponse,
  type PvpLadderEntry,
  type PvpNotification,
  type PvpMatchResponse,
  type PvpMatchDetailResponse,
  type PvpScoutData,
  type PvpChallengeResponse,
} from '@/lib/api';
import { CombatPlayback } from '@/components/combat/CombatPlayback';
import { CombatLogEntry } from '@/components/combat/CombatLogEntry';
import { PVP_CONSTANTS } from '@adventure/shared';
import { rarityFromTier, RARITY_COLORS } from '@/lib/rarity';
import { Swords, Eye, Trophy, Bell, ChevronLeft, ChevronRight, Medal, Shield } from 'lucide-react';
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';
import { getLeaderboard, type LeaderboardResponse } from '@/lib/api';

interface ArenaScreenProps {
  characterLevel: number;
  busyAction: string | null;
  currentTurns: number;
  playerId: string | null;
  isInTown?: boolean;
  onTurnsChanged?: () => void;
  onNotificationsChanged?: () => void;
  onHpChanged?: () => void;
  onNavigate?: (screen: string) => void;
  combatSpeedMs?: number;
}

type ArenaView = 'ladder' | 'history' | 'notifications' | 'rankings';

export function ArenaScreen({ characterLevel, busyAction, currentTurns, playerId, isInTown = true, onTurnsChanged, onNotificationsChanged, onHpChanged, onNavigate, combatSpeedMs }: ArenaScreenProps) {
  const [rating, setRating] = useState<PvpRatingResponse | null>(null);
  const [ladder, setLadder] = useState<PvpLadderEntry[]>([]);
  const [notifications, setNotifications] = useState<PvpNotification[]>([]);
  const [history, setHistory] = useState<PvpMatchResponse[]>([]);
  const [historyPagination, setHistoryPagination] = useState<{ page: number; totalPages: number }>({ page: 1, totalPages: 1 });
  const [scoutData, setScoutData] = useState<Record<string, PvpScoutData>>({});
  const [activeView, setActiveView] = useState<ArenaView>('ladder');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<PvpChallengeResponse | null>(null);
  const [pvpPlaybackActive, setPvpPlaybackActive] = useState(false);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [matchDetail, setMatchDetail] = useState<PvpMatchDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rankingsData, setRankingsData] = useState<LeaderboardResponse | null>(null);
  const [rankingsLoading, setRankingsLoading] = useState(false);
  const [rankingsAroundMe, setRankingsAroundMe] = useState(false);

  const meetsLevel = characterLevel >= PVP_CONSTANTS.MIN_CHARACTER_LEVEL;

  useEffect(() => {
    void loadArenaData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadArenaData() {
    setLoading(true);
    setError(null);
    try {
      const [ratingRes, ladderRes] = await Promise.all([
        getPvpRating(),
        getPvpLadder(),
      ]);
      if (ratingRes.data) setRating(ratingRes.data);
      if (ladderRes.data) {
        if (ladderRes.data.myRating) setRating(ladderRes.data.myRating);
        setLadder(ladderRes.data.opponents ?? []);
      }
    } catch {
      setError('Failed to load arena data');
    } finally {
      setLoading(false);
    }
  }

  async function loadNotifications() {
    try {
      const notifRes = await getPvpNotifications();
      if (notifRes.data) setNotifications(notifRes.data.notifications ?? []);
    } catch {
      // ignore
    }
  }

  async function loadHistory(page = 1) {
    setError(null);
    try {
      const res = await getPvpHistory(page);
      if (res.data) {
        setHistory(res.data.matches);
        setHistoryPagination({ page: res.data.pagination.page, totalPages: res.data.pagination.totalPages });
      } else if (res.error) {
        setError(res.error.message);
      }
    } catch {
      setError('Failed to load match history');
    }
  }

  async function handleScout(targetId: string) {
    if (actionBusy) return;
    setActionBusy('scout');
    setError(null);
    try {
      const result = await scoutPvpOpponent(targetId);
      if (result.data) {
        setScoutData((prev) => ({ ...prev, [targetId]: result.data! }));
      } else if (result.error) {
        setError(result.error.message);
      }
    } finally {
      setActionBusy(null);
      onTurnsChanged?.();
    }
  }

  async function handleChallenge(targetId: string) {
    if (actionBusy) return;
    setActionBusy('challenge');
    setError(null);
    try {
      const result = await challengePvpOpponent(targetId);
      if (result.data) {
        setLastResult(result.data);
        setPvpPlaybackActive(true);
        await loadArenaData();
      } else if (result.error) {
        setError(result.error.message);
      }
    } finally {
      setActionBusy(null);
      onTurnsChanged?.();
      onNotificationsChanged?.();
      onHpChanged?.();
    }
  }

  useEffect(() => {
    if (activeView !== 'rankings') return;
    setRankingsLoading(true);
    void getLeaderboard('pvp_rating', rankingsAroundMe).then((res) => {
      if (res.data) setRankingsData(res.data);
      setRankingsLoading(false);
    });
  }, [activeView, rankingsAroundMe]);

  function handleViewChange(view: ArenaView) {
    setActiveView(view);
    setError(null);
    if (view === 'history') {
      void loadHistory(1);
    }
    if (view === 'notifications') {
      void loadNotifications().then(() => {
        // Mark all as read when user views the tab
        void markPvpNotificationsRead().then(() => {
          onNotificationsChanged?.();
        });
      });
    }
  }

  async function handleToggleMatchDetail(matchId: string) {
    if (expandedMatchId === matchId) {
      setExpandedMatchId(null);
      setMatchDetail(null);
      return;
    }
    setExpandedMatchId(matchId);
    setMatchDetail(null);
    setDetailLoading(true);
    try {
      const res = await getPvpMatchDetail(matchId);
      if (res.data) {
        setMatchDetail(res.data);
      }
    } finally {
      setDetailLoading(false);
    }
  }

  // Level gate
  const levelGate = !meetsLevel && (
    <PixelCard className="mb-4">
      <div className="text-center py-4">
        <Swords size={32} className="mx-auto mb-2 text-[var(--rpg-text-secondary)]" />
        <p className="text-[var(--rpg-text-primary)] font-semibold mb-1">
          Arena Locked
        </p>
        <p className="text-sm text-[var(--rpg-text-secondary)]">
          Reach character level {PVP_CONSTANTS.MIN_CHARACTER_LEVEL} to compete in the Arena.
        </p>
        <div className="mt-3 w-full bg-[var(--rpg-background)] rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-[var(--rpg-gold)] transition-all"
            style={{ width: `${Math.min(100, (characterLevel / PVP_CONSTANTS.MIN_CHARACTER_LEVEL) * 100)}%` }}
          />
        </div>
        <p className="text-xs text-[var(--rpg-text-secondary)] mt-1">
          Level {characterLevel} / {PVP_CONSTANTS.MIN_CHARACTER_LEVEL}
        </p>
      </div>
    </PixelCard>
  );

  // Rating panel
  const ratingPanel = rating && (
    <PixelCard className="mb-4">
      <div className="flex items-center gap-3 mb-3">
        <Trophy size={24} className="text-[var(--rpg-gold)]" />
        <h2 className="text-lg font-bold text-[var(--rpg-text-primary)]">Your Rating</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[var(--rpg-background)] rounded-lg p-2 text-center">
          <div className="text-xs text-[var(--rpg-text-secondary)]">Rating</div>
          <div className="text-lg font-bold text-[var(--rpg-gold)] font-mono">{rating.rating}</div>
        </div>
        <div className="bg-[var(--rpg-background)] rounded-lg p-2 text-center">
          <div className="text-xs text-[var(--rpg-text-secondary)]">Record</div>
          <div className="text-lg font-bold font-mono">
            <span className="text-[var(--rpg-green-light)]">{rating.wins}</span>
            <span className="text-[var(--rpg-text-secondary)]"> / </span>
            <span className="text-[var(--rpg-red)]">{rating.losses}</span>
            {rating.draws > 0 && <>
              <span className="text-[var(--rpg-text-secondary)]"> / </span>
              <span className="text-[var(--rpg-gold)]">{rating.draws}</span>
            </>}
          </div>
        </div>
        <div className="bg-[var(--rpg-background)] rounded-lg p-2 text-center">
          <div className="text-xs text-[var(--rpg-text-secondary)]">Win Streak</div>
          <div className="text-lg font-bold text-[var(--rpg-text-primary)] font-mono">{rating.winStreak}</div>
        </div>
        <div className="bg-[var(--rpg-background)] rounded-lg p-2 text-center">
          <div className="text-xs text-[var(--rpg-text-secondary)]">Best Rating</div>
          <div className="text-lg font-bold text-[var(--rpg-gold)] font-mono">{rating.bestRating}</div>
        </div>
      </div>
    </PixelCard>
  );

  // Challenge result: playback then rating summary
  const resultPanel = lastResult && (
    pvpPlaybackActive ? (
      <CombatPlayback
        mobDisplayName={lastResult.defenderName}
        outcome={lastResult.isDraw ? 'draw' : lastResult.winnerId === playerId ? 'victory' : 'defeat'}
        playerMaxHp={lastResult.combat.combatantAMaxHp}
        playerStartHp={lastResult.attackerStartHp}
        mobMaxHp={lastResult.combat.combatantBMaxHp}
        log={lastResult.combat.log}
        playerLabel={lastResult.attackerName}
        defeatButtonLabel="Continue"
        speedMs={combatSpeedMs}
        onComplete={() => setPvpPlaybackActive(false)}
        onSkip={() => setPvpPlaybackActive(false)}
      />
    ) : (
      <PixelCard className="mb-4">
        <div className="text-center py-2">
          <div className={`text-xl font-bold mb-1 ${
            lastResult.isDraw ? 'text-[var(--rpg-gold)]'
              : lastResult.winnerId === playerId ? 'text-[var(--rpg-green-light)]' : 'text-[var(--rpg-red)]'
          }`}>
            {lastResult.isDraw ? 'Draw!' : lastResult.winnerId === playerId ? 'Victory!' : 'Defeat!'}
          </div>
          <p className="text-sm text-[var(--rpg-text-secondary)]">
            {lastResult.attackerName} vs {lastResult.defenderName}
            {lastResult.isDraw && ' — 100 rounds, no winner'}
          </p>
          <p className="text-sm font-mono mt-1">
            Rating:{' '}
            <span className={lastResult.attackerRatingChange >= 0 ? 'text-[var(--rpg-green-light)]' : 'text-[var(--rpg-red)]'}>
              {lastResult.attackerRatingChange >= 0 ? '+' : ''}{lastResult.attackerRatingChange}
            </span>
          </p>
          {lastResult.fleeOutcome === 'knockout' && (
            <p className="text-sm text-[var(--rpg-red)] mt-1 font-semibold">
              Knocked out! You need to recover.
            </p>
          )}
          {lastResult.fleeOutcome === 'wounded_escape' && (
            <p className="text-sm text-[var(--rpg-gold)] mt-1">
              You limp away wounded.
            </p>
          )}
          {lastResult.fleeOutcome === 'clean_escape' && (
            <p className="text-sm text-[var(--rpg-text-secondary)] mt-1">
              You escape relatively unscathed.
            </p>
          )}
          <div className="flex items-center justify-center gap-3 mt-2">
            {lastResult.attackerKnockedOut && onNavigate && (
              <button
                type="button"
                onClick={() => { setLastResult(null); onNavigate('rest'); }}
                className="text-sm text-[var(--rpg-gold)] underline font-semibold"
              >
                Recover
              </button>
            )}
            <button
              type="button"
              onClick={() => setLastResult(null)}
              className="text-xs text-[var(--rpg-text-secondary)] underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      </PixelCard>
    )
  );

  // View tabs
  const viewTabs = (
    <div className="flex gap-2 mb-4">
      {([
        { id: 'ladder' as const, label: 'Ladder', icon: Swords },
        { id: 'history' as const, label: 'History', icon: Trophy },
        { id: 'notifications' as const, label: 'Alerts', icon: Bell, badge: notifications.length },
        { id: 'rankings' as const, label: 'Rankings', icon: Medal },
      ]).map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => handleViewChange(tab.id)}
          className={`relative px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeView === tab.id
              ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
              : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
          }`}
        >
          <tab.icon size={14} />
          {tab.label}
          {tab.badge != null && tab.badge > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-[var(--rpg-red)] text-white font-bold">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );

  // Ladder view
  const ladderView = (
    <div className="space-y-2">
      {ladder.length === 0 && !loading && (
        <PixelCard>
          <p className="text-center text-[var(--rpg-text-secondary)] py-4">
            No opponents in your rating bracket. Keep playing to attract challengers!
          </p>
        </PixelCard>
      )}
      {ladder.map((opponent) => {
        const scouted = scoutData[opponent.playerId];
        return (
          <PixelCard key={opponent.playerId} padding="sm">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="text-[var(--rpg-text-primary)] font-semibold truncate">
                    {opponent.username}
                  </span>
                  {opponent.title && (
                    <span className="text-[10px] shrink-0" style={{ color: RARITY_COLORS[rarityFromTier(opponent.titleTier ?? 1)] }}>
                      &lt;{opponent.title}&gt;
                    </span>
                  )}
                  {opponent.isAdmin && <Shield className="w-3.5 h-3.5 text-[var(--rpg-gold)] shrink-0" />}
                </div>
                <div className="text-xs text-[var(--rpg-text-secondary)]">
                  Rating: {opponent.rating} | Lv.{opponent.characterLevel}
                </div>
                {scouted && (
                  <div className="text-xs text-[var(--rpg-blue-light)] mt-1">
                    Style: {scouted.attackStyle} | Armor: {scouted.armorClass} | Power: {scouted.powerRating}
                    <span className={scouted.myPowerRating >= scouted.powerRating ? 'text-[var(--rpg-green-light)]' : 'text-[var(--rpg-red)]'}>
                      {' '}(You: {scouted.myPowerRating})
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                {!scouted && (
                  <PixelButton
                    variant="secondary"
                    size="sm"
                    disabled={!isInTown || !meetsLevel || !!actionBusy || !!busyAction || currentTurns < PVP_CONSTANTS.SCOUT_TURN_COST}
                    onClick={() => void handleScout(opponent.playerId)}
                    title={isInTown ? `Scout (${PVP_CONSTANTS.SCOUT_TURN_COST} turns)` : 'Must be in a town'}
                  >
                    <Eye size={14} className="inline mr-1" />
                    {isInTown ? 'Scout' : 'Town Only'}
                  </PixelButton>
                )}
                <PixelButton
                  variant="gold"
                  size="sm"
                  disabled={!isInTown || !meetsLevel || !!actionBusy || !!busyAction || currentTurns < PVP_CONSTANTS.CHALLENGE_TURN_COST}
                  onClick={() => void handleChallenge(opponent.playerId)}
                  title={isInTown ? `Challenge (${PVP_CONSTANTS.CHALLENGE_TURN_COST} turns)` : 'Must be in a town'}
                >
                  <Swords size={14} className="inline mr-1" />
                  {isInTown ? 'Fight' : 'Town Only'}
                </PixelButton>
              </div>
            </div>
          </PixelCard>
        );
      })}
    </div>
  );

  // History view
  const historyView = (
    <div className="space-y-2">
      {history.length === 0 && (
        <PixelCard>
          <p className="text-center text-[var(--rpg-text-secondary)] py-4">
            No match history yet. Challenge someone from the ladder!
          </p>
        </PixelCard>
      )}
      {history.map((match) => {
        const isAttacker = match.attackerId === playerId;
        const isDraw = match.winnerId === null;
        const won = !isDraw && match.winnerId === playerId;
        const opponentName = isAttacker ? match.defenderName : match.attackerName;
        const ratingChange = isAttacker ? match.attackerRatingChange : match.defenderRatingChange;
        const isExpanded = expandedMatchId === match.matchId;
        return (
          <div key={match.matchId}>
            <PixelCard padding="sm">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => void handleToggleMatchDetail(match.matchId)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${isDraw ? 'text-[var(--rpg-gold)]' : won ? 'text-[var(--rpg-green-light)]' : 'text-[var(--rpg-red)]'}`}>
                        {isDraw ? 'DRAW' : won ? 'WIN' : 'LOSS'}
                      </span>
                      <span className="text-[var(--rpg-text-primary)]">vs {opponentName}</span>
                      {match.isRevenge && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)]">
                          Revenge
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--rpg-text-secondary)]">
                      {isAttacker ? 'Attacked' : 'Defended'} | {match.attackerStyle} vs {match.defenderStyle}
                      {' | '}{new Date(match.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold font-mono ${isDraw ? 'text-[var(--rpg-text-secondary)]' : ratingChange >= 0 ? 'text-[var(--rpg-green-light)]' : 'text-[var(--rpg-red)]'}`}>
                      {isDraw ? '—' : `${ratingChange >= 0 ? '+' : ''}${ratingChange}`}
                    </span>
                    <ChevronRight size={14} className={`text-[var(--rpg-text-secondary)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </div>
                </div>
              </button>
            </PixelCard>
            {isExpanded && (
              <div className="ml-2 mt-1 mb-2 border-l-2 border-[var(--rpg-border)] pl-2 max-h-64 overflow-y-auto space-y-0.5">
                {detailLoading && (
                  <p className="text-xs text-[var(--rpg-text-secondary)] py-2">Loading combat log...</p>
                )}
                {matchDetail && matchDetail.matchId === match.matchId && (() => {
                  const viewerIsAttacker = match.attackerId === playerId;
                  const pMaxHp = viewerIsAttacker ? matchDetail.combatLog.combatantAMaxHp : matchDetail.combatLog.combatantBMaxHp;
                  const mMaxHp = viewerIsAttacker ? matchDetail.combatLog.combatantBMaxHp : matchDetail.combatLog.combatantAMaxHp;
                  const pLabel = viewerIsAttacker ? matchDetail.attackerName : matchDetail.defenderName;
                  const oLabel = viewerIsAttacker ? matchDetail.defenderName : matchDetail.attackerName;
                  return matchDetail.combatLog.log.map((entry, i) => (
                    <CombatLogEntry
                      key={i}
                      entry={viewerIsAttacker ? entry : { ...entry, actor: entry.actor === 'combatantA' ? 'combatantB' : 'combatantA' }}
                      playerMaxHp={pMaxHp}
                      mobMaxHp={mMaxHp}
                      showDetailedBreakdown={false}
                      playerLabel={pLabel}
                      opponentLabel={oLabel}
                    />
                  ));
                })()}
              </div>
            )}
          </div>
        );
      })}
      {historyPagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <button
            type="button"
            onClick={() => void loadHistory(historyPagination.page - 1)}
            disabled={historyPagination.page <= 1}
            className="p-1.5 rounded text-[var(--rpg-text-secondary)] disabled:opacity-30"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm text-[var(--rpg-text-secondary)]">
            {historyPagination.page} / {historyPagination.totalPages}
          </span>
          <button
            type="button"
            onClick={() => void loadHistory(historyPagination.page + 1)}
            disabled={historyPagination.page >= historyPagination.totalPages}
            className="p-1.5 rounded text-[var(--rpg-text-secondary)] disabled:opacity-30"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );

  // Notifications view
  const notificationsView = (
    <div className="space-y-2">
      {notifications.length === 0 && (
        <PixelCard>
          <p className="text-center text-[var(--rpg-text-secondary)] py-4">
            No new attack notifications.
          </p>
        </PixelCard>
      )}
      {notifications.map((notif) => {
        const isDraw = notif.winnerId === null;
        const won = !isDraw && notif.defenderRatingChange >= 0;
        return (
          <PixelCard key={notif.matchId} padding="sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${isDraw ? 'text-[var(--rpg-gold)]' : won ? 'text-[var(--rpg-green-light)]' : 'text-[var(--rpg-red)]'}`}>
                    {isDraw ? 'DRAW' : won ? 'DEFENDED' : 'LOST'}
                  </span>
                  <span className="text-[var(--rpg-text-primary)]">
                    Attacked by {notif.attackerName}
                  </span>
                  {notif.isRevenge && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)]">
                      Revenge
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--rpg-text-secondary)]">
                  {new Date(notif.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-bold font-mono ${notif.defenderRatingChange >= 0 ? 'text-[var(--rpg-green-light)]' : 'text-[var(--rpg-red)]'}`}>
                  {notif.defenderRatingChange >= 0 ? '+' : ''}{notif.defenderRatingChange}
                </span>
              </div>
            </div>
          </PixelCard>
        );
      })}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {levelGate}
        <div className="text-center text-[var(--rpg-text-secondary)] py-8">Loading arena data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {levelGate}
      {ratingPanel}
      {resultPanel}

      {error && (
        <div className="p-3 rounded bg-[var(--rpg-background)] border border-[var(--rpg-red)] text-[var(--rpg-red)] text-sm">
          {error}
        </div>
      )}

      {viewTabs}

      {activeView === 'ladder' && ladderView}
      {activeView === 'history' && historyView}
      {activeView === 'notifications' && notificationsView}
      {activeView === 'rankings' && (
        <PixelCard>
          <LeaderboardTable
            entries={rankingsData?.entries ?? []}
            myRank={rankingsData?.myRank ?? null}
            currentPlayerId={playerId}
            loading={rankingsLoading}
            totalPlayers={rankingsData?.totalPlayers ?? 0}
            lastRefreshedAt={rankingsData?.lastRefreshedAt ?? null}
            showAroundMe={rankingsAroundMe}
            onToggleAroundMe={() => setRankingsAroundMe((v) => !v)}
          />
          {onNavigate && (
            <button
              onClick={() => onNavigate('leaderboard')}
              className="w-full mt-3 py-2 text-sm text-[var(--rpg-gold)] hover:text-[var(--rpg-gold)]/80 transition-colors"
            >
              View All Leaderboards →
            </button>
          )}
        </PixelCard>
      )}
    </div>
  );
}
