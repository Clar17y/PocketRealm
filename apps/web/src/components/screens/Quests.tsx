'use client';

import { useState, useEffect, useCallback } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { StatBar } from '@/components/StatBar';
import { LoadingCard } from '@/components/common/LoadingCard';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { SubNav } from '@/components/common/SubNav';
import { Sword, Compass, Hammer, Pickaxe, Swords, Coins, Gift, ShoppingBag } from 'lucide-react';
import { getQuestShop, purchaseQuestItem } from '@/lib/api';
import type { PlayerQuestData, PlayerQuestStateData, QuestCategory, QuestShopItem } from '@pocketrealm/shared';

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

const SHOP_TABS = [
  { id: 'quests', label: 'Quests' },
  { id: 'shop', label: 'Shop' },
] as const;

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

const SHOP_CATEGORY_COLORS: Record<QuestShopItem['category'], string> = {
  consumable: 'var(--rpg-green-light)',
  material: 'var(--rpg-blue-light)',
  recipe: 'var(--rpg-purple)',
  utility: 'var(--rpg-gold)',
};

function ShopItemCard({
  item,
  tokens,
  onBuy,
  buyingKey,
}: {
  item: QuestShopItem;
  tokens: number;
  onBuy: (key: string) => void;
  buyingKey: string | null;
}) {
  const canAfford = tokens >= item.cost;
  const isBuying = buyingKey === item.key;
  const categoryColor = SHOP_CATEGORY_COLORS[item.category];

  return (
    <PixelCard padding="sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingBag size={16} style={{ color: categoryColor, flexShrink: 0 }} />
            <span className="font-medium text-[var(--rpg-text-primary)] truncate">
              {item.name}
            </span>
            {!item.permanent && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]">
                Limited
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--rpg-text-secondary)] ml-6">
            {item.description}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="flex items-center gap-1 text-sm font-mono">
            <Coins size={14} color="var(--rpg-gold)" />
            <span className={canAfford ? 'text-[var(--rpg-gold)]' : 'text-[var(--rpg-red)]'}>
              {item.cost}
            </span>
          </div>
          <PixelButton
            variant="gold"
            size="sm"
            onClick={() => onBuy(item.key)}
            disabled={!canAfford || isBuying}
          >
            {isBuying ? '...' : 'Buy'}
          </PixelButton>
        </div>
      </div>
    </PixelCard>
  );
}

function ShopTab({ questTokens }: { questTokens: number }) {
  const [shopItems, setShopItems] = useState<QuestShopItem[]>([]);
  const [tokens, setTokens] = useState(questTokens);
  const [shopLoading, setShopLoading] = useState(true);
  const [shopError, setShopError] = useState<string | null>(null);
  const [buyingKey, setBuyingKey] = useState<string | null>(null);

  const loadShop = useCallback(async () => {
    setShopLoading(true);
    setShopError(null);
    try {
      const res = await getQuestShop();
      if (res.data) {
        setShopItems(res.data.items);
        setTokens(res.data.questTokens);
      } else if (res.error) {
        setShopError(res.error.message);
      }
    } catch {
      setShopError('Failed to load shop');
    } finally {
      setShopLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadShop();
  }, [loadShop]);

  const handleBuy = async (itemKey: string) => {
    setBuyingKey(itemKey);
    try {
      const res = await purchaseQuestItem(itemKey);
      if (res.data) {
        setTokens(res.data.newBalance);
      }
    } finally {
      setBuyingKey(null);
    }
  };

  if (shopLoading) {
    return <LoadingCard message="Loading shop..." />;
  }

  if (shopError) {
    return <ErrorBanner message={shopError} />;
  }

  const permanentItems = shopItems.filter(i => i.permanent);
  const rotatingItems = shopItems.filter(i => !i.permanent);

  return (
    <div className="space-y-4">
      {/* Token balance */}
      <PixelCard padding="sm">
        <div className="flex items-center gap-2">
          <Coins size={20} color="var(--rpg-gold)" />
          <div>
            <div className="text-xs text-[var(--rpg-text-secondary)]">Quest Tokens</div>
            <div className="text-lg font-bold text-[var(--rpg-gold)] font-mono">
              {tokens.toLocaleString()}
            </div>
          </div>
        </div>
      </PixelCard>

      {/* Permanent items */}
      {permanentItems.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 text-[var(--rpg-text-primary)]">Always Available</h2>
          <div className="space-y-2">
            {permanentItems.map(item => (
              <ShopItemCard
                key={item.key}
                item={item}
                tokens={tokens}
                onBuy={(key) => void handleBuy(key)}
                buyingKey={buyingKey}
              />
            ))}
          </div>
        </div>
      )}

      {/* Rotating items */}
      {rotatingItems.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 text-[var(--rpg-text-primary)]">Limited Stock</h2>
          <div className="space-y-2">
            {rotatingItems.map(item => (
              <ShopItemCard
                key={item.key}
                item={item}
                tokens={tokens}
                onBuy={(key) => void handleBuy(key)}
                buyingKey={buyingKey}
              />
            ))}
          </div>
        </div>
      )}

      {shopItems.length === 0 && (
        <p className="text-center text-[var(--rpg-text-secondary)] py-8">
          No items available in the shop right now.
        </p>
      )}
    </div>
  );
}

export function Quests({ quests, questState, loading, error, onClaimReward, onClaimBonus }: QuestsProps) {
  const [activeTab, setActiveTab] = useState('quests');
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
      <SubNav tabs={[...SHOP_TABS]} activeId={activeTab} onSelect={setActiveTab} />

      {activeTab === 'shop' ? (
        <ShopTab questTokens={questState?.questTokens ?? 0} />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
