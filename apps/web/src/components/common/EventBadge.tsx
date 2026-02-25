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

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold"
      style={{
        background: isBuff ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)',
        color: isBuff ? 'var(--rpg-green-light)' : 'var(--rpg-red)',
        border: `1px solid ${isBuff ? 'rgba(76, 175, 80, 0.3)' : 'rgba(244, 67, 54, 0.3)'}`,
      }}
    >
      {modifier.isGlobal && (
        <span className="opacity-60">GLOBAL</span>
      )}
      <span>{sign}{percent}% {effectLabel(modifier.effectType)}</span>
    </span>
  );
}

export function EventBadges({ modifiers }: { modifiers?: EventModifierBadge[] }) {
  if (!modifiers || modifiers.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {modifiers.map((mod, i) => (
        <EventBadge key={`${mod.effectType}-${i}`} modifier={mod} />
      ))}
    </div>
  );
}
