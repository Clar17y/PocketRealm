'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';
import {
  getActiveSeason,
  getHallOfFame,
  getLeaderboard,
  getLeaderboardCategories,
  getSeasonArchives,
  type HallOfFameEntryResponse,
  type LeaderboardCategoryGroup,
  type LeaderboardResponse,
  type SeasonArchiveSummary,
} from '@/lib/api';
import { titleCaseFromSnake } from '@/lib/format';
import { Trophy } from 'lucide-react';
import { ScreenContainer } from '../common/ScreenContainer';

interface LeaderboardProps {
  playerId: string | null;
  currentSeasonId: string | null;
}

interface SeasonOption {
  id: string;
  name: string;
  status: string;
}

function seasonOptionsFromArchives(
  activeSeason: { id: string; name: string; status: string } | null,
  archives: SeasonArchiveSummary[],
): SeasonOption[] {
  const options = new Map<string, SeasonOption>();

  if (activeSeason) {
    options.set(activeSeason.id, {
      id: activeSeason.id,
      name: activeSeason.name,
      status: activeSeason.status,
    });
  }

  for (const archive of archives ?? []) {
    options.set(archive.season.id, {
      id: archive.season.id,
      name: archive.season.name,
      status: 'archived',
    });
  }

  return [...options.values()];
}

