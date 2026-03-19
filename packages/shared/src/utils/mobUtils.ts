/** Format a mob's display name with optional prefix. */
export function mobDisplayName(mob: { prefix: string | null; name: string }): string {
  if (!mob.prefix) return mob.name;
  const capitalized = mob.prefix.charAt(0).toUpperCase() + mob.prefix.slice(1);
  return `${capitalized} ${mob.name}`;
}
