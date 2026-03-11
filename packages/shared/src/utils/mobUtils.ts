/** Format a mob's display name with optional prefix. */
export function mobDisplayName(mob: { prefix: string | null; name: string }): string {
  return mob.prefix ? `${mob.prefix} ${mob.name}` : mob.name;
}
