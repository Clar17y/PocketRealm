'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSilentRefresh } from '@/hooks/useSilentRefresh';
import { RefreshingIndicator } from '@/components/common/RefreshingIndicator';
import {
  getFriendsList,
  searchPlayerByUsername,
  sendFriendRequest,
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  unfriend,
  getBlockList,
  unblockPlayer,
  blockPlayer,
  sparFriend,
} from '@/lib/api';
import type { SparResponse } from '@/lib/api';
import type { FriendListEntry, FriendRequest, BlockedPlayer, StateUpdates } from '@pocketrealm/shared';
import { FRIEND_CONSTANTS } from '@pocketrealm/shared';
import { relativeTime } from '@/lib/format';
import { handleKeyActivate } from '@/lib/utils';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { SubNav } from '@/components/common/SubNav';
import { SkeletonCard } from '@/components/common/LoadingSkeleton';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { FriendProfileModal } from '@/components/friends/FriendProfileModal';
import { CombatPlayback } from '@/components/combat/CombatPlayback';
import { PlaybackSurface } from '@/components/playback/PlaybackSurface';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FriendsScreenProps {
  playerId: string | null;
  onStateUpdates?: (updates: StateUpdates) => void;
  onFriendCountsChanged?: () => void;
  combatSpeedMs?: number;
  onNavigateToMail?: (recipientId: string, recipientName: string) => void;
}

