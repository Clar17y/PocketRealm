'use client';

import { useCallback, useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { LoadingCard } from '@/components/common/LoadingCard';
import { getExpeditionShop, purchaseExpeditionItem } from '@/lib/api/expedition';
import type { ExpeditionShopItem, ExpeditionSetId } from '@pocketrealm/shared';
import { formatNumber } from '@/lib/format';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { ErrorBanner } from '@/components/common/ErrorBanner';

// ---------------------------------------------------------------------------
// Set metadata
// ---------------------------------------------------------------------------

interface SetMeta {
  label: string;
  role: string;
  color: string;
  bonus2pc: string;
  bonus4pc: string;
}

const SET_META: Record<ExpeditionSetId, SetMeta> = {
  vanguard: {
    label: 'Vanguard',
    role: 'Melee / Tank',
    color: 'var(--rpg-red)',
    bonus2pc: '+10% max HP',
    bonus4pc: 'Counter triggers AoE taunt',
  },
  sharpshooter: {
    label: 'Sharpshooter',
    role: 'Ranged / DPS',
    color: 'var(--rpg-green-light)',
    bonus2pc: '+10% crit chance',
    bonus4pc: '15% double-hit',
  },
  arcanist: {
    label: 'Arcanist',
    role: 'Magic / Healer',
    color: 'var(--rpg-blue-light)',
    bonus2pc: '+15% mana regen',
    bonus4pc: 'Heal splash 30% to lowest HP',
  },
};

const SET_ORDER: ExpeditionSetId[] = ['vanguard', 'sharpshooter', 'arcanist'];

// ---------------------------------------------------------------------------
// Stat display helpers
// ---------------------------------------------------------------------------

const STAT_LABELS: Record<string, string> = {
  attack: 'Attack',
  accuracy: 'Accuracy',
  defence: 'Defence',
  magicDefence: 'Magic Def',
  dodge: 'Dodge',
  evasion: 'Evasion',
  maxHp: 'Max HP',
  critChance: 'Crit %',
  critDamage: 'Crit Dmg',
  speed: 'Speed',
  damageMin: 'Min Dmg',
  damageMax: 'Max Dmg',
};

function formatStats(stats: Partial<Record<string, unknown>>): string {
  return Object.entries(stats)
    .filter(([, v]) => typeof v === 'number' && v !== 0)
    .map(([k, v]) => `${STAT_LABELS[k] ?? k} +${v}`)
    .join(', ');
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExpeditionShopTabProps {
  onRefresh?: () => void;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ExpeditionShopTab({ onRefresh }: ExpeditionShopTabProps) {
  const load = useAsyncAction();
  const purchase = useAsyncAction();
  const [shopData, setShopData] = useState<{ items: ExpeditionShopItem[]; tokens: number } | null>(null);

  const loadShop = useCallback(() => {
    load.run(() => getExpeditionShop(), (data) => setShopData(data ?? null));
  }, [load.run]);

  useEffect(() => { void loadShop(); }, [loadShop]);

  const handlePurchase = (itemId: string) =>
    purchase.run(
      () => purchaseExpeditionItem(itemId),
      () => { void loadShop(); onRefresh?.(); },
      itemId,
    );

  if (load.loading && !shopData) return <LoadingCard />;

  if (!shopData) return null;

  const itemsBySet = SET_ORDER.reduce<Record<ExpeditionSetId, ExpeditionShopItem[]>>((acc, setId) => {
    acc[setId] = shopData.items.filter((i) => i.setId === setId);
    return acc;
  }, {} as Record<ExpeditionSetId, ExpeditionShopItem[]>);

  return (
    <div className="space-y-4">
      {(load.error || purchase.error) && <ErrorBanner message={(load.error || purchase.error)!} />}
      {/* Header */}
      <PixelCard>
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-[var(--rpg-text-primary)]">Expedition Shop</h3>
          <span className="text-sm font-bold text-[var(--rpg-gold)]">
            {formatNumber(shopData.tokens)} Tokens
          </span>
        </div>
        <p className="text-xs text-[var(--rpg-text-secondary)] mt-1">
          Spend tokens earned from expeditions on powerful set gear. Set bonuses apply in group content only.
        </p>
      </PixelCard>

      {/* Set sections */}
      {SET_ORDER.map((setId) => {
        const meta = SET_META[setId];
        const items = itemsBySet[setId];
        if (!items || items.length === 0) return null;

        return (
          <div key={setId} className="space-y-2">
            {/* Set header */}
            <PixelCard>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-sm font-bold" style={{ color: meta.color }}>
                  {meta.label}
                </span>
                <span className="text-xs text-[var(--rpg-text-secondary)]">
                  {meta.role}
                </span>
              </div>
              <div className="text-xs space-y-0.5">
                <p>
                  <span className="text-[var(--rpg-text-secondary)]">2-piece: </span>
                  <span className="text-[var(--rpg-text-primary)]">{meta.bonus2pc}</span>
                </p>
                <p>
                  <span className="text-[var(--rpg-text-secondary)]">4-piece: </span>
                  <span className="text-[var(--rpg-text-primary)]">{meta.bonus4pc}</span>
                </p>
                <p className="text-[var(--rpg-text-secondary)] italic">Group content only</p>
              </div>
            </PixelCard>

            {/* Item cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {items.map((item) => {
                const canAfford = shopData.tokens >= item.tokenCost;
                const isPurchasing = purchase.loadingKey === item.id;

                return (
                  <PixelCard key={item.id} padding="sm">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-bold text-[var(--rpg-text-primary)]">{item.name}</p>
                          <p className="text-[10px] text-[var(--rpg-text-secondary)] capitalize">{item.slot}</p>
                        </div>
                        <span className="text-xs font-bold text-[var(--rpg-gold)] whitespace-nowrap">
                          {formatNumber(item.tokenCost)}
                        </span>
                      </div>
                      <p className="text-[10px] text-[var(--rpg-text-secondary)]">
                        {formatStats(item.stats)}
                      </p>
                      <PixelButton
                        size="sm"
                        variant={canAfford ? 'gold' : 'secondary'}
                        onClick={() => handlePurchase(item.id)}
                        disabled={!canAfford || isPurchasing}
                        className="w-full text-xs"
                      >
                        {isPurchasing ? 'Purchasing...' : canAfford ? 'Purchase' : 'Not enough tokens'}
                      </PixelButton>
                    </div>
                  </PixelCard>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
