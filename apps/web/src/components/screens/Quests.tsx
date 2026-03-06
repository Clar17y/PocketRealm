'use client';

import { useState, useEffect, useCallback } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { LoadingCard } from '@/components/common/LoadingCard';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { SubNav } from '@/components/common/SubNav';
import {
  Sword, Compass, Hammer, Pickaxe, Swords, Coins, Gift, RefreshCw,
  Wrench, Zap, Package, Crown, Shield,
} from 'lucide-react';
import { getShopItems, purchaseShopItem, getPlayerBuffs } from '@/lib/api';
import type { PlayerQuestData, PlayerQuestStateData, QuestCategory, ShopItemData, PlayerBuffData } from '@pocketrealm/shared';
import { QUEST_CONSTANTS } from '@pocketrealm/shared';

interface QuestsProps {
  quests: PlayerQuestData[];
  questState: PlayerQuestStateData | null;
  loading: boolean;
  error: string | null;
  onClaimReward: (questId: string) => Promise<void>;
  onClaimBonus: () => Promise<void>;
  onReroll: (questId: string) => Promise<void>;
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

const SHOP_CATEGORY_CONFIG: Record<ShopItemData['category'], { label: string; icon: typeof Sword; color: string }> = {
  reset: { label: 'Reset Scrolls', icon: RefreshCw, color: 'var(--rpg-blue-light)' },
  upgrade: { label: 'Upgrade Scrolls', icon: Wrench, color: 'var(--rpg-gold)' },
  buff: { label: 'Buff Scrolls', icon: Zap, color: 'var(--rpg-green-light)' },
  utility: { label: 'Utility', icon: Package, color: 'var(--rpg-text-secondary)' },
  prestige: { label: 'Prestige', icon: Crown, color: 'var(--rpg-purple)' },
};

function QuestProgressBar({ current, max, completed }: { current: number; max: number; completed: boolean }) {
  const pct = Math.min((current / max) * 100, 100);
  return (
    <div className="w-full">
      <div className="flex justify-end mb-1">
        <span className="font-pixel text-[8px] text-[var(--rpg-text-secondary)]">
          {current.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <div className="relative w-full h-2 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded overflow-hidden">
        <div
          className={`h-full transition-all duration-300 rpg-bar-shimmer ${completed ? 'bg-[var(--rpg-green-light)]' : 'bg-[var(--rpg-gold)]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function QuestCard({
  quest,
  onClaim,
  onReroll,
  claimingId,
  rerollingId,
  canReroll,
}: {
  quest: PlayerQuestData;
  onClaim: (questId: string) => void;
  onReroll: (questId: string) => void;
  claimingId: string | null;
  rerollingId: string | null;
  canReroll: boolean;
}) {
  const Icon = CATEGORY_ICONS[quest.category] ?? Sword;
  const color = CATEGORY_COLORS[quest.category] ?? 'var(--rpg-text-primary)';
  const isClaimed = quest.status === 'claimed';
  const isCompleted = quest.status === 'completed';
  const isActive = quest.status === 'active';
  const isClaiming = claimingId === quest.id;
  const isRerolling = rerollingId === quest.id;

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
                {!isClaimed && (
                  <span className="flex items-center gap-0.5 text-[10px] text-[var(--rpg-gold)] flex-shrink-0">
                    <Coins size={10} />
                    {quest.rewardAmount}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--rpg-text-secondary)]">
                {quest.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {isActive && canReroll && (
              <button
                className="p-1 rounded text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] hover:bg-[var(--rpg-surface)] transition-colors disabled:opacity-40"
                onClick={() => onReroll(quest.id)}
                disabled={isRerolling}
                title="Reroll quest"
              >
                <RefreshCw size={14} className={isRerolling ? 'animate-spin' : ''} />
              </button>
            )}
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
        </div>

        {!isClaimed && (
          <QuestProgressBar
            current={quest.currentValue}
            max={quest.targetValue}
            completed={isCompleted}
          />
        )}
      </div>
    </PixelCard>
  );
}

// Buff badge for active buffs display
function BuffBadge({ buff }: { buff: PlayerBuffData }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)]">
      <Shield size={14} className="text-[var(--rpg-green-light)] flex-shrink-0" />
      <div className="min-w-0">
        <span className="text-xs text-[var(--rpg-text-primary)] truncate">
          {buff.shopItemName}
        </span>
        <span className="text-[10px] text-[var(--rpg-text-secondary)] ml-1.5">
          {buff.remainingUses} uses left (+{buff.bonusValue}%)
        </span>
      </div>
    </div>
  );
}

function ActiveBuffsPanel({ buffs }: { buffs: PlayerBuffData[] }) {
  if (buffs.length === 0) {
    return (
      <PixelCard padding="sm">
        <div className="text-xs text-[var(--rpg-text-secondary)] text-center py-1">
          No active buffs
        </div>
      </PixelCard>
    );
  }

  return (
    <PixelCard padding="sm">
      <div className="text-xs font-medium text-[var(--rpg-text-secondary)] mb-2">Active Buffs</div>
      <div className="space-y-1">
        {buffs.map((buff) => (
          <BuffBadge key={buff.id} buff={buff} />
        ))}
      </div>
    </PixelCard>
  );
}

function ShopItemCard({
  item,
  tokens,
  onBuy,
  buyingId,
}: {
  item: ShopItemData;
  tokens: number;
  onBuy: (item: ShopItemData) => void;
  buyingId: string | null;
}) {
  const canAfford = tokens >= item.cost;
  const isBuying = buyingId === item.id;
  const config = SHOP_CATEGORY_CONFIG[item.category];
  const Icon = config.icon;

  // Purchase limit info
  let limitText: string | null = null;
  if (item.weeklyLimit != null) {
    limitText = `${item.purchasesThisWeek ?? 0}/${item.weeklyLimit} this week`;
  } else if (item.lifetimeLimit != null) {
    limitText = `${item.purchasesLifetime ?? 0}/${item.lifetimeLimit} lifetime`;
  }

  // Buff details
  let buffText: string | null = null;
  if (item.buffType && item.buffValue != null && item.buffUses != null) {
    buffText = `+${item.buffValue}% for ${item.buffUses} uses`;
  }

  return (
    <PixelCard padding="sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Icon size={16} style={{ color: config.color, flexShrink: 0 }} />
            <span className="font-medium text-[var(--rpg-text-primary)] truncate">
              {item.name}
            </span>
            {limitText && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]">
                {limitText}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--rpg-text-secondary)] ml-6">
            {item.description}
          </p>
          {buffText && (
            <p className="text-[10px] text-[var(--rpg-green-light)] ml-6 mt-0.5">
              {buffText}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="flex items-center gap-1 text-sm font-mono">
            <Coins size={14} color="var(--rpg-gold)" />
            <span className={canAfford ? 'text-[var(--rpg-gold)]' : 'text-[var(--rpg-red)]'}>
              {item.cost}
            </span>
          </div>
          <PixelButton
            variant="secondary"
            size="sm"
            onClick={() => onBuy(item)}
            disabled={!item.canPurchase || !canAfford || isBuying}
          >
            {isBuying ? '...' : 'Buy'}
          </PixelButton>
        </div>
      </div>
    </PixelCard>
  );
}

function ShopTab({ questTokens }: { questTokens: number }) {
  const [shopItems, setShopItems] = useState<ShopItemData[]>([]);
  const [tokens, setTokens] = useState(questTokens);
  const [shopLoading, setShopLoading] = useState(true);
  const [shopError, setShopError] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [buffs, setBuffs] = useState<PlayerBuffData[]>([]);
  const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);

  const loadShop = useCallback(async () => {
    setShopLoading(true);
    setShopError(null);
    try {
      const [shopRes, buffsRes] = await Promise.all([getShopItems(), getPlayerBuffs()]);
      if (shopRes.data) {
        setShopItems(shopRes.data.items);
        setTokens(shopRes.data.questTokens);
      } else if (shopRes.error) {
        setShopError(shopRes.error.message);
      }
      if (buffsRes.data) {
        setBuffs(buffsRes.data.buffs);
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

  const handleBuy = async (item: ShopItemData) => {
    setBuyingId(item.id);
    setPurchaseMessage(null);
    try {
      const res = await purchaseShopItem(item.id);
      if (res.data) {
        setTokens(res.data.newBalance);
        setPurchaseMessage(`Purchased ${item.name}!`);
        // Refresh shop state and buffs
        void loadShop();
      } else if (res.error) {
        setPurchaseMessage(res.error.message);
      }
    } catch {
      setPurchaseMessage('Purchase failed');
    } finally {
      setBuyingId(null);
    }
  };

  if (shopLoading) {
    return <LoadingCard message="Loading shop..." />;
  }

  if (shopError) {
    return <ErrorBanner message={shopError} />;
  }

  // Group items by category, preserving sortOrder
  const groupedItems = new Map<ShopItemData['category'], ShopItemData[]>();
  const categoryOrder: ShopItemData['category'][] = ['reset', 'upgrade', 'buff', 'utility', 'prestige'];
  for (const cat of categoryOrder) {
    const items = shopItems
      .filter((i) => i.category === cat && i.enabled)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (items.length > 0) {
      groupedItems.set(cat, items);
    }
  }

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

      {/* Active buffs */}
      <ActiveBuffsPanel buffs={buffs} />

      {/* Purchase feedback */}
      {purchaseMessage && (
        <div className="text-xs text-center text-[var(--rpg-text-secondary)] py-1">
          {purchaseMessage}
        </div>
      )}

      {/* Items grouped by category */}
      {categoryOrder.map((cat) => {
        const items = groupedItems.get(cat);
        if (!items) return null;
        const config = SHOP_CATEGORY_CONFIG[cat];
        const CatIcon = config.icon;

        return (
          <div key={cat}>
            <h2 className="text-sm font-semibold mb-2 text-[var(--rpg-text-primary)] flex items-center gap-1.5">
              <CatIcon size={14} style={{ color: config.color }} />
              {config.label}
            </h2>
            <div className="space-y-2">
              {items.map((item) => (
                <ShopItemCard
                  key={item.id}
                  item={item}
                  tokens={tokens}
                  onBuy={(i) => void handleBuy(i)}
                  buyingId={buyingId}
                />
              ))}
            </div>
          </div>
        );
      })}

      {shopItems.length === 0 && (
        <p className="text-center text-[var(--rpg-text-secondary)] py-8">
          No items available in the shop right now.
        </p>
      )}
    </div>
  );
}

export function Quests({ quests, questState, loading, error, onClaimReward, onClaimBonus, onReroll }: QuestsProps) {
  const [activeTab, setActiveTab] = useState('quests');
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [rerollingId, setRerollingId] = useState<string | null>(null);
  const [claimingBonus, setClaimingBonus] = useState(false);

  const dailyQuests = quests.filter((q) => q.cadence === 'daily');
  const weeklyQuests = quests.filter((q) => q.cadence === 'weekly');

  const allDailiesClaimed = dailyQuests.length > 0 && dailyQuests.every((q) => q.status === 'claimed');
  const canClaimBonus = allDailiesClaimed && questState && !questState.dailyBonusClaimed;
  const canReroll = (questState?.rerollsUsed ?? 0) < QUEST_CONSTANTS.REROLLS_PER_DAY;

  const handleClaim = async (questId: string) => {
    setClaimingId(questId);
    try {
      await onClaimReward(questId);
    } finally {
      setClaimingId(null);
    }
  };

  const handleReroll = async (questId: string) => {
    setRerollingId(questId);
    try {
      await onReroll(questId);
    } finally {
      setRerollingId(null);
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

  const rerollsRemaining = QUEST_CONSTANTS.REROLLS_PER_DAY - (questState?.rerollsUsed ?? 0);

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
              <div className="flex items-center gap-3">
                {rerollsRemaining > 0 && (
                  <span className="text-[10px] text-[var(--rpg-text-secondary)] flex items-center gap-1">
                    <RefreshCw size={10} />
                    {rerollsRemaining} reroll{rerollsRemaining !== 1 ? 's' : ''}
                  </span>
                )}
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
                    onReroll={(id) => void handleReroll(id)}
                    claimingId={claimingId}
                    rerollingId={rerollingId}
                    canReroll={canReroll}
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
                    onReroll={(id) => void handleReroll(id)}
                    claimingId={claimingId}
                    rerollingId={rerollingId}
                    canReroll={canReroll}
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
