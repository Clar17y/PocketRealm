import { describe, expect, it } from 'vitest';
import type { ExpeditionRoundLog } from '@pocketrealm/shared';
import { countEncounterSiteHits } from './encounterSiteCombatCore';

function makeRoundLog(overrides: Partial<ExpeditionRoundLog['phases']> = {}): ExpeditionRoundLog {
  return {
    round: 1,
    roomIndex: 0,
    phases: {
      playerAttacks: [],
      defences: [],
      mobActions: [],
      healing: [],
      effectTicks: [],
      outcome: { mobsAlive: 0, mobsKilled: 0, playersAlive: 1, playersKnockedOut: 0, roomCleared: false, wipe: false },
      ...overrides,
    },
    telegraphs: [],
  };
}

describe('countEncounterSiteHits', () => {
  it('returns zero for empty rounds', () => {
    const result = countEncounterSiteHits([]);
    expect(result.playerHitsLanded).toBe(0);
    expect(result.mobHitsLanded).toBe(0);
  });

  it('counts player attack hits', () => {
    const log = makeRoundLog({
      playerAttacks: [
        { entryType: 'attack', playerId: 'p1', username: 'u', actionId: 'a', actionLabel: 'A', targetMobId: 'm1', targetMobName: 'M', hitChance: 0.5, hitRollValue: 0.1, attackerHitScore: 10, defenderAvoidScore: 1, hit: true, crit: false, damageRoll: 5, totalDamage: 5, staminaCost: 0, manaCost: 0 },
        { entryType: 'attack', playerId: 'p1', username: 'u', actionId: 'a', actionLabel: 'A', targetMobId: 'm1', targetMobName: 'M', hitChance: 0.5, hitRollValue: 0.9, attackerHitScore: 10, defenderAvoidScore: 1, hit: false, crit: false, staminaCost: 0, manaCost: 0 },
      ],
    });
    const result = countEncounterSiteHits([log]);
    expect(result.playerHitsLanded).toBe(1);
    expect(result.playerWeaponActionIds).toEqual(['a']);
  });

  it('counts splash cascade hits', () => {
    const log = makeRoundLog({
      playerAttacks: [
        {
          entryType: 'attack', playerId: 'p1', username: 'u', actionId: 'a', actionLabel: 'A',
          targetMobId: 'm1', targetMobName: 'M', hitChance: 0.5, hitRollValue: 0.1,
          attackerHitScore: 10, defenderAvoidScore: 1, hit: true, crit: false,
          damageRoll: 5, totalDamage: 5, staminaCost: 0, manaCost: 0,
          splashCascade: [
            { targetMobName: 'M2', hitChance: 0.5, hitRollValue: 0.1, attackerHitScore: 10, defenderAvoidScore: 1, hit: true, crit: false, damageRoll: 5, totalDamage: 5 },
            { targetMobName: 'M3', hitChance: 0.5, hitRollValue: 0.9, attackerHitScore: 10, defenderAvoidScore: 1, hit: false, crit: false },
          ],
        },
      ],
    });
    const result = countEncounterSiteHits([log]);
    // 1 primary hit + 1 splash hit (second splash missed)
    expect(result.playerHitsLanded).toBe(2);
    expect(result.playerWeaponActionIds).toEqual(['a', 'a']);
  });

  it('counts mob hits (non-dodged targets with damage)', () => {
    const log = makeRoundLog({
      mobActions: [
        {
          mobId: 'm1', mobName: 'M', actionId: 'a', actionLabel: 'A', targetMode: 'single_target', wasTelegraphed: false,
          targets: [
            { playerId: 'p1', username: 'u', damageTaken: 5, blocked: false, dodged: false, knockedOut: false },
            { playerId: 'p1', username: 'u', damageTaken: 0, blocked: false, dodged: true, knockedOut: false },
          ],
        },
        {
          mobId: 'm2', mobName: 'M2', actionId: 'a', actionLabel: 'A', targetMode: 'single_target', wasTelegraphed: false,
          targets: [
            { playerId: 'p1', username: 'u', damageTaken: 3, blocked: false, dodged: false, knockedOut: false },
          ],
        },
      ],
    });
    const result = countEncounterSiteHits([log]);
    // 2 non-dodged hits with damage, 1 dodged
    expect(result.mobHitsLanded).toBe(2);
  });

  it('ignores exhausted and defensive player actions', () => {
    const log = makeRoundLog({
      playerAttacks: [
        { entryType: 'exhausted', playerId: 'p1', username: 'u', intendedActionId: 'a', intendedActionLabel: 'A', fallbackActionId: 'b', fallbackActionLabel: 'B', reason: 'stamina' },
        { entryType: 'defensive', playerId: 'p1', username: 'u', actionId: 'defend', actionLabel: 'Defend' },
      ] as ExpeditionRoundLog['phases']['playerAttacks'],
    });
    const result = countEncounterSiteHits([log]);
    expect(result.playerHitsLanded).toBe(0);
  });

  it('accumulates across multiple rounds', () => {
    const round1 = makeRoundLog({
      playerAttacks: [
        { entryType: 'attack', playerId: 'p1', username: 'u', actionId: 'a', actionLabel: 'A', targetMobId: 'm1', targetMobName: 'M', hitChance: 0.5, hitRollValue: 0.1, attackerHitScore: 10, defenderAvoidScore: 1, hit: true, crit: false, damageRoll: 5, totalDamage: 5, staminaCost: 0, manaCost: 0 },
      ],
      mobActions: [
        { mobId: 'm1', mobName: 'M', actionId: 'a', actionLabel: 'A', targetMode: 'single_target', wasTelegraphed: false, targets: [{ playerId: 'p1', username: 'u', damageTaken: 3, blocked: false, dodged: false, knockedOut: false }] },
      ],
    });
    const round2 = makeRoundLog({
      playerAttacks: [
        { entryType: 'attack', playerId: 'p1', username: 'u', actionId: 'a', actionLabel: 'A', targetMobId: 'm1', targetMobName: 'M', hitChance: 0.5, hitRollValue: 0.1, attackerHitScore: 10, defenderAvoidScore: 1, hit: true, crit: false, damageRoll: 8, totalDamage: 8, staminaCost: 0, manaCost: 0 },
      ],
      mobActions: [
        { mobId: 'm1', mobName: 'M', actionId: 'a', actionLabel: 'A', targetMode: 'single_target', wasTelegraphed: false, targets: [{ playerId: 'p1', username: 'u', damageTaken: 0, blocked: false, dodged: true, knockedOut: false }] },
      ],
    });
    const result = countEncounterSiteHits([round1, round2]);
    expect(result.playerHitsLanded).toBe(2);
    expect(result.mobHitsLanded).toBe(1); // round 2 mob dodged
  });
});
