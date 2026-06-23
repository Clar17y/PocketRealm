'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, Package, Shield, Sparkles, Wrench } from 'lucide-react';
import type { StateUpdates, VexExchangeCategory, VexExchangeView } from '@pocketrealm/shared';
import type { NpcKey } from '@pocketrealm/shared/constants/npcDialogue';
import { getVexExchanges, purchaseVexExchange } from '@/lib/api';
import { PixelButton } from '@/components/PixelButton';
import { PixelCard } from '@/components/PixelCard';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { NpcDialogueBanner } from '@/components/common/NpcDialogueBanner';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { SubNav } from '@/components/common/SubNav';

type VexFilter = 'all' | VexExchangeCategory;
const VEX_NPC_KEY: NpcKey = 'vex-collector';

interface VexScreenProps {
  onStateUpdates?: (updates: StateUpdates) => void;
  showNpcDialogue?: boolean;
}

const CATEGORY_LABELS: Record<VexExchangeCategory, string> = {
  item: 'Gear',
  upgrade: 'Upgrades',
  service: 'Tempering',
  boss_stone: 'Boss Stones',
};

const FILTER_TABS: Array<{ id: VexFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'item', label: 'Gear' },
  { id: 'upgrade', label: 'Upgrades' },
  { id: 'service', label: 'Tempering' },
  { id: 'boss_stone', label: 'Boss Stones' },
];

function categoryIcon(category: VexExchangeCategory) {
  if (category === 'item') return Package;
  if (category === 'upgrade') return Shield;
  if (category === 'service') return Wrench;
  return Sparkles;
}

function targetLabel(target: VexExchangeView['targetOptions'][number]) {
  const durability = target.maxDurability
    ? ` - ${target.currentDurability ?? target.maxDurability}/${target.maxDurability} durability`
    : '';
  const applied = target.alreadyApplied ? ' - already applied' : '';
  return `${target.itemName} (${target.rarity})${durability}${applied}`;
}

function RequirementLine({ requirement }: { requirement: VexExchangeView['requiredItems'][number] }) {
  const hasEnough = requirement.ownedQuantity >= requirement.quantity;
  return (
    <span className={hasEnough ? 'text-[var(--rpg-green-light)]' : 'text-[var(--rpg-red)]'}>
      {requirement.itemTemplateName}: {requirement.ownedQuantity.toLocaleString()} / {requirement.quantity.toLocaleString()}
    </span>
  );
}

