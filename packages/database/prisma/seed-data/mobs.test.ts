import { describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/shared', async () => import('../../../shared/src/index'));

import { buildPlayerCombatStats, calculateHitChance } from '../../../game-engine/src/combat/damageCalculator';
import { STARTER_LOADOUT } from '../../../shared/src/constants/gameConstants';
import { getAllItemTemplates } from './items';
import { getAllMobTemplates } from './mobs';
import { IDS } from './ids';
import { STARTER_TARGETS } from './validation';

describe('mob seed starter combat targets', () => {
  const starterOffHand = getAllItemTemplates().find((item) => item.id === STARTER_LOADOUT.tutorialOffHandTemplateId);

  it('mob names should not contain reserved encounter role tokens', () => {
    const reserved = ['Elite', 'Mini-Boss'];
    const offenders = getAllMobTemplates()
      .map((mob) => mob.name)
      .filter((name) => reserved.some((token) => name.split(/\s+/).includes(token)));

    expect(offenders).toEqual([]);
  });

  it('starter loadout should seed a real tutorial off-hand item', () => {
    expect(starterOffHand).toMatchObject({
      id: STARTER_LOADOUT.tutorialOffHandTemplateId,
      name: 'Wayfinder Buckler',
      slot: 'off_hand',
    });
  });

  const starterCombatant = buildPlayerCombatStats(
    100,
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
      attack: starterOffHand?.baseStats.attack ?? 0,
      rangedPower: starterOffHand?.baseStats.rangedPower ?? 0,
      magicPower: starterOffHand?.baseStats.magicPower ?? 0,
      accuracy: starterOffHand?.baseStats.accuracy ?? 0,
      armor: starterOffHand?.baseStats.armor ?? 0,
      magicDefence: starterOffHand?.baseStats.magicDefence ?? 0,
      health: starterOffHand?.baseStats.health ?? 0,
      dodge: starterOffHand?.baseStats.dodge ?? 0,
      critChance: starterOffHand?.baseStats.critChance ?? 0,
      critDamage: starterOffHand?.baseStats.critDamage ?? 0,
    },
  );

  it('tutorial Field Mouse should stay within the starter hit-rate target', () => {
    const fieldMouse = getAllMobTemplates().find((mob) => mob.id === IDS.mobs.fieldMouse);
    expect(fieldMouse).toBeDefined();

    const hitChance = calculateHitChance('pve_open_world', starterCombatant.accuracy, fieldMouse!.evasion).hitChance;
    expect(hitChance).toBeGreaterThanOrEqual(STARTER_TARGETS.tutorialHitChanceMin);
  });

  it('Forest Edge tier-1 mobs should stay within the early-zone hit-rate floor', () => {
    const forestEdgeTier1Mobs = getAllMobTemplates().filter(
      (mob) => mob.zoneId === IDS.zones.forestEdge && mob.explorationTier === 1 && !mob.isExpeditionMob
    );

    const outOfBand = forestEdgeTier1Mobs
      .map((mob) => ({
        name: mob.name,
        hitChance: calculateHitChance('pve_open_world', starterCombatant.accuracy, mob.evasion).hitChance,
      }))
      .filter((mob) => mob.hitChance < STARTER_TARGETS.forestEdgeTier1HitChanceMin);

    expect(outOfBand).toEqual([]);
  });

  it('tutorial Field Mouse should still threaten a fresh player often enough to keep the fight moving', () => {
    const fieldMouse = getAllMobTemplates().find((mob) => mob.id === IDS.mobs.fieldMouse);
    expect(fieldMouse).toBeDefined();

    const hitChance = calculateHitChance('pve_open_world', fieldMouse!.accuracy, starterCombatant.dodge + starterCombatant.evasion).hitChance;
    expect(hitChance).toBeGreaterThanOrEqual(STARTER_TARGETS.tutorialEnemyHitChanceMin);
  });
});
