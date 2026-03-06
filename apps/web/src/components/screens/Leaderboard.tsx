'use client';

import { useCallback, useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';
import {
  getLeaderboardCategories,
  getLeaderboard,
  type LeaderboardResponse,
  type LeaderboardCategoryGroup,
} from '@/lib/api';
import { Trophy } from 'lucide-react';
import { ScreenContainer } from '../common/ScreenContainer';

interface LeaderboardProps {
  playerId: string | null;
}

export function Leaderboard({ playerId }: LeaderboardProps) {
  const [groups, setGroups] = useState<LeaderboardCategoryGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState('PvP');
  const [activeCategory, setActiveCategory] = useState('pvp_rating');
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [aroundMe, setAroundMe] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await getLeaderboardCategories();
      if (res.data) {
        setGroups(res.data.groups);
      }
    })();
  }, []);

  const loadData = useCallback(async (category: string, showAroundMe: boolean) => {
    setLoading(true);
    const res = await getLeaderboard(category, showAroundMe);
    if (res.data) {
      setData(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData(activeCategory, aroundMe);
  }, [activeCategory, aroundMe, loadData]);

  const currentGroupCategories = groups.find((g) => g.name === activeGroup)?.categories ?? [];

  return (
    <ScreenContainer>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Trophy className="w-5 h-5 text-[var(--rpg-gold)]" />
        <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">Leaderboards</h2>
      </div>

      {/* Group tabs */}
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

      {/* Category dropdown (if group has more than 1 category) */}
      {currentGroupCategories.length > 1 && (
        <select
          value={activeCategory}
          onChange={(e) => {
            setActiveCategory(e.target.value);
            setAroundMe(false);
          }}
          className="w-full px-3 py-2 rounded-lg bg-[var(--rpg-surface)] text-[var(--rpg-text-primary)] border border-[var(--rpg-border)] text-sm"
        >
          {currentGroupCategories.map((cat) => (
            <option key={cat.slug} value={cat.slug}>{cat.label}</option>
          ))}
        </select>
      )}

      {/* Leaderboard table */}
      <PixelCard>
        <LeaderboardTable
          entries={data?.entries ?? []}
          myRank={data?.myRank ?? null}
          currentPlayerId={playerId}
          loading={loading}
          totalPlayers={data?.totalPlayers ?? 0}
          lastRefreshedAt={data?.lastRefreshedAt ?? null}
          showAroundMe={aroundMe}
          onToggleAroundMe={() => setAroundMe((v) => !v)}
          isGuildCategory={activeGroup === 'Guilds'}
        />
      </PixelCard>
    </ScreenContainer>
  );
}
