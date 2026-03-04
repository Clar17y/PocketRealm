'use client';

import { useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { StatBar } from '@/components/StatBar';
import { LoadingCard } from '@/components/common/LoadingCard';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { Sword, Compass, Hammer, Pickaxe, Swords, Coins, Gift } from 'lucide-react';
import type { PlayerQuestData, PlayerQuestStateData, QuestCategory } from '@adventure/shared';

interface QuestsProps {
  quests: PlayerQuestData[];
  questState: PlayerQuestStateData | null;
  loading: boolean;
  error: string | null;
  onClaimReward: (questId: string) => Promise<void>;
  onClaimBonus: () => Promise<void>;
}

const CATEGORY_ICONS: Record<QuestCategory, typeof Sword> = {
  combat: Sword,
  exploration: Compass,
  crafting: Hammer,
  gathering: Pickaxe,
  pvp: Swords,
  casino: Coins,
};

const CATEGORY_COLORS: Record<QuestCategory, string> = {
  combat: 'var(--rpg-red)',
  exploration: 'var(--rpg-green-light)',
  crafting: 'var(--rpg-blue-light)',
  gathering: 'var(--rpg-text-secondary)',
  pvp: 'var(--rpg-purple)',
  casino: 'var(--rpg-gold)',
};

function QuestCard({
  quest,
  onClaim,
  claimingId,
}: {
  quest: PlayerQuestData;
  onClaim: (questId: string) => void;
  claimingId: string | null;
}) {
  const Icon = CATEGORY_ICONS[quest.category] ?? Sword;
  const color = CATEGORY_COLORS[quest.category] ?? 'var(--rpg-text-primary)';
  const isClaimed = quest.status === 'claimed';
  const isCompleted = quest.status === 'completed';
  const isClaiming = claimingId === quest.id;

  return (
    <PixelCard padding="sm">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Icon size={18} style={{ color, flexShrink: 0 }} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[var(--rpg-text-primary)] truncate">
                  {quest.name}
                </span>
                {isClaimed && (
                  <span className="text-[var(--rpg-green-light)] flex-shrink-0">&#x2713;</span>
                )}
              </div>
              <p className="text-xs text-[var(--rpg-text-secondary)]">
                {quest.description}
              </p>
            </div>
          </div>
          {isCompleted && (
            <PixelButton
              variant="gold"
              size="sm"
              onClick={() => onClaim(quest.id)}
              disabled={isClaiming}
            >
              {isClaiming ? '...' : `+${quest.rewardAmount} Claim`}
            </PixelButton>
          )}
        </div>

        {!isClaimed && (
          <StatBar
            current={quest.currentValue}
            max={quest.targetValue}
            color={isCompleted ? 'gold' : 'xp'}
            size="sm"
            showNumbers
          />
        )}
      </div>
    </PixelCard>
  );
}

export function Quests({ quests, questState, loading, error, onClaimReward, onClaimBonus }: QuestsProps) {
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimingBonus, setClaimingBonus] = useState(false);

  const dailyQuests = quests.filter((q) => q.cadence === 'daily');
  const weeklyQuests = quests.filter((q) => q.cadence === 'weekly');

  const allDailiesClaimed = dailyQuests.length > 0 && dailyQuests.every((q) => q.status === 'claimed');
  const canClaimBonus = allDailiesClaimed && questState && !questState.dailyBonusClaimed;

  const handleClaim = async (questId: string) => {
    setClaimingId(questId);
    try {
      await onClaimReward(questId);
    } finally {
      setClaimingId(null);
    }
  };

  const handleClaimBonus = async () => {
    setClaimingBonus(true);
    try {
      await onClaimBonus();
    } finally {
      setClaimingBonus(false);
    }
  };

  if (loading) {
    return <LoadingCard message="Loading quests..." />;
  }

  if (error) {
    return <ErrorBanner message={error} />;
  }

  return (
    <div className="space-y-4">
      {/* Quest Token Balance + Daily Bonus */}
      <PixelCard padding="sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins size={20} color="var(--rpg-gold)" />
            <div>
              <div className="text-xs text-[var(--rpg-text-secondary)]">Quest Tokens</div>
              <div className="text-lg font-bold text-[var(--rpg-gold)] font-mono">
                {questState?.questTokens?.toLocaleString() ?? 0}
              </div>
            </div>
          </div>
          <PixelButton
            variant="gold"
            size="sm"
            onClick={() => void handleClaimBonus()}
            disabled={!canClaimBonus || claimingBonus}
          >
            <div className="flex items-center gap-1">
              <Gift size={14} />
              {claimingBonus
                ? '...'
                : questState?.dailyBonusClaimed
                  ? 'Bonus Claimed'
                  : !allDailiesClaimed
                    ? 'Complete Dailies'
                    : 'Claim Bonus'}
            </div>
          </PixelButton>
        </div>
      </PixelCard>

      {/* Daily Quests */}
      {dailyQuests.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 text-[var(--rpg-text-primary)]">Daily Quests</h2>
          <div className="space-y-2">
            {dailyQuests.map((quest) => (
              <QuestCard
                key={quest.id}
                quest={quest}
                onClaim={(id) => void handleClaim(id)}
                claimingId={claimingId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Weekly Quests */}
      {weeklyQuests.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 text-[var(--rpg-text-primary)]">Weekly Quests</h2>
          <div className="space-y-2">
            {weeklyQuests.map((quest) => (
              <QuestCard
                key={quest.id}
                quest={quest}
                onClaim={(id) => void handleClaim(id)}
                claimingId={claimingId}
              />
            ))}
          </div>
        </div>
      )}

      {quests.length === 0 && (
        <p className="text-center text-[var(--rpg-text-secondary)] py-8">
          No quests available right now. Check back later!
        </p>
      )}
    </div>
  );
}
