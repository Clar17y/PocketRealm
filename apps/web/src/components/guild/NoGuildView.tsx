'use client';

import { useCallback, useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { DebouncedInput } from '@/components/common/DebouncedInput';
import { Pagination } from '@/components/common/Pagination';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import {
  createGuild, searchGuilds, joinGuild, requestJoinGuild,
  type GuildResponse,
} from '@/lib/api';
import { GUILD_CONSTANTS } from '@adventure/shared';
import { formatNumber } from '@/lib/format';
import { useAsyncAction } from '@/hooks/useAsyncAction';

interface NoGuildViewProps {
  playerId: string | null;
  characterLevel: number;
  error: string | null;
  onGuildJoined: () => void;
}

export function NoGuildView({
  playerId,
  characterLevel,
  error,
  onGuildJoined,
}: NoGuildViewProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GuildResponse[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchPage, setSearchPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const { loading: actionLoading, error: actionError, run } = useAsyncAction();
  const [requestedGuildIds, setRequestedGuildIds] = useState<Set<string>>(new Set());

  // Create form
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [description, setDescription] = useState('');

  const handleSearch = useCallback(async (query: string, page = 1) => {
    setSearching(true);
    setSearchError(null);
    try {
      const res = await searchGuilds(query || undefined, page);
      if (res.error) { setSearchError(res.error.message); return; }
      setSearchResults(res.data?.guilds ?? []);
      setSearchTotal(res.data?.total ?? 0);
      setSearchPage(page);
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    void handleSearch('', 1);
  }, [handleSearch]);

  const handleCreate = () =>
    run(() => createGuild(name, tag, description || null), () => onGuildJoined());

  const handleJoin = (guildId: string) =>
    run(() => joinGuild(guildId), () => onGuildJoined());

  const handleRequest = (guildId: string) =>
    run(() => requestJoinGuild(guildId), () => setRequestedGuildIds((prev) => new Set([...prev, guildId])));

  const canCreate = characterLevel >= GUILD_CONSTANTS.CREATION_MIN_LEVEL;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold font-display text-[var(--rpg-text-primary)]">Guild</h2>

      {(error || actionError || searchError) && <ErrorBanner message={(error || actionError || searchError)!} />}

      <PixelCard>
        <p className="text-sm text-[var(--rpg-text-secondary)] mb-3">
          You are not in a guild. Join an existing guild or create your own.
        </p>
        <PixelButton
          onClick={() => setShowCreate(!showCreate)}
          disabled={!canCreate}
        >
          {showCreate ? 'Cancel' : 'Create Guild'}
        </PixelButton>
        {!canCreate && (
          <p className="text-xs text-[var(--rpg-text-secondary)] mt-1">
            Requires level {GUILD_CONSTANTS.CREATION_MIN_LEVEL} (you are level {characterLevel})
          </p>
        )}
      </PixelCard>

      {showCreate && (
        <PixelCard>
          <h3 className="text-lg font-bold font-display text-[var(--rpg-text-primary)] mb-3">Create Guild</h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-[var(--rpg-text-secondary)]">Name ({GUILD_CONSTANTS.MIN_NAME_LENGTH}-{GUILD_CONSTANTS.MAX_NAME_LENGTH} chars)</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={GUILD_CONSTANTS.MAX_NAME_LENGTH}
                className="w-full mt-1 p-2 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded text-sm text-[var(--rpg-text-primary)]"
                placeholder="Guild name"
              />
            </div>
            <div>
              <label className="text-sm text-[var(--rpg-text-secondary)]">Tag ({GUILD_CONSTANTS.MIN_TAG_LENGTH}-{GUILD_CONSTANTS.MAX_TAG_LENGTH} chars)</label>
              <input
                value={tag}
                onChange={(e) => setTag(e.target.value.toUpperCase())}
                maxLength={GUILD_CONSTANTS.MAX_TAG_LENGTH}
                className="w-full mt-1 p-2 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded text-sm text-[var(--rpg-text-primary)]"
                placeholder="TAG"
              />
            </div>
            <div>
              <label className="text-sm text-[var(--rpg-text-secondary)]">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={GUILD_CONSTANTS.MAX_DESCRIPTION_LENGTH}
                rows={2}
                className="w-full mt-1 p-2 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded text-sm text-[var(--rpg-text-primary)] resize-none"
                placeholder="A short description..."
              />
            </div>
            <p className="text-xs text-[var(--rpg-text-secondary)]">
              Cost: {formatNumber(GUILD_CONSTANTS.CREATION_TURN_COST)} turns
            </p>
            <PixelButton
              onClick={handleCreate}
              disabled={actionLoading || name.length < GUILD_CONSTANTS.MIN_NAME_LENGTH || tag.length < GUILD_CONSTANTS.MIN_TAG_LENGTH}
            >
              {actionLoading ? 'Creating...' : 'Create Guild'}
            </PixelButton>
          </div>
        </PixelCard>
      )}

      <PixelCard>
        <h3 className="text-lg font-bold font-display text-[var(--rpg-text-primary)] mb-3">Find Guilds</h3>
        <DebouncedInput
          value={searchQuery}
          onChange={setSearchQuery}
          onDebouncedChange={(query) => handleSearch(query, 1)}
          debounceMs={300}
          className="w-full mb-3 p-2 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded text-sm text-[var(--rpg-text-primary)]"
          placeholder="Search by name or tag..."
        />

        {searching ? (
          <p className="text-sm opacity-60">Searching...</p>
        ) : searchResults.length === 0 ? (
          <p className="text-sm text-[var(--rpg-text-secondary)]">No guilds found.</p>
        ) : (
          <div className="space-y-2">
            {characterLevel < GUILD_CONSTANTS.JOIN_MIN_LEVEL && (
              <p className="text-xs text-[var(--rpg-gold)] px-1">
                You must reach level {GUILD_CONSTANTS.JOIN_MIN_LEVEL} to join or request to join a guild.
              </p>
            )}
            {searchResults.map((guild) => {
              const levelDisabled = actionLoading || characterLevel < (guild.minLevelRequirement || GUILD_CONSTANTS.JOIN_MIN_LEVEL);
              return (
              <div
                key={guild.id}
                className="p-3 bg-[var(--rpg-background)] rounded border border-[var(--rpg-border)] flex justify-between items-center"
              >
                <div>
                  <p className="text-sm font-bold text-[var(--rpg-text-primary)]">
                    [{guild.tag}] {guild.name}
                  </p>
                  <p className="text-xs text-[var(--rpg-text-secondary)]">
                    Level {guild.level} &middot; {guild.memberCount}/{guild.maxMembers} members
                    {guild.taxRate > 0 && ` · ${guild.taxRate}% tax`}
                    {guild.minLevelRequirement > 0 && ` · Min Level ${guild.minLevelRequirement}`}
                  </p>
                  {guild.description && (
                    <p className="text-xs text-[var(--rpg-text-secondary)] mt-1">{guild.description}</p>
                  )}
                </div>
                {guild.recruitmentMode === 'open' && (
                  <PixelButton onClick={() => handleJoin(guild.id)} disabled={levelDisabled}>
                    Join
                  </PixelButton>
                )}
                {guild.recruitmentMode === 'request_to_join' && (
                  requestedGuildIds.has(guild.id) ? (
                    <span className="text-xs text-[var(--rpg-green-light)]">Request Sent</span>
                  ) : (
                    <PixelButton onClick={() => handleRequest(guild.id)} disabled={levelDisabled}>
                      Request
                    </PixelButton>
                  )
                )}
                {guild.recruitmentMode === 'closed' && (
                  <span className="text-xs text-[var(--rpg-text-secondary)]">Closed</span>
                )}
              </div>
              );
            })}
            {searchTotal > GUILD_CONSTANTS.LOG_PAGE_SIZE && (
              <Pagination
                page={searchPage}
                totalPages={Math.ceil(searchTotal / GUILD_CONSTANTS.LOG_PAGE_SIZE)}
                onPageChange={(p) => handleSearch(searchQuery, p)}
              />
            )}
          </div>
        )}
      </PixelCard>
    </div>
  );
}
