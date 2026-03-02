import type { CombatPlaybackItem, LastCombat, BestiarySkipEntry } from './gameController.types';

export function buildFightsList(queue: CombatPlaybackItem[]): LastCombat['fights'] {
  if (queue.length <= 1) return null;
  return queue.map(f => ({
    mobName: f.mobName,
    mobDisplayName: f.mobDisplayName,
    mobTemplateId: f.mobTemplateId,
    mobPrefix: f.mobPrefix,
    outcome: f.outcome,
    combatantAMaxHp: f.combatantAMaxHp,
    combatantBMaxHp: f.combatantBMaxHp,
    log: f.log ?? [],
    combatLogId: f.combatLogId,
  }));
}

export function buildLastCombat(
  queue: CombatPlaybackItem[],
  rewards: LastCombat['rewards'],
): LastCombat {
  const lastFight = queue[queue.length - 1]!;
  return {
    mobTemplateId: lastFight.mobTemplateId,
    mobPrefix: lastFight.mobPrefix,
    mobName: lastFight.mobName,
    mobDisplayName: lastFight.mobDisplayName,
    outcome: lastFight.outcome,
    combatantAMaxHp: lastFight.combatantAMaxHp,
    combatantBMaxHp: lastFight.combatantBMaxHp,
    log: lastFight.log ?? [],
    fights: buildFightsList(queue),
    rewards,
  };
}

export function isMobKnown(
  mobTemplateId: string,
  prefix: string | null | undefined,
  bestiary: BestiarySkipEntry[],
): boolean {
  const mob = bestiary.find(m => m.id === mobTemplateId);
  if (!mob?.isDiscovered) return false;
  if (prefix) return mob.prefixesEncountered.includes(prefix);
  return true;
}
