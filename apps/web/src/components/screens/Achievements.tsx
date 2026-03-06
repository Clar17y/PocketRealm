'use client';

import { useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { StatBar } from '@/components/StatBar';
import { groupAchievementChains } from '@adventure/shared';
import { rarityFromTier, RARITY_COLORS } from '@/lib/rarity';
import { ScreenContainer } from '../common/ScreenContainer';
import type { PlayerAchievementProgress as SharedProgress } from '@adventure/shared';
import type { PlayerAchievementProgress, AchievementRewardResponse } from '@/lib/api';

interface AchievementsProps {
  achievements: PlayerAchievementProgress[];
  unclaimedCount: number;
  activeTitle: string | null;
  onClaim: (achievementId: string) => Promise<void>;
  onSetTitle: (achievementId: string | null) => Promise<void>;
  initialCategory?: string | null;
  onCategoryViewed?: () => void;
}

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'combat', label: 'Combat' },
  { id: 'exploration', label: 'Exploration' },
  { id: 'crafting', label: 'Crafting' },
  { id: 'skills', label: 'Skills' },
  { id: 'gathering', label: 'Gathering' },
  { id: 'bestiary', label: 'Bestiary' },
  { id: 'general', label: 'General' },
  { id: 'family', label: 'Families' },
];

function RewardBadge({ reward }: { reward: AchievementRewardResponse }) {
  switch (reward.type) {
    case 'attribute_points': return <span className="text-xs text-[var(--rpg-gold)]">+{reward.amount} attr pt{reward.amount > 1 ? 's' : ''}</span>;
    case 'turns': return <span className="text-xs text-[var(--rpg-blue-light)]">+{reward.amount.toLocaleString()} turns</span>;
    case 'item': return <span className="text-xs text-[var(--rpg-purple)]">Unique item</span>;
    case 'xp': return <span className="text-xs text-[var(--rpg-green-light)]">+{reward.amount} XP</span>;
    default: return null;
  }
}

