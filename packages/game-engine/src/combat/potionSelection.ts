import type { CombatPotion } from '@pocketrealm/shared';

export type ResourcePotionType = 'hp' | 'stamina' | 'mana';

export function isResourcePotionType(
  potionType: CombatPotion['potionType'],
): potionType is ResourcePotionType {
  return potionType === 'hp' || potionType === 'stamina' || potionType === 'mana';
}

export function findStrongestResourcePotionIndex(
  potions: readonly CombatPotion[],
  potionType: ResourcePotionType,
  usedIndices?: ReadonlySet<number>,
): number {
  let bestIndex = -1;
  let bestHealAmount = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < potions.length; index += 1) {
    if (usedIndices?.has(index)) continue;

    const potion = potions[index];
    if (potion.potionType !== potionType) continue;

    if (bestIndex === -1 || potion.healAmount > bestHealAmount) {
      bestIndex = index;
      bestHealAmount = potion.healAmount;
    }
  }

  return bestIndex;
}
