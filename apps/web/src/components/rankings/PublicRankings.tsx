'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';
import { PixelCard } from '@/components/PixelCard';
import { CrownCollectorsTable } from '@/components/rankings/CrownCollectorsTable';
import { RankingsTabs, type PublicRankingsTab } from '@/components/rankings/RankingsTabs';
import {
  getActiveSeason,
  getCrownCollectors,
  getHallOfFame,
  getLeaderboard,
  getLeaderboardCategories,
  getPublicSeasonArchives,
  type HallOfFameEntryResponse,
  type LeaderboardCategoryGroup,
  type LeaderboardPeriod,
  type LeaderboardResponse,
  type PublicSeasonArchiveSummary,
} from '@/lib/api';
import type { ActiveSeasonResponse } from '@/lib/api/seasons';
import type { CrownCollectorsResponse } from '@/lib/api/social';
import { titleCaseFromSnake } from '@/lib/format';

interface SeasonOption {
  id: string;
  name: string;
}

const DEFAULT_CATEGORY = 'character_xp';
const DEFAULT_GROUP = 'Progression';
const DEFAULT_TAB: PublicRankingsTab = 'leaderboards';

function updateTabQuery(tab: PublicRankingsTab) {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  url.searchParams.set('tab', tab);
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function seasonOptionsFromArchives(archives: PublicSeasonArchiveSummary[]): SeasonOption[] {
  const options = new Map<string, SeasonOption>();

  for (const archive of archives) {
    options.set(archive.id, {
      id: archive.id,
      name: archive.name,
    });
  }

  return [...options.values()];
}

function periodForTab(tab: PublicRankingsTab): LeaderboardPeriod {
  return tab === 'weekly' ? 'weekly' : 'alltime';
}

function preferredCategorySelection(groups: LeaderboardCategoryGroup[]) {
  const preferredGroup = groups.find((group) => group.name === DEFAULT_GROUP);
  const preferredCategory = preferredGroup?.categories.find((category) => category.slug === DEFAULT_CATEGORY);

  if (preferredGroup && preferredCategory) {
    return { groupName: preferredGroup.name, categorySlug: preferredCategory.slug };
  }

  if (preferredGroup?.categories[0]) {
    return { groupName: preferredGroup.name, categorySlug: preferredGroup.categories[0].slug };
  }

  const fallbackGroup = groups[0];
  const fallbackCategory = fallbackGroup?.categories[0];
  return fallbackGroup && fallbackCategory
    ? { groupName: fallbackGroup.name, categorySlug: fallbackCategory.slug }
    : { groupName: DEFAULT_GROUP, categorySlug: DEFAULT_CATEGORY };
}

interface PublicRankingsProps {
  initialTab?: PublicRankingsTab;
  embedded?: boolean;
}

export function PublicRankings({ initialTab = DEFAULT_TAB, embedded = false }: PublicRankingsProps) {
  const [activeTab, setActiveTab] = useState<PublicRankingsTab>(initialTab);
  const [groups, setGroups] = useState<LeaderboardCategoryGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState(DEFAULT_GROUP);
  const [activeCategory, setActiveCategory] = useState(DEFAULT_CATEGORY);
  const [rankingsSeasonId, setRankingsSeasonId] = useState<string | null>(null);
  const [hallOfFameSeasonId, setHallOfFameSeasonId] = useState('');
  const [activeSeason, setActiveSeason] = useState<ActiveSeasonResponse | null>(null);
  const [hallOfFameSeasons, setHallOfFameSeasons] = useState<SeasonOption[]>([]);
  const [aroundMe, setAroundMe] = useState(false);
  const [crownData, setCrownData] = useState<CrownCollectorsResponse | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardResponse | null>(null);
  const [hallOfFameEntries, setHallOfFameEntries] = useState<HallOfFameEntryResponse[]>([]);
  const [crownsLoading, setCrownsLoading] = useState(false);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [hallOfFameLoading, setHallOfFameLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const [categoriesRes, activeSeasonRes, archivesRes] = await Promise.all([
        getLeaderboardCategories(),
        getActiveSeason(),
        getPublicSeasonArchives(),
      ]);

      if (categoriesRes.data?.groups.length) {
        const selection = preferredCategorySelection(categoriesRes.data.groups);
        setGroups(categoriesRes.data.groups);
        setActiveGroup(selection.groupName);
        setActiveCategory(selection.categorySlug);
      }

      const season = activeSeasonRes.data?.season ?? null;
      setActiveSeason(season);

      const hallOfFameOptions = seasonOptionsFromArchives(archivesRes.data?.archives ?? []);
      setHallOfFameSeasons(hallOfFameOptions);
      setHallOfFameSeasonId((selected) => selected || hallOfFameOptions[0]?.id || '');
    })();
  }, []);

  useEffect(() => {
    if (activeTab !== 'crowns') return;

    void (async () => {
      setCrownsLoading(true);
      const res = await getCrownCollectors(aroundMe);
      if (res.data) {
        setCrownData(res.data);
      }
      setCrownsLoading(false);
    })();
  }, [activeTab, aroundMe]);

  useEffect(() => {
    if (activeTab !== 'leaderboards' && activeTab !== 'weekly') return;

    void (async () => {
      setLeaderboardLoading(true);
      const res = await getLeaderboard(activeCategory, aroundMe, rankingsSeasonId, periodForTab(activeTab));
      if (res.data) {
        setLeaderboardData(res.data);
      }
      setLeaderboardLoading(false);
    })();
  }, [activeCategory, activeTab, aroundMe, rankingsSeasonId]);

  useEffect(() => {
    if (activeTab !== 'hallOfFame' || !hallOfFameSeasonId) return;

    void (async () => {
      setHallOfFameLoading(true);
      const res = await getHallOfFame(hallOfFameSeasonId);
      if (res.data) {
        setHallOfFameEntries(res.data.entries);
      }
      setHallOfFameLoading(false);
    })();
  }, [activeTab, hallOfFameSeasonId]);

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
      const entries = grouped.get(entry.category) ?? [];
      entries.push(entry);
      grouped.set(entry.category, entries);
    }

    return [...grouped.entries()].map(([category, entries]) => ({
      category,
      entries: [...entries].sort((left, right) => left.rank - right.rank),
    }));
  }, [hallOfFameEntries]);

  const changeTab = useCallback((tab: PublicRankingsTab) => {
    setActiveTab(tab);
    setAroundMe(false);
    updateTabQuery(tab);
  }, []);

  const Heading = embedded ? 'h2' : 'h1';

  const content = (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-[var(--rpg-gold)]" />
        <Heading className="font-almendra text-2xl font-bold text-[var(--rpg-text-primary)]">Realm Rankings</Heading>
      </div>

      <RankingsTabs activeTab={activeTab} onChange={changeTab} />

      {activeTab === 'crowns' && (
        <PixelCard>
          <CrownCollectorsTable
            entries={crownData?.entries ?? []}
            myRank={crownData?.myRank ?? null}
            loading={crownsLoading}
            totalPlayers={crownData?.totalPlayers ?? 0}
            lastRefreshedAt={crownData?.lastRefreshedAt ?? null}
            showAroundMe={aroundMe}
            onToggleAroundMe={() => setAroundMe((value) => !value)}
          />
        </PixelCard>
      )}

      {(activeTab === 'leaderboards' || activeTab === 'weekly') && (
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
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  rankingsSeasonId === realm.seasonId
                    ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                    : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
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
                type="button"
                onClick={() => {
                  setActiveGroup(group.name);
                  setActiveCategory(group.categories[0]?.slug ?? DEFAULT_CATEGORY);
                  setAroundMe(false);
                }}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  activeGroup === group.name
                    ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                    : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
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
              className="w-full rounded-lg border border-[var(--rpg-border)] bg-[var(--rpg-surface)] px-3 py-2 text-sm text-[var(--rpg-text-primary)]"
            >
              {currentGroupCategories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.label}
                </option>
              ))}
            </select>
          )}

          <PixelCard>
            <LeaderboardTable
              entries={leaderboardData?.entries ?? []}
              myRank={leaderboardData?.myRank ?? null}
              currentPlayerId={null}
              loading={leaderboardLoading}
              totalPlayers={leaderboardData?.totalPlayers ?? 0}
              lastRefreshedAt={leaderboardData?.lastRefreshedAt ?? null}
              showAroundMe={aroundMe}
              onToggleAroundMe={() => setAroundMe((value) => !value)}
              isGuildCategory={activeGroup === 'Guilds'}
            />
          </PixelCard>
        </>
      )}

      {activeTab === 'hallOfFame' && (
        <>
          {hallOfFameSeasons.length > 0 && (
            <select
              value={hallOfFameSeasonId}
              onChange={(event) => setHallOfFameSeasonId(event.target.value)}
              className="w-full rounded-lg border border-[var(--rpg-border)] bg-[var(--rpg-surface)] px-3 py-2 text-sm text-[var(--rpg-text-primary)]"
            >
              {hallOfFameSeasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          )}

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
              <h2 className="mb-3 text-sm font-bold text-[var(--rpg-text-primary)]">
                {titleCaseFromSnake(category)}
              </h2>
              <div className="space-y-2">
                {entries.map((entry) => (
                  <div
                    key={`${entry.category}-${entry.rank}-${entry.username}`}
                    className="flex items-center justify-between gap-3 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[var(--rpg-text-primary)]">
                        #{entry.rank} {entry.username}
                      </p>
                      <p className="text-xs text-[var(--rpg-text-secondary)]">
                        {entry.value.toLocaleString()} points
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-pixel uppercase text-[var(--rpg-gold)]">
                      Legend
                    </span>
                  </div>
                ))}
              </div>
            </PixelCard>
          ))}
        </>
      )}
    </div>
  );

  if (embedded) {
    return <div className="text-[var(--rpg-text-primary)]">{content}</div>;
  }

  return (
    <main className="min-h-screen bg-[var(--rpg-background)] px-4 py-6 text-[var(--rpg-text-primary)]">
      {content}
    </main>
  );
}
