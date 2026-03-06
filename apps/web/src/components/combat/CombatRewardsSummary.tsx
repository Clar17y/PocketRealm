'use client';

import type { LastCombat } from '@/app/game/gameController.types';
import { xpRateColor } from '@/lib/format';

interface CombatRewardsSummaryProps {
  rewards: LastCombat['rewards'];
  outcome: string;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function CombatRewardsSummary({ rewards, outcome }: CombatRewardsSummaryProps) {
  const { skillXpGrants, xp, loot, siteCompletion } = rewards;
  const totalLootItems = loot.reduce((sum, drop) => sum + drop.quantity, 0);
  const totalChestItems = siteCompletion?.loot.reduce((sum, drop) => sum + drop.quantity, 0) ?? 0;

  const hasAnyRewards = xp > 0 || skillXpGrants.length > 0 || loot.length > 0 || Boolean(siteCompletion);

  if (!hasAnyRewards) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-[var(--rpg-text-secondary)] uppercase tracking-wide">Rewards</h3>

      {/* Combat skill XP grants */}
      {skillXpGrants.map((grant) => (
        <div key={grant.skillType} className="flex items-center gap-2 text-sm">
          <span>ATK</span>
          <span className="text-[var(--rpg-text-primary)]">{capitalize(grant.skillType)}</span>
          <span className="text-[var(--rpg-gold)] font-pixel text-[16px]">
            +{grant.xpAfterEfficiency} XP
          </span>
          {grant.efficiency < 1 && (
            <span className="text-xs" style={{ color: xpRateColor(Math.round(grant.efficiency * 100)) }}>
              (XP Rate: {Math.round(grant.efficiency * 100)}%)
            </span>
          )}
          {grant.leveledUp && (
            <span className="text-[var(--rpg-gold)] font-semibold text-xs">
              L{grant.newLevel}!
            </span>
          )}
          {grant.characterLeveledUp && (
            <span className="text-[var(--rpg-gold)] font-semibold text-xs">
              C{grant.characterLevelAfter}!
            </span>
          )}
        </div>
      ))}

      {/* Loot */}
      {loot.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm">
            <span>LOOT</span>
            <span className="text-[var(--rpg-text-primary)]">
              {totalLootItems} item{totalLootItems !== 1 ? 's' : ''} dropped
            </span>
          </div>
          <div className="pl-9 space-y-0.5">
            {loot.map((drop, idx) => {
              const name = drop.itemName?.trim() || drop.itemTemplateId;
              return (
                <div key={`${drop.itemTemplateId}-${idx}`} className="text-xs text-[var(--rpg-text-secondary)]">
                  {name}{drop.quantity > 1 ? ` x${drop.quantity}` : ''}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {siteCompletion && (
        <div className="space-y-1">
          {siteCompletion.fullClearBonus && (
            <div className="text-[var(--rpg-gold,#c8a84e)] font-bold text-sm mb-2 text-center">
              ★ FULL CLEAR BONUS — Enhanced Rewards ★
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
            <span>CHEST</span>
            <span className="text-[var(--rpg-text-primary)] capitalize">
              {siteCompletion.chestRarity} chest
            </span>
            <span className="text-[var(--rpg-gold)] text-xs">
              {totalChestItems} item{totalChestItems !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="pl-9 space-y-0.5">
            {siteCompletion.loot.map((drop, idx) => {
              const name = drop.itemName?.trim() || drop.itemTemplateId;
              return (
                <div key={`${drop.itemTemplateId}-${idx}`} className="text-xs text-[var(--rpg-text-secondary)]">
                  {name}{drop.quantity > 1 ? ` x${drop.quantity}` : ''}
                </div>
              );
            })}
            {siteCompletion.recipeUnlocked && (
              <div className="text-xs text-[var(--rpg-gold)]">
                Recipe unlocked: {siteCompletion.recipeUnlocked.recipeName}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
