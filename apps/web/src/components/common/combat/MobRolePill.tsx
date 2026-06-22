'use client';

import type { EncounterMobRole } from '@pocketrealm/shared';
import { encounterMobRoleBadge } from './combatHelpers';

const ROLE_TOOLTIP: Partial<Record<EncounterMobRole, string>> = {
  elite: 'Elite — tougher stats and a unique combat rotation',
  mini_boss: 'Mini-Boss — the toughest variant, with a telegraphed finisher',
};

/**
 * Glanceable pill marking a mob as Elite or Mini-Boss, styled like the world/zone
 * event pills (EventBadge). Renders nothing for normal (trash) mobs so the marker
 * only ever calls out promoted roles.
 */
export function MobRolePill({ role }: { role?: EncounterMobRole | null }) {
  if (!role || role === 'trash') return null;
  const { label, color } = encounterMobRoleBadge(role);

  return (
    <span
      title={ROLE_TOOLTIP[role] ?? label}
      className="inline-flex items-center text-[10px] leading-none px-2 py-1 rounded-full font-bold uppercase tracking-wide cursor-default select-none whitespace-nowrap transition-opacity hover:opacity-80"
      style={{
        background: `color-mix(in srgb, ${color} 22%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
        boxShadow: `0 1px 2px color-mix(in srgb, ${color} 18%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}
