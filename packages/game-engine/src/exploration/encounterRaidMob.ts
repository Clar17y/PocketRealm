import { makeEncounterMobId } from '@pocketrealm/shared';
import type { EncounterMobSlot, ExpeditionMobState, BossTemplateAction, DamageType } from '@pocketrealm/shared';

/**
 * The minimum mob template data needed to build an ExpeditionMobState.
 * Defined locally to avoid importing the Prisma-generated MobTemplate type.
 */
export interface MobTemplateForConversion {
  id: string;
  name: string;
  hp: number;
  accuracy: number;
  defence: number;
  magicDefence: number;
  evasion: number;
  damageMin: number;
  damageMax: number;
  damageType: DamageType;
  actionTemplate: BossTemplateAction[];
  critChance?: number;
  critMultiplier?: number;
}

/**
 * Convert an EncounterMobSlot + MobTemplate into an ExpeditionMobState
 * suitable for use in the raidRoundResolver.
 */
export function buildEncounterRaidMob(
  slot: EncounterMobSlot,
  template: MobTemplateForConversion,
): ExpeditionMobState {
  return {
    id: makeEncounterMobId(slot.slot),
    mobTemplateId: template.id,
    name: template.name,
    prefix: slot.prefix,
    role: slot.role,
    hp: template.hp,
    maxHp: template.hp,
    stats: {
      hp: template.hp,
      maxHp: template.hp,
      attack: template.accuracy,
      accuracy: template.accuracy,
      defence: template.defence,
      magicDefence: template.magicDefence,
      dodge: 0,
      evasion: template.evasion,
      damageMin: template.damageMin,
      damageMax: template.damageMax,
      speed: 10,
      damageType: template.damageType,
      critChance: template.critChance,
      critDamage: template.critMultiplier,
    },
    actionTemplate: template.actionTemplate,
    activeEffects: [],
  };
}