function TierStars({ current, total }: { current: number; total: number }) {
  if (total <= 1) return null;
  return (
    <span className="inline-flex gap-0.5 ml-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={i < current ? 'text-[var(--rpg-gold)]' : 'text-[var(--rpg-text-secondary)] opacity-40'}
          style={{ fontSize: '10px' }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

export function Achievements({ achievements, unclaimedCount, activeTitle, onClaim, onSetTitle, initialCategory, onCategoryViewed }: AchievementsProps) {
  const [activeCategory, setActiveCategory] = useState(initialCategory ?? 'all');
  const [claimingId, setClaimingId] = useState<string | null>(null);

  useEffect(() => {
    if (initialCategory) {
      setActiveCategory(initialCategory);
      onCategoryViewed?.();
    }
  }, [initialCategory, onCategoryViewed]);

  // Chain grouping
  const chainEntries = groupAchievementChains(achievements as unknown as SharedProgress[]);
  const totalAchievements = chainEntries.reduce((sum, e) => sum + e.totalTiers, 0);
  const totalCompleted = chainEntries.reduce((sum, e) => sum + e.completedTiers, 0);

  // Filter by category
  const filtered = activeCategory === 'all'
    ? chainEntries
    : chainEntries.filter((e) => e.achievement.category === activeCategory);

  // Sort: unclaimed first, then completed, then by progress
  const sorted = [...filtered].sort((a, b) => {
    const aAch = a.achievement;
    const bAch = b.achievement;
    const aClaimable = aAch.unlocked && !aAch.rewardClaimed && (aAch.rewards?.length ?? 0) > 0;
    const bClaimable = bAch.unlocked && !bAch.rewardClaimed && (bAch.rewards?.length ?? 0) > 0;
    if (aClaimable && !bClaimable) return -1;
    if (!aClaimable && bClaimable) return 1;
    if (aAch.unlocked && !bAch.unlocked) return -1;
    if (!aAch.unlocked && bAch.unlocked) return 1;
    return (bAch.progress / bAch.threshold) - (aAch.progress / aAch.threshold);
  });

  const handleClaim = async (id: string) => {
    setClaimingId(id);
    try { await onClaim(id); } finally { setClaimingId(null); }
  };

  // Collect unlocked titles for title selector
  const unlockedTitles = achievements.filter((a) => a.unlocked && a.titleReward);

  return (
    <ScreenContainer>
      {/* Completion counter */}
      <PixelCard padding="sm">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-[var(--rpg-text-primary)]">
            <span className="font-pixel text-[16px]">{totalCompleted} / {totalAchievements}</span> Achievements
          </span>
          <span className="text-[8px] text-[var(--rpg-text-secondary)] font-pixel">
            {totalAchievements > 0 ? Math.round((totalCompleted / totalAchievements) * 100) : 0}%
          </span>
        </div>
        <StatBar current={totalCompleted} max={totalAchievements} color="xp" size="sm" />
      </PixelCard>

      {/* Title selector */}
      {unlockedTitles.length > 0 && (
        <PixelCard padding="sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-[var(--rpg-text-secondary)]">Active title:</span>
            <button
              onClick={() => onSetTitle(null)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                !activeTitle
                  ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                  : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:bg-[var(--rpg-border)]'
              }`}
            >
              None
            </button>
            {unlockedTitles.map((a) => {
              const color = RARITY_COLORS[rarityFromTier(a.tier ?? 1)];
              return (
                <button
                  key={a.id}
                  onClick={() => onSetTitle(a.id)}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    activeTitle === a.id
                      ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                      : 'bg-[var(--rpg-surface)] hover:bg-[var(--rpg-border)]'
                  }`}
                  style={activeTitle !== a.id ? { color } : undefined}
                >
                  {a.titleReward}
                </button>
              );
            })}
          </div>
        </PixelCard>
      )}

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
              activeCategory === cat.id
                ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Achievement cards */}
      <div className="space-y-2">
        {sorted.map((entry) => {
          const achievement = entry.achievement;
          const isClaimable = achievement.unlocked && !achievement.rewardClaimed && (achievement.rewards?.length ?? 0) > 0;
          const isClaiming = claimingId === achievement.id;

          return (
            <PixelCard key={achievement.id} padding="sm">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      {achievement.unlocked && (
                        <span className="text-[var(--rpg-green-light)]">&#x2713;</span>
                      )}
                      <span className={`font-medium ${
                        achievement.unlocked
                          ? 'text-[var(--rpg-gold)]'
                          : 'text-[var(--rpg-text-primary)]'
                      }`}>
                        {achievement.title}
                      </span>
                      <TierStars current={entry.completedTiers} total={entry.totalTiers} />
                      {achievement.titleReward && achievement.unlocked && (
                        <span
                          className="text-xs italic"
                          style={{ color: RARITY_COLORS[rarityFromTier(achievement.tier ?? 1)] }}
                        >
                          &quot;{achievement.titleReward}&quot;
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--rpg-text-secondary)]">
                      {achievement.description}
                    </p>
                  </div>
                  {isClaimable && (
                    <PixelButton
                      variant="gold"
                      size="sm"
                      onClick={() => handleClaim(achievement.id)}
                      disabled={isClaiming}
                    >
                      {isClaiming ? '...' : 'Claim'}
                    </PixelButton>
                  )}
                </div>

                {/* Progress bar */}
                {!achievement.unlocked && (
                  <StatBar
                    current={achievement.progress}
                    max={achievement.threshold}
                    color="xp"
                    size="sm"
                    showNumbers
                  />
                )}

                {/* Rewards */}
                {achievement.rewards && achievement.rewards.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {achievement.rewards.map((r, i) => (
                      <RewardBadge key={i} reward={r} />
                    ))}
                  </div>
                )}
              </div>
            </PixelCard>
          );
        })}

        {sorted.length === 0 && (
          <p className="text-center text-[var(--rpg-text-secondary)] py-8">
            No achievements in this category
          </p>
        )}
      </div>
    </ScreenContainer>
  );
}