function ExchangeCard({
  exchange,
  selectedTargetId,
  purchasing,
  onTargetChange,
  onPurchase,
}: {
  exchange: VexExchangeView;
  selectedTargetId: string;
  purchasing: boolean;
  onTargetChange: (exchangeKey: string, itemId: string) => void;
  onPurchase: (exchange: VexExchangeView) => void;
}) {
  const Icon = categoryIcon(exchange.category);
  const requiresTarget = exchange.targetOptions.length > 0;
  const selectedTarget = exchange.targetOptions.find((target) => target.itemId === selectedTargetId);
  const needsTarget = requiresTarget && !selectedTarget;
  const purchaseDisabled = purchasing || !exchange.canPurchase || needsTarget || selectedTarget?.alreadyApplied;

  return (
    <PixelCard padding="md" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon size={18} className="text-[var(--rpg-gold)] flex-shrink-0" />
            <h3 className="font-almendra text-lg font-bold text-[var(--rpg-text-primary)]">
              {exchange.name}
            </h3>
          </div>
          <p className="text-sm text-[var(--rpg-text-secondary)] leading-snug">
            {exchange.description}
          </p>
        </div>
        <span className="flex items-center gap-1 text-sm text-[var(--rpg-gold)] whitespace-nowrap">
          <Coins size={14} />
          {exchange.goldCost.toLocaleString()}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded border border-[var(--rpg-border)] px-2 py-1 text-[var(--rpg-text-secondary)]">
          {CATEGORY_LABELS[exchange.category]}
        </span>
        {exchange.requiredItems.map((requirement) => (
          <span key={requirement.itemTemplateName} className="rounded border border-[var(--rpg-border)] px-2 py-1">
            <RequirementLine requirement={requirement} />
          </span>
        ))}
      </div>

      {requiresTarget && (
        <label className="block text-sm text-[var(--rpg-text-secondary)]">
          Target item for {exchange.name}
          <select
            className="mt-1 w-full rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-3 py-2 text-[var(--rpg-text-primary)]"
            value={selectedTargetId}
            onChange={(event) => onTargetChange(exchange.key, event.target.value)}
            aria-label={`Target item for ${exchange.name}`}
          >
            <option value="">Choose an item</option>
            {exchange.targetOptions.map((target) => (
              <option key={target.itemId} value={target.itemId} disabled={target.alreadyApplied}>
                {targetLabel(target)}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--rpg-red)] min-h-[1rem]">
          {exchange.blockedReason ?? (needsTarget ? 'Choose an item first.' : '')}
        </p>
        <PixelButton
          type="button"
          variant="gold"
          size="sm"
          aria-label={`Trade ${exchange.name}`}
          disabled={purchaseDisabled}
          onClick={() => onPurchase(exchange)}
        >
          {purchasing ? 'Trading...' : 'Trade'}
        </PixelButton>
      </div>
    </PixelCard>
  );
}

export function VexScreen({ onStateUpdates, showNpcDialogue = true }: VexScreenProps) {
  const [exchanges, setExchanges] = useState<VexExchangeView[]>([]);
  const [gold, setGold] = useState(0);
  const [activeFilter, setActiveFilter] = useState<VexFilter>('all');
  const [selectedTargets, setSelectedTargets] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [purchasingKey, setPurchasingKey] = useState<string | null>(null);

  const loadExchanges = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await getVexExchanges();
    if (response.error) {
      setError(response.error.message);
    } else if (response.data) {
      setExchanges([...response.data.exchanges].sort((a, b) => a.sortOrder - b.sortOrder));
      setGold(response.data.gold);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadExchanges();
  }, [loadExchanges]);

  const visibleExchanges = useMemo(
    () => activeFilter === 'all'
      ? exchanges
      : exchanges.filter((exchange) => exchange.category === activeFilter),
    [activeFilter, exchanges],
  );

  const handleTargetChange = (exchangeKey: string, itemId: string) => {
    setSelectedTargets((prev) => ({ ...prev, [exchangeKey]: itemId }));
  };

  const handlePurchase = async (exchange: VexExchangeView) => {
    const targetItemId = selectedTargets[exchange.key];
    const params = exchange.targetOptions.length > 0 ? { targetItemId } : undefined;

    setPurchasingKey(exchange.key);
    setError(null);
    setSuccess(null);

    const response = await purchaseVexExchange(exchange.key, params);
    if (response.error) {
      setError(response.error.message);
      setPurchasingKey(null);
      return;
    }

    if (response.data?.stateUpdates) {
      onStateUpdates?.(response.data.stateUpdates);
    }
    setSuccess(response.data?.message ?? 'Trade complete.');
    setSelectedTargets((prev) => ({ ...prev, [exchange.key]: '' }));
    setPurchasingKey(null);
    await loadExchanges();
  };

  return (
    <ScreenContainer>
      <NpcDialogueBanner npcKey={VEX_NPC_KEY} event={success ? 'buy' : 'greeting'} showDialogue={showNpcDialogue} />

      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold font-almendra text-[var(--rpg-gold)]">
              Vex, Collector of Trophies
            </h2>
            <p className="text-sm text-[var(--rpg-text-secondary)]">
              A travelling collector trades world boss trophies for rare gear, tempering, and boss stones.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded border border-[var(--rpg-border)] px-3 py-2 text-[var(--rpg-gold)]">
            <Coins size={16} />
            Gold: {gold.toLocaleString()}
          </div>
        </div>

        {error && <ErrorBanner message={error} />}
        {success && (
          <div role="status" className="rounded border border-[var(--rpg-green-light)] bg-[var(--rpg-green-light)]/10 p-3 text-sm text-[var(--rpg-green-light)]">
            {success}
          </div>
        )}

        <SubNav tabs={FILTER_TABS} activeId={activeFilter} onSelect={setActiveFilter} ariaLabel="Vex exchange categories" />

        {loading && <PixelCard className="text-sm text-[var(--rpg-text-secondary)]">Loading Vex exchanges...</PixelCard>}

        {!loading && visibleExchanges.length === 0 && (
          <PixelCard className="text-sm text-[var(--rpg-text-secondary)]">
            Vex has nothing to trade right now.
          </PixelCard>
        )}

        {!loading && visibleExchanges.length > 0 && (
          <div className="space-y-3">
            {visibleExchanges.map((exchange) => (
              <ExchangeCard
                key={exchange.key}
                exchange={exchange}
                selectedTargetId={selectedTargets[exchange.key] ?? ''}
                purchasing={purchasingKey === exchange.key}
                onTargetChange={handleTargetChange}
                onPurchase={(selectedExchange) => void handlePurchase(selectedExchange)}
              />
            ))}
          </div>
        )}
      </div>
    </ScreenContainer>
  );
}
