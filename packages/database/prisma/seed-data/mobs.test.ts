import { describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/shared', async () => import('../../../shared/src/index'));

import { calculateHitChance } from '../../../game-engine/src/combat/damageCalculator';
import { getAllMobTemplates } from './mobs';
import { IDS } from './ids';
import { STARTER_TARGETS } from './validation';

describe('mob seed starter combat targets', () => {
  const starterAccuracy = STARTER_TARGETS.openWorldStarterHitScore;

  it('tutorial Field Mouse should stay within the starter hit-rate target', () => {
    const fieldMouse = getAllMobTemplates().find((mob) => mob.id === IDS.mobs.fieldMouse);
    expect(fieldMouse).toBeDefined();

    const hitChance = calculateHitChance('pve_open_world', starterAccuracy, fieldMouse!.evasion).hitChance;
    expect(hitChance).toBeGreaterThanOrEqual(STARTER_TARGETS.tutorialHitChanceMin);
  });

  it('Forest Edge tier-1 mobs should stay within the early-zone hit-rate floor', () => {
    const forestEdgeTier1Mobs = getAllMobTemplates().filter(
      (mob) => mob.zoneId === IDS.zones.forestEdge && mob.explorationTier === 1
    );

    const outOfBand = forestEdgeTier1Mobs
      .map((mob) => ({
        name: mob.name,
        hitChance: calculateHitChance('pve_open_world', starterAccuracy, mob.evasion).hitChance,
      }))
      .filter((mob) => mob.hitChance < STARTER_TARGETS.forestEdgeTier1HitChanceMin);

    expect(outOfBand).toEqual([]);
  });
});
