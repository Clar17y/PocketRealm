'use client';

import { useState } from 'react';
import type { BossActiveEffect } from '@pocketrealm/shared';
import { isEffectDebuff, effectDetail } from './combatHelpers';

export function EffectPill({ effect, isDebuff }: { effect: BossActiveEffect; isDebuff?: boolean }) {
  const [showDetail, setShowDetail] = useState(false);
  const debuff = isDebuff ?? isEffectDebuff(effect);

  return (
    <span className="relative">
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); setShowDetail(!showDetail); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setShowDetail(!showDetail); } }}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer select-none ${
          debuff
            ? 'bg-[var(--rpg-red)]/20 text-[var(--rpg-red)]'
            : 'bg-[var(--rpg-blue-light)]/20 text-[var(--rpg-blue-light)]'
        }`}
      >
        {effect.name}
        <span className="opacity-70">{effect.roundsRemaining}r</span>
      </span>
      {showDetail && (
        <span className="absolute bottom-full left-0 mb-1 px-2 py-1 rounded bg-[var(--rpg-surface)] border border-[var(--rpg-border)] text-[10px] text-[var(--rpg-text-primary)] whitespace-nowrap z-10 shadow-lg">
          {effectDetail(effect)}
        </span>
      )}
    </span>
  );
}