type FriendsView = 'list' | 'incoming' | 'outgoing' | 'blocked';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FriendsScreen({
  playerId,
  onStateUpdates,
  onFriendCountsChanged,
  combatSpeedMs,
  onNavigateToMail,
}: FriendsScreenProps) {
  // --- data state ---
  const [friends, setFriends] = useState<FriendListEntry[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [blocks, setBlocks] = useState<BlockedPlayer[]>([]);

  // --- UI state ---
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<FriendsView>('list');

  // --- profile modal state ---
  const [selectedFriendshipId, setSelectedFriendshipId] = useState<string | null>(null);

  // --- spar state ---
  const [sparResult, setSparResult] = useState<SparResponse | null>(null);
  const [sparPlaybackActive, setSparPlaybackActive] = useState(false);

  // --- search state ---
  const [searchUsername, setSearchUsername] = useState('');
  const [searchResult, setSearchResult] = useState<{
    id: string;
    username: string;
    characterLevel: number;
  } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // --- action busy guard ---
  const [actionBusy, setActionBusy] = useState(false);

  // --- confirm dialog state ---
  const [confirmAction, setConfirmAction] = useState<{ type: 'remove' | 'block'; friendId: string; name: string } | null>(null);

  // --- refreshing (silent reload after actions) ---
  const { loading, refreshing, startLoad, endLoad } = useSilentRefresh();

  // -----------------------------------------------------------------------
  // Data loaders
  // -----------------------------------------------------------------------

  const loadFriends = useCallback(async (silent = false) => {
    startLoad(silent);
    setError(null);
    try {
      const res = await getFriendsList();
      if (res.error) {
        setError(res.error.message);
        return;
      }
      setFriends(res.data?.friends ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load friends');
    } finally {
      endLoad(silent);
    }
  }, [startLoad, endLoad]);

  const loadIncoming = useCallback(async () => {
    try {
      const res = await getIncomingFriendRequests();
      if (res.error) return;
      setIncomingRequests(res.data?.requests ?? []);
    } catch {
      // silent -- tab-specific load
    }
  }, []);

  const loadOutgoing = useCallback(async () => {
    try {
      const res = await getOutgoingFriendRequests();
      if (res.error) return;
      setOutgoingRequests(res.data?.requests ?? []);
    } catch {
      // silent
    }
  }, []);

  const loadBlocks = useCallback(async () => {
    try {
      const res = await getBlockList();
      if (res.error) return;
      setBlocks(res.data?.blocks ?? []);
    } catch {
      // silent
    }
  }, []);

  // Initial load
  useEffect(() => {
    void loadFriends();
    void loadIncoming(); // pre-fetch for badge count
  }, [loadFriends, loadIncoming]);

  // Load data when switching tabs
  useEffect(() => {
    if (activeView === 'incoming') void loadIncoming();
    if (activeView === 'outgoing') void loadOutgoing();
    if (activeView === 'blocked') void loadBlocks();
  }, [activeView, loadIncoming, loadOutgoing, loadBlocks]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  async function handleSearch() {
    const trimmed = searchUsername.trim();
    if (!trimmed) return;
    setSearchLoading(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      const res = await searchPlayerByUsername(trimmed);
      if (res.error) {
        setSearchError(res.error.message);
        return;
      }
      if (!res.data?.player) {
        setSearchError('Player not found');
        return;
      }
      setSearchResult(res.data.player);
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleSendRequest() {
    if (!searchResult || actionBusy) return;
    setActionBusy(true);
    setSearchError(null);
    try {
      const res = await sendFriendRequest(searchResult.id);
      if (res.error) {
        setSearchError(res.error.message);
        return;
      }
      setSearchResult(null);
      setSearchUsername('');
      onFriendCountsChanged?.();
      void loadOutgoing();
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : 'Failed to send request');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleAccept(friendshipId: string) {
    if (actionBusy) return;
    setActionBusy(true);
    setError(null);
    try {
      const res = await acceptFriendRequest(friendshipId);
      if (res.error) {
        setError(res.error.message);
        return;
      }
      onFriendCountsChanged?.();
      void loadFriends(true);
      void loadIncoming();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to accept request');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDecline(friendshipId: string) {
    if (actionBusy) return;
    setActionBusy(true);
    setError(null);
    try {
      const res = await declineFriendRequest(friendshipId);
      if (res.error) {
        setError(res.error.message);
        return;
      }
      onFriendCountsChanged?.();
      void loadIncoming();
      void loadOutgoing();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to decline request');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleUnfriend(friendshipId: string) {
    if (actionBusy) return;
    setActionBusy(true);
    setError(null);
    try {
      const res = await unfriend(friendshipId);
      if (res.error) {
        setError(res.error.message);
        return;
      }
      onFriendCountsChanged?.();
      void loadFriends(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove friend');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleBlock(targetId: string) {
    if (actionBusy) return;
    setActionBusy(true);
    setError(null);
    try {
      const res = await blockPlayer(targetId);
      if (res.error) {
        setError(res.error.message);
        return;
      }
      onFriendCountsChanged?.();
      // Remove from friends/requests lists and refresh blocks
      void loadFriends(true);
      void loadIncoming();
      void loadBlocks();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to block player');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleUnblock(blockId: string) {
    if (actionBusy) return;
    setActionBusy(true);
    setError(null);
    try {
      const res = await unblockPlayer(blockId);
      if (res.error) {
        setError(res.error.message);
        return;
      }
      void loadBlocks();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to unblock player');
    } finally {
      setActionBusy(false);
    }
  }

  // --- Spar handler ---
  async function handleSpar(friendshipId: string) {
    setActionBusy(true);
    setError(null);
    try {
      const result = await sparFriend(friendshipId);
      if (result.data) {
        if (result.data.stateUpdates) onStateUpdates?.(result.data.stateUpdates);
        setSparResult(result.data);
        setSparPlaybackActive(true);
        setSelectedFriendshipId(null); // close profile modal
      } else if (result.error) {
        setError(result.error.message);
      }
    } finally {
      setActionBusy(false);
    }
  }

  function handleSendMail(recipientId: string, recipientName: string) {
    setSelectedFriendshipId(null);
    onNavigateToMail?.(recipientId, recipientName);
  }

  // --- Dismiss spar playback ---
  function dismissSparPlayback() {
    setSparPlaybackActive(false);
    setSparResult(null);
  }

  // -----------------------------------------------------------------------
  // Derived
  // -----------------------------------------------------------------------

  // Sort friends: online first, then alphabetical
  const sortedFriends = [...friends].sort((a, b) => {
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    return a.username.localeCompare(b.username);
  });

  const tabs = [
    { id: 'list' as const, label: 'Friends', badge: undefined },
    {
      id: 'incoming' as const,
      label: 'Incoming',
      badge: incomingRequests.length || undefined,
    },
    { id: 'outgoing' as const, label: 'Outgoing', badge: undefined },
    { id: 'blocked' as const, label: 'Blocked', badge: undefined },
  ];

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (loading && friends.length === 0) {
    return (
      <ScreenContainer>
        <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">
          Friends
        </h2>
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </ScreenContainer>
    );
  }

  // -----------------------------------------------------------------------
  // Spar result summary (shown after playback completes)
  // -----------------------------------------------------------------------

  const sparResultSummary = sparResult && !sparPlaybackActive && (
    <PixelCard className="mb-4">
      <div className="text-center py-2">
        <div className={`text-xl font-bold font-almendra mb-1 ${
          sparResult.isDraw ? 'text-[var(--rpg-gold)]'
            : sparResult.winnerId === playerId ? 'text-[var(--rpg-green-light)]' : 'text-[var(--rpg-red)]'
        }`}>
          {sparResult.isDraw ? 'Draw!' : sparResult.winnerId === playerId ? 'Victory!' : 'Defeat!'}
        </div>
        <p className="text-sm text-[var(--rpg-text-secondary)]">
          {sparResult.attackerName} vs {sparResult.defenderName}
          {sparResult.isDraw && ' -- 100 rounds, no winner'}
        </p>
        <div className="flex items-center justify-center gap-3 mt-2">
          <button
            type="button"
            onClick={() => setSparResult(null)}
            className="text-xs text-[var(--rpg-text-secondary)] underline"
          >
            Dismiss
          </button>
        </div>
      </div>
    </PixelCard>
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <ScreenContainer>
      <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">
        Friends
      </h2>

      {error && <ErrorBanner message={error} />}

      {/* Spar combat playback */}
      {sparPlaybackActive && sparResult && (
        <PlaybackSurface
          mode="stage"
          title="Friendly Spar"
          subtitle={`${sparResult.attackerName} vs ${sparResult.defenderName}`}
          autoScrollOnActive
          className="mb-4"
        >
          <CombatPlayback
            mobDisplayName={sparResult.defenderName}
            outcome={sparResult.isDraw ? 'draw' : sparResult.winnerId === playerId ? 'victory' : 'defeat'}
            playerMaxHp={sparResult.combat.combatantAMaxHp}
            playerStartHp={sparResult.combat.attackerStartHp}
            playerStartStamina={sparResult.combat.attackerStartStamina}
            playerStartMana={sparResult.combat.attackerStartMana}
            playerMaxStamina={sparResult.combat.combatantAMaxStamina}
            playerMaxMana={sparResult.combat.combatantAMaxMana}
            mobMaxHp={sparResult.combat.combatantBMaxHp}
            opponentMaxStamina={sparResult.combat.combatantBMaxStamina}
            opponentMaxMana={sparResult.combat.combatantBMaxMana}
            log={sparResult.combat.log}
            playerLabel={sparResult.attackerName}
            showOpponentResources
            defeatButtonLabel="Continue"
            speedMs={combatSpeedMs}
            onComplete={dismissSparPlayback}
            onSkip={dismissSparPlayback}
          />
        </PlaybackSurface>
      )}

      {/* Spar result summary (after playback) */}
      {sparResultSummary}

      {/* Add Friend search */}
      <PixelCard padding="sm">
        <p className="text-sm font-almendra text-[var(--rpg-text-secondary)] mb-2">
          Add Friend
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter username..."
            value={searchUsername}
            onChange={(e) => setSearchUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSearch();
            }}
            className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--rpg-background)] border border-[var(--rpg-border)] text-sm text-[var(--rpg-text-primary)] placeholder:text-[var(--rpg-text-secondary)]/50 outline-none focus:border-[var(--rpg-gold)]"
          />
          <PixelButton
            size="sm"
            variant="gold"
            disabled={!searchUsername.trim() || searchLoading}
            onClick={() => void handleSearch()}
          >
            {searchLoading ? 'Searching...' : 'Search'}
          </PixelButton>
        </div>

        {/* Search result */}
        {searchResult && (
          <div className="mt-2 flex items-center justify-between gap-2 p-2 rounded-lg bg-[var(--rpg-background)] border border-[var(--rpg-border)]">
            <div className="text-sm">
              <span className="text-[var(--rpg-text-primary)]">
                {searchResult.username}
              </span>
              <span className="ml-2 text-[var(--rpg-text-secondary)]">
                Lv.{searchResult.characterLevel}
              </span>
            </div>
            <PixelButton
              size="sm"
              variant="primary"
              disabled={actionBusy || searchResult.id === playerId}
              onClick={() => void handleSendRequest()}
            >
              Add Friend
            </PixelButton>
          </div>
        )}

        {searchError && (
          <p className="mt-2 text-sm text-[var(--rpg-red)]">{searchError}</p>
        )}
      </PixelCard>

      {/* View tabs */}
      <SubNav
        tabs={tabs}
        activeId={activeView}
        onSelect={(id) => setActiveView(id as FriendsView)}
      />

      {/* Friends List */}
      {activeView === 'list' && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--rpg-text-secondary)]">
            {friends.length} / {FRIEND_CONSTANTS.MAX_FRIENDS} friends
          </p>

          {sortedFriends.length === 0 ? (
            <PixelCard>
              <p className="text-sm text-[var(--rpg-text-secondary)]">
                No friends yet. Search for a player above to send a friend request.
              </p>
            </PixelCard>
          ) : (
            sortedFriends.map((f) => (
              <PixelCard
                key={f.friendshipId}
                padding="sm"
                className="cursor-pointer hover:border-[var(--rpg-gold)] transition-colors"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedFriendshipId(f.friendshipId)}
                onKeyDown={handleKeyActivate(() => setSelectedFriendshipId(f.friendshipId))}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Online indicator */}
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: f.isOnline
                          ? 'var(--rpg-green-light)'
                          : 'var(--rpg-text-secondary)',
                      }}
                    />
                    <span className="text-sm text-[var(--rpg-text-primary)] truncate">
                      {f.username}
                    </span>
                    <span className="text-xs text-[var(--rpg-text-secondary)] flex-shrink-0">
                      Lv.{f.characterLevel}
                    </span>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <PixelButton
                      size="sm"
                      variant="danger"
                      disabled={actionBusy}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmAction({ type: 'remove', friendId: f.friendshipId, name: f.username });
                      }}
                    >
                      Remove
                    </PixelButton>
                    <PixelButton
                      size="sm"
                      variant="secondary"
                      disabled={actionBusy}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmAction({ type: 'block', friendId: f.playerId, name: f.username });
                      }}
                    >
                      Block
                    </PixelButton>
                  </div>
                </div>
              </PixelCard>
            ))
          )}
        </div>
      )}

      {/* Incoming Requests */}
      {activeView === 'incoming' && (
        <div className="space-y-2">
          {incomingRequests.length === 0 ? (
            <PixelCard>
              <p className="text-sm text-[var(--rpg-text-secondary)]">
                No incoming friend requests.
              </p>
            </PixelCard>
          ) : (
            incomingRequests.map((r) => (
              <PixelCard key={r.friendshipId} padding="sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm text-[var(--rpg-text-primary)]">
                      {r.username}
                    </span>
                    <span className="ml-2 text-xs text-[var(--rpg-text-secondary)]">
                      Lv.{r.characterLevel}
                    </span>
                    <span className="ml-2 text-xs text-[var(--rpg-text-secondary)]">
                      {relativeTime(r.createdAt)}
                    </span>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <PixelButton
                      size="sm"
                      variant="primary"
                      disabled={actionBusy}
                      onClick={() => void handleAccept(r.friendshipId)}
                    >
                      Accept
                    </PixelButton>
                    <PixelButton
                      size="sm"
                      variant="danger"
                      disabled={actionBusy}
                      onClick={() => void handleDecline(r.friendshipId)}
                    >
                      Decline
                    </PixelButton>
                  </div>
                </div>
              </PixelCard>
            ))
          )}
        </div>
      )}

      {/* Outgoing Requests */}
      {activeView === 'outgoing' && (
        <div className="space-y-2">
          {outgoingRequests.length === 0 ? (
            <PixelCard>
              <p className="text-sm text-[var(--rpg-text-secondary)]">
                No outgoing friend requests.
              </p>
            </PixelCard>
          ) : (
            outgoingRequests.map((r) => (
              <PixelCard key={r.friendshipId} padding="sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm text-[var(--rpg-text-primary)]">
                      {r.username}
                    </span>
                    <span className="ml-2 text-xs text-[var(--rpg-text-secondary)]">
                      Lv.{r.characterLevel}
                    </span>
                    <span className="ml-2 text-xs text-[var(--rpg-text-secondary)]">
                      {relativeTime(r.createdAt)}
                    </span>
                  </div>
                  <PixelButton
                    size="sm"
                    variant="danger"
                    disabled={actionBusy}
                    onClick={() => void handleDecline(r.friendshipId)}
                  >
                    Cancel
                  </PixelButton>
                </div>
              </PixelCard>
            ))
          )}
        </div>
      )}

      {/* Blocked Players */}
      {activeView === 'blocked' && (
        <div className="space-y-2">
          {blocks.length === 0 ? (
            <PixelCard>
              <p className="text-sm text-[var(--rpg-text-secondary)]">
                No blocked players.
              </p>
            </PixelCard>
          ) : (
            blocks.map((b) => (
              <PixelCard key={b.blockId} padding="sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-[var(--rpg-text-primary)]">
                    {b.username}
                  </span>
                  <PixelButton
                    size="sm"
                    variant="secondary"
                    disabled={actionBusy}
                    onClick={() => void handleUnblock(b.blockId)}
                  >
                    Unblock
                  </PixelButton>
                </div>
              </PixelCard>
            ))
          )}
        </div>
      )}

      <RefreshingIndicator show={refreshing} />

      {selectedFriendshipId && (
        <FriendProfileModal
          friendshipId={selectedFriendshipId}
          onClose={() => setSelectedFriendshipId(null)}
          onSpar={handleSpar}
          onSendMail={handleSendMail}
          onUnfriend={() => {
            setSelectedFriendshipId(null);
            void loadFriends(true);
            onFriendCountsChanged?.();
          }}
          onBlock={() => {
            setSelectedFriendshipId(null);
            void loadFriends(true);
            onFriendCountsChanged?.();
          }}
        />
      )}

      {confirmAction && (
        <ConfirmModal
          title={confirmAction.type === 'remove' ? 'Remove Friend?' : 'Block Player?'}
          message={confirmAction.type === 'remove'
            ? `Remove ${confirmAction.name} from your friends list?`
            : `Block ${confirmAction.name}? They won't be able to send you messages or friend requests.`}
          confirmLabel={confirmAction.type === 'remove' ? 'Remove' : 'Block'}
          variant="danger"
          onConfirm={() => {
            const { type, friendId } = confirmAction;
            setConfirmAction(null);
            type === 'remove' ? void handleUnfriend(friendId) : void handleBlock(friendId);
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </ScreenContainer>
  );
}
