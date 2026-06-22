import { getMobPrefixDefinition } from '../constants/mobPrefixes';
import type { EncounterMobRole } from '../types/encounter.types';

/** Format a mob's display name with optional prefix. */
export function mobDisplayName(mob: { prefix: string | null; name: string }): string {
  if (!mob.prefix) return mob.name;
  const capitalized = mob.prefix.charAt(0).toUpperCase() + mob.prefix.slice(1);
  return `${capitalized} ${mob.name}`;
}

export function formatEncounterMobDisplayName(
  mob: {
    name: string;
    prefix: string | null;
    role?: EncounterMobRole | null;
  },
  options: { includeRole?: boolean } = {},
): string {
  const { includeRole = true } = options;
  const prefixLabel = mob.prefix ? getPrefixDisplayName(mob.prefix) : null;
  const baseName = prefixLabel ? stripLeadingPrefix(mob.name, prefixLabel) : mob.name;
  const roleLabel = includeRole ? encounterMobRoleNamePrefix(mob.role) : null;

  return [prefixLabel, roleLabel, baseName].filter(Boolean).join(' ');
}

function encounterMobRoleNamePrefix(role: EncounterMobRole | null | undefined): string | null {
  if (role === 'elite') return 'Elite';
  if (role === 'mini_boss') return 'Mini-Boss';
  return null;
}

/**
 * Inverse of the role token inserted by {@link formatEncounterMobDisplayName}: splits a
 * display name into its promoted role (if any) and the name with that role token removed.
 * Lets display-only surfaces show a role pill without the role also appearing in the name,
 * and works for persisted/historical combat logs that only stored the display name.
 * Mob names and prefixes never contain these tokens, so the match is unambiguous.
 */
export function splitEncounterMobDisplayName(displayName: string): {
  role: EncounterMobRole | null;
  name: string;
} {
  const words = displayName.split(' ');
  const miniIndex = words.indexOf('Mini-Boss');
  if (miniIndex !== -1) {
    words.splice(miniIndex, 1);
    return { role: 'mini_boss', name: words.join(' ') };
  }
  const eliteIndex = words.indexOf('Elite');
  if (eliteIndex !== -1) {
    words.splice(eliteIndex, 1);
    return { role: 'elite', name: words.join(' ') };
  }
  return { role: null, name: displayName };
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
