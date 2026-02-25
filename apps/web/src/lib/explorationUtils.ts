/** Check if an exploration event is an ambush with combat log data (inline or lazy-loaded). */
export function isAmbushWithCombatLog(event: { type: string; details?: Record<string, unknown> }): boolean {
  return (event.type === 'ambush_victory' || event.type === 'ambush_defeat')
    && !!(event.details?.log || event.details?.combatLogId);
}
