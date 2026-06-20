import { formatEncounterMobDisplayName } from '@pocketrealm/shared';
import type { BossActiveEffect, EncounterMobRole, ExpeditionRoomType } from '@pocketrealm/shared';
import { formatCombatEffectDescription, formatRounds } from '@pocketrealm/shared/constants/combatEffectNames';

export function roomTypeBadge(roomType: ExpeditionRoomType | null): { label: string; color: string } {
  switch (roomType) {
    case 'trash':      return { label: 'Trash',      color: 'var(--rpg-text-secondary)' };
    case 'elite':      return { label: 'Elite',      color: 'var(--rpg-blue-light)' };
    case 'mini_boss':  return { label: 'Mini-Boss',  color: 'var(--rpg-gold)' };
    case 'event':      return { label: 'Event',      color: 'var(--rpg-green-light)' };
    case 'final_boss': return { label: 'Final Boss', color: 'var(--rpg-red)' };
    default:           return { label: 'Unknown',    color: 'var(--rpg-text-secondary)' };
  }
}

export function encounterMobRoleBadge(role: EncounterMobRole): { label: string; color: string } {
  switch (role) {
    case 'elite':
      return { label: 'Elite', color: 'var(--rpg-blue-light)' };
    case 'mini_boss':
      return { label: 'Mini-Boss', color: 'var(--rpg-gold)' };
    case 'trash':
    default:
      return { label: 'Normal', color: 'var(--rpg-text-secondary)' };
  }
}

export function encounterMobDisplayName(mob: {
  name: string;
  prefix: string | null;
  role?: EncounterMobRole | null;
}): string {
  return formatEncounterMobDisplayName(mob);
}

export function isEffectDebuff(effect: BossActiveEffect): boolean {
  if (effect.stat === 'potionSickness') return true;
  if (effect.damagePerRound && effect.damagePerRound > 0) return true;
  if (effect.stat === 'rooted' || effect.stat === 'marked_for_death' || effect.stat === 'nature_cursed') return true;
  return (effect.modifier ?? 0) < 0;
}

export function effectDetail(effect: BossActiveEffect): string {
  return [
    formatCombatEffectDescription(effect, { includeDuration: false }),
    `${formatRounds(effect.roundsRemaining)} remaining`,
  ].join(' · ');
}
