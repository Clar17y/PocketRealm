import { useMemo } from 'react';
import type { GameControllerState } from '../renderers/gameScreenRenderer.types';

export interface EquipmentStats {
  attack: number;
  defence: number;
  magicDefence: number;
  hp: number;
  dodge: number;
  accuracy: number;
  magicPower: number;
  rangedPower: number;
  luck: number;
  critChance: number;
  critDamage: number;
}

export function useEquipmentStats(equipment: GameControllerState['equipment']): EquipmentStats {
  return useMemo(() => {
    const stats: EquipmentStats = {
      attack: 0,
      defence: 0,
      magicDefence: 0,
      hp: 0,
      dodge: 0,
      accuracy: 0,
      magicPower: 0,
      rangedPower: 0,
      luck: 0,
      critChance: 0,
      critDamage: 0,
    };

    for (const entry of equipment) {
      const base = entry.item?.template?.baseStats as Record<string, unknown> | undefined;
      const bonus = entry.item?.bonusStats ?? undefined;
      for (const source of [base, bonus]) {
        if (!source) {
          continue;
        }
        if (typeof source.attack === 'number') stats.attack += source.attack;
        if (typeof source.armor === 'number') stats.defence += source.armor;
        if (typeof source.magicDefence === 'number') stats.magicDefence += source.magicDefence;
        if (typeof source.health === 'number') stats.hp += source.health;
        if (typeof source.dodge === 'number') stats.dodge += source.dodge;
        if (typeof source.accuracy === 'number') stats.accuracy += source.accuracy;
        if (typeof source.magicPower === 'number') stats.magicPower += source.magicPower;
        if (typeof source.rangedPower === 'number') stats.rangedPower += source.rangedPower;
        if (typeof source.luck === 'number') stats.luck += source.luck;
        if (typeof source.critChance === 'number') stats.critChance += source.critChance;
        if (typeof source.critDamage === 'number') stats.critDamage += source.critDamage;
      }
    }

    return stats;
  }, [equipment]);
}
