'use client';

import { splitEncounterMobDisplayName } from '@pocketrealm/shared';
import { MobRolePill } from './MobRolePill';

export function RoleAwareMobName({ name, className }: { name: string; className?: string }) {
  const { role, name: displayName } = splitEncounterMobDisplayName(name);
  return (
    <span className="inline-flex items-center gap-1">
      <span className={className}>{displayName}</span>
      <MobRolePill role={role} />
    </span>
  );
}
