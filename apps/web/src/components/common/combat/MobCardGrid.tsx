'use client';

import Image from 'next/image';
import { monsterImageSrc } from '@/lib/assets';
import { PixelCard } from '@/components/PixelCard';
import { HpBar } from './HpBar';
import { EffectPill } from './EffectPill';
import { mobDisplayName } from '@pocketrealm/shared';
import type { ExpeditionMobInfo } from '@pocketrealm/shared';

export interface MobCardGridProps {
  mobs: ExpeditionMobInfo[];
  myTargetMobId: string | null;
  targetCounts: Map<string, number>;
  onSetTarget: (mobId: string | null) => void;
  disabled?: boolean;
  title?: string;
}

export function MobCardGrid({ mobs, myTargetMobId, targetCounts, onSetTarget, disabled, title = 'Current Room' }: MobCardGridProps) {
  if (mobs.length === 0) return null;

  return (
    <PixelCard>
      <div className="flex justify-between items-center mb-2">
        <h4 className="text-xs font-bold text-[var(--rpg-text-primary)]">{title}</h4>
        {myTargetMobId && !disabled && (
          <button
            onClick={() => onSetTarget(null)}
            className="text-[10px] text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] underline"
          >
            Clear Target
          </button>
        )}
      </div>
      <div className="space-y-2">
        {mobs.map((mob) => {
          const isMyTarget = myTargetMobId === mob.id;
          const count = targetCounts.get(mob.id) ?? 0;
          return (
            <button
              key={mob.id}
              onClick={() => !disabled && onSetTarget(isMyTarget ? null : mob.id)}
              disabled={disabled}
              className={`w-full text-left p-2 rounded border transition-colors ${
                disabled
                  ? 'border-[var(--rpg-border)] opacity-50 cursor-not-allowed'
                  : isMyTarget
                    ? 'border-[var(--rpg-gold)] bg-[var(--rpg-gold)]/10'
                    : 'border-[var(--rpg-border)] hover:border-[var(--rpg-text-secondary)]'
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-[var(--rpg-text-primary)] font-bold flex items-center gap-1.5">
                  <Image
                    src={monsterImageSrc(mob.name)}
                    alt={mob.name}
                    width={24}
                    height={24}
                    className="image-rendering-pixelated"
                  />
                  {mobDisplayName(mob)}
                </span>
                <div className="flex gap-1 items-center">
                  {count > 0 && (
                    <span className="text-[10px] px-1.5 py-0 rounded bg-[var(--rpg-blue-light)]/20 text-[var(--rpg-blue-light)]">
                      {count} targeting
                    </span>
                  )}
                  {isMyTarget && (
                    <span className="text-[10px] px-1.5 py-0 rounded bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)]">
                      YOUR TARGET
                    </span>
                  )}
                </div>
              </div>
              <HpBar
                current={mob.hp}
                max={mob.maxHp}
                label="HP"
                color={mob.hp <= mob.maxHp * 0.25 ? 'var(--rpg-red)' : 'var(--rpg-green-light)'}
              />
              {mob.activeEffects?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {mob.activeEffects.map((eff, idx) => (
                    <EffectPill key={idx} effect={eff} isDebuff={true} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </PixelCard>
  );
}
