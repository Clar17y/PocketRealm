import { getMobPrefixDefinition } from '../constants/mobPrefixes';
import type { EncounterMobRole } from '../types/encounter.types';

/** Format a mob's display name with optional prefix. */
export function mobDisplayName(mob: { prefix: string | null; name: string }): string {
  if (!mob.prefix) return mob.name;
  const capitalized = mob.prefix.charAt(0).toUpperCase() + mob.prefix.slice(1);
  return `${capitalized} ${mob.name}`;
}

export function formatEncounterMobDisplayName(mob: {
  name: string;
  prefix: string | null;
  role?: EncounterMobRole | null;
}): string {
  const prefixLabel = mob.prefix ? getPrefixDisplayName(mob.prefix) : null;
  const baseName = prefixLabel ? stripLeadingPrefix(mob.name, prefixLabel) : mob.name;
  const roleLabel = encounterMobRoleNamePrefix(mob.role);

  return [prefixLabel, roleLabel, baseName].filter(Boolean).join(' ');
}

function encounterMobRoleNamePrefix(role: EncounterMobRole | null | undefined): string | null {
  if (role === 'elite') return 'Elite';
  if (role === 'mini_boss') return 'Mini-Boss';
  return null;
}

function getPrefixDisplayName(prefix: string): string {
  return getMobPrefixDefinition(prefix)?.displayName ?? capitalize(prefix);
}

function stripLeadingPrefix(name: string, prefixLabel: string): string {
  const leadingPrefix = `${prefixLabel} `;
  if (name.toLowerCase().startsWith(leadingPrefix.toLowerCase())) {
    return name.slice(leadingPrefix.length);
  }
  return name;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
