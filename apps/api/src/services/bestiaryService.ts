import { BESTIARY_UNLOCK_CONSTANTS } from '@pocketrealm/shared';

const { FLAVOR_APPEARANCE_THRESHOLD, FLAVOR_BEHAVIOR_THRESHOLD, FLAVOR_LORE_THRESHOLD } = BESTIARY_UNLOCK_CONSTANTS;

interface MobFlavorFields {
  flavorAppearance: string | null;
  flavorBehavior: string | null;
  flavorLore: string | null;
}

export function getBestiaryFlavorText(mob: MobFlavorFields, kills: number): MobFlavorFields {
  return {
    flavorAppearance: kills >= FLAVOR_APPEARANCE_THRESHOLD ? mob.flavorAppearance : null,
    flavorBehavior: kills >= FLAVOR_BEHAVIOR_THRESHOLD ? mob.flavorBehavior : null,
    flavorLore: kills >= FLAVOR_LORE_THRESHOLD ? mob.flavorLore : null,
  };
}
