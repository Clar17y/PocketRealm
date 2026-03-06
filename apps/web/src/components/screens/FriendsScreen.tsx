'use client';

import { useCallback, useEffect, useState } from 'react';
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
} from '@/lib/api';
import type { FriendListEntry, FriendRequest, BlockedPlayer } from '@pocketrealm/shared';
import { FRIEND_CONSTANTS } from '@pocketrealm/shared';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { SubNav } from '@/components/common/SubNav';
import { LoadingCard } from '@/components/common/LoadingCard';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FriendsScreenProps {
  playerId: string | null;
  onTurnsChanged: () => void;
  onFriendCountsChanged?: () => void;
  onOpenProfile?: (friendshipId: string) => void;
}

type FriendsView = 'list' | 'incoming' | 'outgoing' | 'blocked';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FriendsScreen({
  playerId,
  onTurnsChanged: _onTurnsChanged,
  onFriendCountsChanged,
  onOpenProfile,
}: FriendsScreenProps) {
  // --- data state ---
  const [friends, setFriends] = useState<FriendListEntry[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [blocks, setBlocks] = useState<BlockedPlayer[]>([]);

  // --- UI state ---
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<FriendsView>('list');

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

  // -----------------------------------------------------------------------
  // Data loaders
  // -----------------------------------------------------------------------

  const loadFriends = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
    }
  }, []);

  const loadIncoming = useCallback(async () => {
    try {
      const res = await getIncomingFriendRequests();
      if (res.error) return;
      setIncomingRequests(res.data?.requests ?? []);
    } catch {
      // silent — tab-specific load
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
      setBlocks(res.data?.blocked ?? []);
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
      void loadFriends();
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
      void loadFriends();
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
      void loadFriends();
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

  if (loading) {
    return (
      <ScreenContainer>
        <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">
          Friends
        </h2>
        <LoadingCard />
      </ScreenContainer>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <ScreenContainer>
      <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">
        Friends
      </h2>

      {error && <ErrorBanner message={error} />}

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
                onClick={() => onOpenProfile?.(f.friendshipId)}
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
                        void handleUnfriend(f.friendshipId);
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
                        void handleBlock(f.playerId);
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
                      {formatRelativeTime(r.createdAt)}
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
                      {formatRelativeTime(r.createdAt)}
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
    </ScreenContainer>
  );
}
