'use client';

import type { EventModifierBadge } from '@/lib/api';

function isPlayerBuff(effectType: string): boolean {
  return ['damage_down', 'hp_down', 'spawn_rate_down', 'yield_up', 'drop_rate_up'].includes(effectType);
}

function effectLabel(effectType: string): string {
  const labels: Record<string, string> = {
    damage_up: 'DMG', damage_down: 'DMG',
    hp_up: 'HP', hp_down: 'HP',
    spawn_rate_up: 'Spawns', spawn_rate_down: 'Spawns',
    drop_rate_up: 'Drops', drop_rate_down: 'Drops',
    yield_up: 'Yield', yield_down: 'Yield',
  };
  return labels[effectType] ?? effectType;
}

export function EventBadge({ modifier }: { modifier: EventModifierBadge }) {
  const isBuff = isPlayerBuff(modifier.effectType);
  const sign = modifier.effectType.endsWith('_down') ? '-' : '+';
  const percent = Math.round(modifier.effectValue * 100);
  const tooltipText = modifier.title + (modifier.isGlobal ? ' (Global)' : '');

  return (
    <span
      title={tooltipText}
      className="inline-flex items-center gap-1 text-[10px] leading-none px-2 py-1 rounded-full font-bold cursor-default select-none whitespace-nowrap transition-opacity hover:opacity-80"
      style={{
        background: isBuff
          ? 'linear-gradient(135deg, rgba(76, 175, 80, 0.25), rgba(76, 175, 80, 0.15))'
          : 'linear-gradient(135deg, rgba(244, 67, 54, 0.25), rgba(244, 67, 54, 0.15))',
        color: isBuff ? 'var(--rpg-green-light)' : 'var(--rpg-red)',
        border: `1px solid ${isBuff ? 'rgba(76, 175, 80, 0.4)' : 'rgba(244, 67, 54, 0.4)'}`,
        boxShadow: `0 1px 2px ${isBuff ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)'}`,
      }}
    >
      <span>{sign}{percent}% {effectLabel(modifier.effectType)}</span>
    </span>
  );
}

/** Render inline badges. Use `inline` prop to display in a flex row (e.g., next to a mob name). */
export function EventBadges({ modifiers, inline }: { modifiers?: EventModifierBadge[]; inline?: boolean }) {
  if (!modifiers || modifiers.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${inline ? 'items-center' : 'mt-0.5'}`}>
      {modifiers.map((mod, i) => (
        <EventBadge key={`${mod.effectType}-${i}`} modifier={mod} />
      ))}
    </div>
  );
}
