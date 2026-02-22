'use client';

import { useCallback, useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { Pagination } from '@/components/common/Pagination';
import {
  getPlayerGuild, createGuild, searchGuilds, joinGuild, leaveGuild,
  kickGuildMember, promoteGuildMember, demoteGuildMember,
  transferGuildLeadership, disbandGuild, updateGuildSettings, getGuildLog,
  getGuildUpgrades, activateGuildUpgrade, getGuildContracts,
  type PlayerGuildResponse, type GuildResponse, type GuildMemberResponse,
  type GuildLogResponse, type GuildUpgradesResponse, type GuildContractsResponse,
} from '@/lib/api';
import { GuildProjectsTab } from '@/components/guild/GuildProjectsTab';
import { GuildSpecializationTab } from '@/components/guild/GuildSpecializationTab';
import { GUILD_CONSTANTS } from '@adventure/shared';
const formatNumber = (n: number) => n.toLocaleString();

type GuildTab = 'overview' | 'members' | 'upgrades' | 'contracts' | 'projects' | 'specialization' | 'log' | 'settings';

interface GuildScreenProps {
  playerId: string | null;
  characterLevel: number;
  onTurnsChanged: () => void;
}

export function GuildScreen({ playerId, characterLevel, onTurnsChanged }: GuildScreenProps) {
  const [guildData, setGuildData] = useState<PlayerGuildResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<GuildTab>('overview');

  const loadGuild = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPlayerGuild();
      if (res.error) { setError(res.error.message); return; }
      setGuildData(res.data ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load guild');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGuild();
  }, [loadGuild]);

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-[var(--rpg-text-primary)]">Guild</h2>
        <PixelCard><p className="text-sm opacity-60">Loading...</p></PixelCard>
      </div>
    );
  }

  if (!guildData) {
    return (
      <NoGuildView
        playerId={playerId}
        characterLevel={characterLevel}
        error={error}
        onGuildJoined={() => { void loadGuild(); onTurnsChanged(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-[var(--rpg-text-primary)]">
        [{guildData.guild.tag}] {guildData.guild.name}
      </h2>

      {error && (
        <div className="p-3 rounded bg-[var(--rpg-red)]/10 border border-[var(--rpg-red)] text-[var(--rpg-red)] text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['overview', 'members', 'upgrades', 'contracts', 'projects', 'specialization', 'log', ...(guildData.role === 'leader' || guildData.role === 'officer' ? ['settings'] : [])] as GuildTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors capitalize ${
              activeTab === tab
                ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <GuildOverview guild={guildData.guild} members={guildData.members} />}
      {activeTab === 'members' && (
        <GuildMembers
          guild={guildData.guild}
          members={guildData.members}
          myRole={guildData.role}
          playerId={playerId}
          onRefresh={loadGuild}
          setError={setError}
        />
      )}
      {activeTab === 'upgrades' && (
        <GuildUpgradesTab guildId={guildData.guild.id} myRole={guildData.role} setError={setError} />
      )}
      {activeTab === 'contracts' && (
        <GuildContractsTab guildId={guildData.guild.id} />
      )}
      {activeTab === 'projects' && (
        <GuildProjectsTab guildId={guildData.guild.id} myRole={guildData.role} setError={setError} onTurnsChanged={onTurnsChanged} />
      )}
      {activeTab === 'specialization' && (
        <GuildSpecializationTab guildId={guildData.guild.id} guildLevel={guildData.guild.level} myRole={guildData.role} setError={setError} />
      )}
      {activeTab === 'log' && <GuildActivityLog guildId={guildData.guild.id} />}
      {activeTab === 'settings' && (
        <GuildSettings
          guild={guildData.guild}
          myRole={guildData.role}
          playerId={playerId}
          onRefresh={loadGuild}
          setError={setError}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// No Guild View (search + create)
// ---------------------------------------------------------------------------

function NoGuildView({
  playerId,
  characterLevel,
  error,
  onGuildJoined,
}: {
  playerId: string | null;
  characterLevel: number;
  error: string | null;
  onGuildJoined: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GuildResponse[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchPage, setSearchPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Create form
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [description, setDescription] = useState('');

  const handleSearch = useCallback(async (page = 1) => {
    setSearching(true);
    setActionError(null);
    try {
      const res = await searchGuilds(searchQuery || undefined, page);
      if (res.error) { setActionError(res.error.message); return; }
      setSearchResults(res.data?.guilds ?? []);
      setSearchTotal(res.data?.total ?? 0);
      setSearchPage(page);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    void handleSearch(1);
  }, [handleSearch]);

  const handleCreate = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await createGuild(name, tag, description || null);
      if (res.error) { setActionError(res.error.message); return; }
      onGuildJoined();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to create guild');
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoin = async (guildId: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await joinGuild(guildId);
      if (res.error) { setActionError(res.error.message); return; }
      onGuildJoined();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to join guild');
    } finally {
      setActionLoading(false);
    }
  };

  const canCreate = characterLevel >= GUILD_CONSTANTS.CREATION_MIN_LEVEL;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-[var(--rpg-text-primary)]">Guild</h2>

      {(error || actionError) && (
        <div className="p-3 rounded bg-[var(--rpg-red)]/10 border border-[var(--rpg-red)] text-[var(--rpg-red)] text-sm">
          {error || actionError}
        </div>
      )}

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
          <h3 className="text-lg font-bold text-[var(--rpg-text-primary)] mb-3">Create Guild</h3>
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
        <h3 className="text-lg font-bold text-[var(--rpg-text-primary)] mb-3">Find Guilds</h3>
        <div className="flex gap-2 mb-3">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 p-2 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded text-sm text-[var(--rpg-text-primary)]"
            placeholder="Search by name or tag..."
            onKeyDown={(e) => e.key === 'Enter' && handleSearch(1)}
          />
          <PixelButton onClick={() => handleSearch(1)} disabled={searching}>
            Search
          </PixelButton>
        </div>

        {searching ? (
          <p className="text-sm opacity-60">Searching...</p>
        ) : searchResults.length === 0 ? (
          <p className="text-sm text-[var(--rpg-text-secondary)]">No guilds found.</p>
        ) : (
          <div className="space-y-2">
            {searchResults.map((guild) => (
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
                    {guild.minLevelRequirement > 0 && ` · Min Level ${guild.minLevelRequirement}`}
                  </p>
                  {guild.description && (
                    <p className="text-xs text-[var(--rpg-text-secondary)] mt-1">{guild.description}</p>
                  )}
                </div>
                {guild.recruitmentMode === 'open' && (
                  <PixelButton
                    onClick={() => handleJoin(guild.id)}
                    disabled={actionLoading || characterLevel < (guild.minLevelRequirement || GUILD_CONSTANTS.JOIN_MIN_LEVEL)}
                  >
                    Join
                  </PixelButton>
                )}
                {guild.recruitmentMode !== 'open' && (
                  <span className="text-xs text-[var(--rpg-text-secondary)] capitalize">{guild.recruitmentMode.replace('_', ' ')}</span>
                )}
              </div>
            ))}
            {searchTotal > GUILD_CONSTANTS.LOG_PAGE_SIZE && (
              <Pagination
                page={searchPage}
                totalPages={Math.ceil(searchTotal / GUILD_CONSTANTS.LOG_PAGE_SIZE)}
                onPageChange={(p) => handleSearch(p)}
              />
            )}
          </div>
        )}
      </PixelCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guild Overview
// ---------------------------------------------------------------------------

function GuildOverview({ guild, members }: { guild: GuildResponse; members: GuildMemberResponse[] }) {
  const activeCount = members.filter((m) => m.isActive).length;
  const xpNum = BigInt(guild.xp);
  const xpForNext = Math.floor(GUILD_CONSTANTS.XP_PER_LEVEL_BASE * guild.level ** GUILD_CONSTANTS.XP_PER_LEVEL_EXPONENT);
  const xpPercent = xpForNext > 0 ? Math.min(100, Number(xpNum * BigInt(100) / BigInt(xpForNext))) : 0;

  return (
    <div className="space-y-3">
      <PixelCard>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-[var(--rpg-text-secondary)]">Level</span>
            <p className="font-bold text-[var(--rpg-gold)]">{guild.level}</p>
          </div>
          <div>
            <span className="text-[var(--rpg-text-secondary)]">Members</span>
            <p className="font-bold">{guild.memberCount}/{guild.maxMembers}</p>
          </div>
          <div>
            <span className="text-[var(--rpg-text-secondary)]">Treasury</span>
            <p className="font-bold">{formatNumber(guild.treasuryTurns)}/{formatNumber(guild.treasuryCap)}</p>
          </div>
          <div>
            <span className="text-[var(--rpg-text-secondary)]">Tax Rate</span>
            <p className="font-bold">{guild.taxRate}%</p>
          </div>
          <div>
            <span className="text-[var(--rpg-text-secondary)]">Active Members</span>
            <p className="font-bold text-[var(--rpg-green-light)]">{activeCount}/{guild.memberCount}</p>
          </div>
          <div>
            <span className="text-[var(--rpg-text-secondary)]">Renown</span>
            <p className="font-bold">{formatNumber(guild.renown)}</p>
          </div>
        </div>
      </PixelCard>

      <PixelCard>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-[var(--rpg-text-secondary)]">Guild XP</span>
          <span className="text-[var(--rpg-text-secondary)]">{xpNum.toString()}/{formatNumber(xpForNext)}</span>
        </div>
        <div className="w-full h-3 bg-[var(--rpg-background)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--rpg-gold)] transition-all"
            style={{ width: `${xpPercent}%` }}
          />
        </div>
      </PixelCard>

      {guild.description && (
        <PixelCard>
          <p className="text-sm text-[var(--rpg-text-secondary)]">{guild.description}</p>
        </PixelCard>
      )}

      {guild.specialization && (
        <PixelCard>
          <span className="text-[var(--rpg-text-secondary)] text-sm">Specialization</span>
          <p className="font-bold capitalize text-[var(--rpg-purple)]">{guild.specialization}</p>
        </PixelCard>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Members Tab
// ---------------------------------------------------------------------------

function GuildMembers({
  guild,
  members,
  myRole,
  playerId,
  onRefresh,
  setError,
}: {
  guild: GuildResponse;
  members: GuildMemberResponse[];
  myRole: string;
  playerId: string | null;
  onRefresh: () => void;
  setError: (err: string | null) => void;
}) {
  const [actionLoading, setActionLoading] = useState(false);
  const isLeader = myRole === 'leader';
  const isOfficer = myRole === 'officer' || isLeader;

  const handleAction = async (action: string, targetId: string) => {
    setActionLoading(true);
    setError(null);
    try {
      let res: { error?: { message: string } } = {};
      switch (action) {
        case 'kick': res = await kickGuildMember(guild.id, targetId); break;
        case 'promote': res = await promoteGuildMember(guild.id, targetId); break;
        case 'demote': res = await demoteGuildMember(guild.id, targetId); break;
        case 'transfer': res = await transferGuildLeadership(guild.id, targetId); break;
      }
      if (res.error) { setError(res.error.message); return; }
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm('Are you sure you want to leave this guild?')) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await leaveGuild(guild.id);
      if (res.error) { setError(res.error.message); return; }
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to leave');
    } finally {
      setActionLoading(false);
    }
  };

  const roleColor = (role: string) => {
    switch (role) {
      case 'leader': return 'text-[var(--rpg-gold)]';
      case 'officer': return 'text-[var(--rpg-blue-light)]';
      default: return 'text-[var(--rpg-text-secondary)]';
    }
  };

  return (
    <div className="space-y-2">
      {members.map((member) => (
        <PixelCard key={member.playerId}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-bold text-[var(--rpg-text-primary)]">
                {member.username}
                <span className={`ml-2 text-xs capitalize ${roleColor(member.role)}`}>{member.role}</span>
                {member.isActive && <span className="ml-2 w-2 h-2 inline-block rounded-full bg-[var(--rpg-green-light)]" />}
              </p>
              <p className="text-xs text-[var(--rpg-text-secondary)]">
                Level {member.characterLevel} &middot; Contributed {formatNumber(member.totalTurnsContributed)} turns
              </p>
            </div>
            {member.playerId !== playerId && isOfficer && member.role !== 'leader' && (
              <div className="flex gap-1 flex-shrink-0">
                {isLeader && member.role === 'member' && (
                  <button
                    onClick={() => handleAction('promote', member.playerId)}
                    disabled={actionLoading}
                    className="text-xs px-2 py-1 rounded bg-[var(--rpg-blue-light)]/20 text-[var(--rpg-blue-light)]"
                  >
                    Promote
                  </button>
                )}
                {isLeader && member.role === 'officer' && (
                  <button
                    onClick={() => handleAction('demote', member.playerId)}
                    disabled={actionLoading}
                    className="text-xs px-2 py-1 rounded bg-[var(--rpg-text-secondary)]/20 text-[var(--rpg-text-secondary)]"
                  >
                    Demote
                  </button>
                )}
                {(isLeader || (myRole === 'officer' && member.role === 'member')) && (
                  <button
                    onClick={() => handleAction('kick', member.playerId)}
                    disabled={actionLoading}
                    className="text-xs px-2 py-1 rounded bg-[var(--rpg-red)]/20 text-[var(--rpg-red)]"
                  >
                    Kick
                  </button>
                )}
                {isLeader && (
                  <button
                    onClick={() => {
                      if (confirm(`Transfer leadership to ${member.username}?`)) {
                        void handleAction('transfer', member.playerId);
                      }
                    }}
                    disabled={actionLoading}
                    className="text-xs px-2 py-1 rounded bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)]"
                  >
                    Transfer
                  </button>
                )}
              </div>
            )}
          </div>
        </PixelCard>
      ))}

      {myRole !== 'leader' && (
        <div className="pt-2">
          <PixelButton onClick={handleLeave} disabled={actionLoading}>
            Leave Guild
          </PixelButton>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Log Tab
// ---------------------------------------------------------------------------

function GuildActivityLog({ guildId }: { guildId: string }) {
  const [logData, setLogData] = useState<GuildLogResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadLog = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await getGuildLog(guildId, p);
      if (res.data) { setLogData(res.data); setPage(p); }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    void loadLog(1);
  }, [loadLog]);

  if (loading && !logData) {
    return <PixelCard><p className="text-sm opacity-60">Loading...</p></PixelCard>;
  }

  return (
    <div className="space-y-2">
      {logData?.entries.map((entry) => (
        <div key={entry.id} className="p-2 bg-[var(--rpg-background)] rounded border border-[var(--rpg-border)]">
          <p className="text-sm text-[var(--rpg-text-primary)]">{entry.message}</p>
          <p className="text-xs text-[var(--rpg-text-secondary)]">
            {new Date(entry.createdAt).toLocaleString()}
          </p>
        </div>
      ))}

      {logData && logData.total > GUILD_CONSTANTS.LOG_PAGE_SIZE && (
        <Pagination
          page={page}
          totalPages={Math.ceil(logData.total / GUILD_CONSTANTS.LOG_PAGE_SIZE)}
          onPageChange={(p) => loadLog(p)}
        />
      )}

      {logData?.entries.length === 0 && (
        <PixelCard><p className="text-sm text-[var(--rpg-text-secondary)]">No activity yet.</p></PixelCard>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upgrades Tab
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

function formatTimeRemaining(expiresAt: string): string {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return 'Expired';
  return formatDuration(remaining);
}

const EFFECT_LABELS: Record<string, string> = {
  xp_boost: 'Skill XP',
  gathering_yield: 'Gathering Yield',
  crafting_crit: 'Crafting Crit',
  combat_damage: 'Combat Damage',
  defense_boost: 'Defense',
};

function GuildUpgradesTab({
  guildId,
  myRole,
  setError,
}: {
  guildId: string;
  myRole: string;
  setError: (err: string | null) => void;
}) {
  const [data, setData] = useState<GuildUpgradesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);

  const isOfficer = myRole === 'leader' || myRole === 'officer';

  const loadUpgrades = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getGuildUpgrades(guildId);
      if (res.data) setData(res.data);
    } catch { /* */ } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => { void loadUpgrades(); }, [loadUpgrades]);

  const handleActivate = async (upgradeKey: string, tier: number) => {
    setActivating(true);
    setError(null);
    try {
      const res = await activateGuildUpgrade(guildId, upgradeKey, tier);
      if (res.error) { setError(res.error.message); return; }
      void loadUpgrades();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to activate');
    } finally {
      setActivating(false);
    }
  };

  if (loading && !data) return <PixelCard><p className="text-sm opacity-60">Loading...</p></PixelCard>;

  return (
    <div className="space-y-3">
      {data?.available.map((upgrade) => (
        <PixelCard key={upgrade.key}>
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-sm font-bold text-[var(--rpg-text-primary)]">{upgrade.name}</p>
              <p className="text-xs text-[var(--rpg-text-secondary)]">{EFFECT_LABELS[upgrade.effectType] ?? upgrade.effectType}</p>
            </div>
            {upgrade.activeUpgrade && (
              <span className="text-xs px-2 py-0.5 rounded bg-[var(--rpg-green-light)]/20 text-[var(--rpg-green-light)]">
                Active &middot; {formatTimeRemaining(upgrade.activeUpgrade.expiresAt)}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {upgrade.tiers.map((tier) => (
              <div key={tier.level} className="flex items-center justify-between text-xs p-2 bg-[var(--rpg-background)] rounded">
                <div>
                  <span className="text-[var(--rpg-text-secondary)]">Tier {tier.level}</span>
                  <span className="ml-2 text-[var(--rpg-gold)]">+{Math.round(tier.effectValue * 100)}%</span>
                  <span className="ml-2 text-[var(--rpg-text-secondary)]">{formatDuration(tier.durationMs)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--rpg-text-secondary)]">{formatNumber(tier.cost)} turns</span>
                  {isOfficer && (
                    <button
                      onClick={() => handleActivate(upgrade.key, tier.level)}
                      disabled={activating || !tier.available}
                      className={`px-2 py-0.5 rounded text-xs ${
                        tier.available
                          ? 'bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)]'
                          : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] opacity-50'
                      }`}
                      title={tier.reason}
                    >
                      Activate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </PixelCard>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contracts Tab
// ---------------------------------------------------------------------------

function GuildContractsTab({ guildId }: { guildId: string }) {
  const [data, setData] = useState<GuildContractsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadContracts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getGuildContracts(guildId);
      if (res.data) setData(res.data);
    } catch { /* */ } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => { void loadContracts(); }, [loadContracts]);

  if (loading && !data) return <PixelCard><p className="text-sm opacity-60">Loading...</p></PixelCard>;

  if (!data?.contracts.length) {
    return <PixelCard><p className="text-sm text-[var(--rpg-text-secondary)]">No active contracts this week.</p></PixelCard>;
  }

  return (
    <div className="space-y-3">
      {data.contracts.map((contract) => {
        const progress = Math.min(100, Math.floor((contract.currentValue / contract.targetValue) * 100));
        const isComplete = contract.status === 'completed';
        return (
          <PixelCard key={contract.id}>
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-sm font-bold text-[var(--rpg-text-primary)]">{contract.name}</p>
                <p className="text-xs text-[var(--rpg-text-secondary)]">
                  {formatNumber(contract.currentValue)} / {formatNumber(contract.targetValue)}
                </p>
              </div>
              {isComplete ? (
                <span className="text-xs px-2 py-0.5 rounded bg-[var(--rpg-green-light)]/20 text-[var(--rpg-green-light)]">Complete</span>
              ) : (
                <span className="text-xs text-[var(--rpg-text-secondary)]">{formatTimeRemaining(contract.expiresAt)}</span>
              )}
            </div>
            <div className="w-full h-2 bg-[var(--rpg-background)] rounded-full overflow-hidden mb-1.5">
              <div
                className={`h-full transition-all ${isComplete ? 'bg-[var(--rpg-green-light)]' : 'bg-[var(--rpg-gold)]'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex gap-3 text-xs text-[var(--rpg-text-secondary)]">
              <span>+{contract.rewardGuildXp} Guild XP</span>
              <span>+{formatNumber(contract.rewardTreasuryTurns)} Treasury</span>
            </div>
          </PixelCard>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings Tab
// ---------------------------------------------------------------------------

function GuildSettings({
  guild,
  myRole,
  playerId,
  onRefresh,
  setError,
}: {
  guild: GuildResponse;
  myRole: string;
  playerId: string | null;
  onRefresh: () => void;
  setError: (err: string | null) => void;
}) {
  const [recruitmentMode, setRecruitmentMode] = useState(guild.recruitmentMode);
  const [taxRate, setTaxRate] = useState(guild.taxRate);
  const [minLevel, setMinLevel] = useState(guild.minLevelRequirement);
  const [desc, setDesc] = useState(guild.description || '');
  const [saving, setSaving] = useState(false);
  const [disbanding, setDisbanding] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await updateGuildSettings(guild.id, {
        recruitmentMode,
        taxRate,
        minLevelRequirement: minLevel,
        description: desc || null,
      });
      if (res.error) { setError(res.error.message); return; }
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDisband = async () => {
    if (!confirm('Are you sure you want to DISBAND this guild? This cannot be undone!')) return;
    if (!confirm('This will remove ALL members. Are you absolutely sure?')) return;
    setDisbanding(true);
    setError(null);
    try {
      const res = await disbandGuild(guild.id);
      if (res.error) { setError(res.error.message); return; }
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to disband');
    } finally {
      setDisbanding(false);
    }
  };

  return (
    <div className="space-y-3">
      <PixelCard>
        <h3 className="text-lg font-bold text-[var(--rpg-text-primary)] mb-3">Guild Settings</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-[var(--rpg-text-secondary)]">Recruitment Mode</label>
            <select
              value={recruitmentMode}
              onChange={(e) => setRecruitmentMode(e.target.value)}
              className="w-full mt-1 p-2 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded text-sm text-[var(--rpg-text-primary)]"
            >
              <option value="open">Open</option>
              <option value="invite_only">Invite Only</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-[var(--rpg-text-secondary)]">Tax Rate (0-{GUILD_CONSTANTS.MAX_TAX_RATE}%)</label>
            <input
              type="number"
              value={taxRate}
              onChange={(e) => setTaxRate(Math.min(GUILD_CONSTANTS.MAX_TAX_RATE, Math.max(0, parseInt(e.target.value) || 0)))}
              min={0}
              max={GUILD_CONSTANTS.MAX_TAX_RATE}
              className="w-full mt-1 p-2 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded text-sm text-[var(--rpg-text-primary)]"
            />
          </div>
          <div>
            <label className="text-sm text-[var(--rpg-text-secondary)]">Minimum Level Requirement</label>
            <input
              type="number"
              value={minLevel}
              onChange={(e) => setMinLevel(Math.max(0, parseInt(e.target.value) || 0))}
              min={0}
              max={100}
              className="w-full mt-1 p-2 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded text-sm text-[var(--rpg-text-primary)]"
            />
          </div>
          <div>
            <label className="text-sm text-[var(--rpg-text-secondary)]">Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              maxLength={GUILD_CONSTANTS.MAX_DESCRIPTION_LENGTH}
              rows={2}
              className="w-full mt-1 p-2 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded text-sm text-[var(--rpg-text-primary)] resize-none"
            />
          </div>
          <PixelButton onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </PixelButton>
        </div>
      </PixelCard>

      {myRole === 'leader' && (
        <PixelCard>
          <h3 className="text-lg font-bold text-[var(--rpg-red)] mb-2">Danger Zone</h3>
          <PixelButton onClick={handleDisband} disabled={disbanding}>
            {disbanding ? 'Disbanding...' : 'Disband Guild'}
          </PixelButton>
        </PixelCard>
      )}
    </div>
  );
}
