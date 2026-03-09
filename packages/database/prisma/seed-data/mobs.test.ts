import { describe, expect, it } from 'vitest';

import { buildPlayerCombatStats, doesAttackHit } from '../../../game-engine/src/combat/damageCalculator';
import { getAllMobTemplates } from './mobs';
import { IDS } from './ids';

const STARTER_TARGETS = {
  tutorialHitRateMin: 0.45,
  forestEdgeTier1HitRateMin: 0.4,
};

function getHitRate(accuracyBonus: number, targetDodge: number, targetEvasion = 0) {
  let hits = 0;
  for (let roll = 1; roll <= 20; roll += 1) {
    if (doesAttackHit(roll, accuracyBonus, targetDodge, targetEvasion)) {
      hits += 1;
    }
  }
  return hits / 20;
}

describe('mob seed starter combat targets', () => {
  const starterPlayer = buildPlayerCombatStats(
    80,
    100,
    {
      attackStyle: 'melee',
      skillLevel: 1,
      attributes: {
        vitality: 0,
        strength: 0,
        dexterity: 0,
        intelligence: 0,
        luck: 0,
        evasion: 0,
      },
    },
    {
      attack: 0,
      rangedPower: 0,
      magicPower: 0,
      accuracy: 0,
      armor: 0,
      magicDefence: 0,
      health: 0,
      dodge: 0,
    }
  );

  it('tutorial Field Mouse should stay within the starter hit-rate target', () => {
    const fieldMouse = getAllMobTemplates().find((mob) => mob.id === IDS.mobs.fieldMouse);
    expect(fieldMouse).toBeDefined();

    const hitRate = getHitRate(starterPlayer.accuracy, fieldMouse!.evasion);
    expect(hitRate).toBeGreaterThanOrEqual(STARTER_TARGETS.tutorialHitRateMin);
  });

  it('Forest Edge tier-1 mobs should stay within the early-zone hit-rate floor', () => {
    const forestEdgeTier1Mobs = getAllMobTemplates().filter(
      (mob) => mob.zoneId === IDS.zones.forestEdge && mob.explorationTier === 1
    );

    const outOfBand = forestEdgeTier1Mobs
      .map((mob) => ({
        name: mob.name,
        hitRate: getHitRate(starterPlayer.accuracy, mob.evasion),
      }))
      .filter((mob) => mob.hitRate < STARTER_TARGETS.forestEdgeTier1HitRateMin);

    expect(outOfBand).toEqual([]);
  });
});