export function Leaderboard({ playerId, currentSeasonId }: LeaderboardProps) {
  const [groups, setGroups] = useState<LeaderboardCategoryGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState('PvP');
  const [activeCategory, setActiveCategory] = useState('pvp_rating');
  const [viewMode, setViewMode] = useState<'rankings' | 'hallOfFame'>('rankings');
  const [rankingsSeasonId, setRankingsSeasonId] = useState<string | null>(currentSeasonId);
  const [hallOfFameSeasonId, setHallOfFameSeasonId] = useState<string>('');
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [hallOfFameEntries, setHallOfFameEntries] = useState<HallOfFameEntryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [hallOfFameLoading, setHallOfFameLoading] = useState(false);
  const [aroundMe, setAroundMe] = useState(false);
  const [activeSeason, setActiveSeason] = useState<SeasonOption | null>(null);
  const [hallOfFameSeasons, setHallOfFameSeasons] = useState<SeasonOption[]>([]);

  useEffect(() => {
    void (async () => {
      const [categoriesRes, activeSeasonRes, archivesRes] = await Promise.all([
        getLeaderboardCategories(),
        getActiveSeason(),
        getSeasonArchives(),
      ]);

      if (categoriesRes.data) {
        setGroups(categoriesRes.data.groups);
      }

      const currentActiveSeason = activeSeasonRes.data?.season
        ? {
            id: activeSeasonRes.data.season.id,
            name: activeSeasonRes.data.season.name,
            status: activeSeasonRes.data.season.status,
          }
        : null;

      setActiveSeason(currentActiveSeason);

      const availableHallOfFameSeasons = seasonOptionsFromArchives(
        currentActiveSeason,
        archivesRes.data?.archives ?? [],
      );

      setHallOfFameSeasons(availableHallOfFameSeasons);
      setHallOfFameSeasonId((selected) => selected || currentSeasonId || availableHallOfFameSeasons[0]?.id || '');
    })();
  }, [currentSeasonId]);

  useEffect(() => {
    setRankingsSeasonId(currentSeasonId);
  }, [currentSeasonId]);

  const loadData = useCallback(async (category: string, showAroundMe: boolean, seasonId: string | null) => {
    setLoading(true);
    const res = await getLeaderboard(category, showAroundMe, seasonId);
    if (res.data) {
      setData(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (viewMode !== 'rankings') return;
    void loadData(activeCategory, aroundMe, rankingsSeasonId);
  }, [activeCategory, aroundMe, loadData, rankingsSeasonId, viewMode]);

  useEffect(() => {
    if (viewMode !== 'hallOfFame' || !hallOfFameSeasonId) return;

    void (async () => {
      setHallOfFameLoading(true);
      const res = await getHallOfFame(hallOfFameSeasonId);
      if (res.data) {
        setHallOfFameEntries(res.data.entries);
      }
      setHallOfFameLoading(false);
    })();
  }, [hallOfFameSeasonId, viewMode]);

  const currentGroupCategories = groups.find((group) => group.name === activeGroup)?.categories ?? [];
  const rankingsRealms = useMemo(
    () => [
      { id: 'permanent', label: 'Permanent Realm', seasonId: null as string | null },
      ...(activeSeason ? [{ id: activeSeason.id, label: activeSeason.name, seasonId: activeSeason.id }] : []),
    ],
    [activeSeason],
  );
  const hallOfFameByCategory = useMemo(() => {
    const grouped = new Map<string, HallOfFameEntryResponse[]>();

    for (const entry of hallOfFameEntries) {
      const current = grouped.get(entry.category) ?? [];
      current.push(entry);
      grouped.set(entry.category, current);
    }

    return [...grouped.entries()].map(([category, entries]) => ({
      category,
      entries: entries.sort((left, right) => left.rank - right.rank),
    }));
  }, [hallOfFameEntries]);

  return (
    <ScreenContainer>
      <div className="flex items-center gap-2">
        <Trophy className="w-5 h-5 text-[var(--rpg-gold)]" />
        <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">Leaderboards</h2>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setViewMode('rankings')}
          className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
            viewMode === 'rankings'
              ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
              : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
          }`}
        >
          Rankings
        </button>
        <button
          type="button"
          onClick={() => setViewMode('hallOfFame')}
          className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
            viewMode === 'hallOfFame'
              ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
              : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
          }`}
        >
          Hall of Fame
        </button>
      </div>

      {viewMode === 'rankings' && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {rankingsRealms.map((realm) => (
              <button
                key={realm.id}
                type="button"
                onClick={() => {
                  setRankingsSeasonId(realm.seasonId);
                  setAroundMe(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  rankingsSeasonId === realm.seasonId
                    ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                    : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
                }`}
              >
                {realm.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {groups.map((group) => (
              <button
                key={group.name}
                onClick={() => {
                  setActiveGroup(group.name);
                  setActiveCategory(group.categories[0].slug);
                  setAroundMe(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  activeGroup === group.name
                    ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                    : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
                }`}
              >
                {group.name}
              </button>
            ))}
          </div>

          {currentGroupCategories.length > 1 && (
            <select
              value={activeCategory}
              onChange={(event) => {
                setActiveCategory(event.target.value);
                setAroundMe(false);
              }}
              className="w-full px-3 py-2 rounded-lg bg-[var(--rpg-surface)] text-[var(--rpg-text-primary)] border border-[var(--rpg-border)] text-sm"
            >
              {currentGroupCategories.map((category) => (
                <option key={category.slug} value={category.slug}>{category.label}</option>
              ))}
            </select>
          )}

          <PixelCard>
            <LeaderboardTable
              entries={data?.entries ?? []}
              myRank={data?.myRank ?? null}
              currentPlayerId={playerId}
              loading={loading}
              totalPlayers={data?.totalPlayers ?? 0}
              lastRefreshedAt={data?.lastRefreshedAt ?? null}
              showAroundMe={aroundMe}
              onToggleAroundMe={() => setAroundMe((value) => !value)}
              isGuildCategory={activeGroup === 'Guilds'}
            />
          </PixelCard>
        </>
      )}

      {viewMode === 'hallOfFame' && (
        <>
          {hallOfFameSeasons.length > 0 ? (
            <select
              value={hallOfFameSeasonId}
              onChange={(event) => setHallOfFameSeasonId(event.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--rpg-surface)] text-[var(--rpg-text-primary)] border border-[var(--rpg-border)] text-sm"
            >
              {hallOfFameSeasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          ) : null}

          {hallOfFameSeasons.length === 0 && (
            <PixelCard>
              <p className="text-sm text-[var(--rpg-text-secondary)]">No seasonal results are archived yet.</p>
            </PixelCard>
          )}

          {hallOfFameSeasons.length > 0 && hallOfFameLoading && (
            <PixelCard>
              <p className="text-sm text-[var(--rpg-text-secondary)]">Loading hall of fame...</p>
            </PixelCard>
          )}

          {hallOfFameSeasons.length > 0 && !hallOfFameLoading && hallOfFameByCategory.length === 0 && (
            <PixelCard>
              <p className="text-sm text-[var(--rpg-text-secondary)]">No hall of fame entries recorded for this season.</p>
            </PixelCard>
          )}

          {hallOfFameByCategory.map(({ category, entries }) => (
            <PixelCard key={category}>
              <h3 className="mb-3 text-sm font-bold text-[var(--rpg-text-primary)]">
                {titleCaseFromSnake(category)}
              </h3>
              <div className="space-y-2">
                {entries.map((entry) => (
                  <div
                    key={`${entry.category}-${entry.rank}-${entry.accountId}`}
                    className="flex items-center justify-between gap-3 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-bold text-[var(--rpg-text-primary)]">
                        #{entry.rank} {entry.username}
                      </p>
                      <p className="text-xs text-[var(--rpg-text-secondary)]">
                        {entry.value.toLocaleString()} points
                      </p>
                    </div>
                    <span className="text-[10px] font-pixel uppercase tracking-wide text-[var(--rpg-gold)]">
                      Legend
                    </span>
                  </div>
                ))}
              </div>
            </PixelCard>
          ))}
        </>
      )}
    </ScreenContainer>
  );
}
