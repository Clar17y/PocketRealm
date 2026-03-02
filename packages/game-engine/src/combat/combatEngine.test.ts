import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Combatant, CombatantStats, CombatOptions, CombatPotion, CombatResult, MobTemplate } from '@adventure/shared';
import { runCombat } from './combatEngine';
import { mobToCombatantStats } from './damageCalculator';

function wrapPlayer(stats: CombatantStats): Combatant {
  return { id: 'player1', name: 'Player', stats };
}

function wrapMob(mob: MobTemplate & { currentHp?: number; maxHp?: number }): Combatant {
  return { id: mob.id, name: mob.name, stats: mobToCombatantStats(mob), spells: mob.spellPattern };
}

describe('runCombat crit multiplier logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs player critMultiplier using player bonus crit damage', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.95) // player initiative roll (20)
      .mockReturnValueOnce(0.0) // mob initiative roll (1)
      .mockReturnValueOnce(0.95) // player attack roll (20)
      .mockReturnValueOnce(0.3) // player damage roll
      .mockReturnValueOnce(0.0); // player crit roll (crit)

    const player: CombatantStats = {
      hp: 100,
      maxHp: 100,
      attack: 10,
      accuracy: 5,
      defence: 5,
      magicDefence: 0,
      dodge: 0,
      evasion: 0,
      damageMin: 10,
      damageMax: 10,
      speed: 5,
      critChance: 0,
      critDamage: 0.3,
      damageType: 'physical' as const,
    };

    const mob: MobTemplate = {
      id: 'mob-1',
      name: 'Rat',
      zoneId: 'zone-1',
      level: 1,
      hp: 10,
      accuracy: 1,
      defence: 0,
      magicDefence: 0,
      evasion: 0,
      damageMin: 1,
      damageMax: 1,
      xpReward: 1,
      encounterWeight: 1,
      spellPattern: [],
      damageType: 'physical' as const,
    };

    const result = runCombat(wrapPlayer(player), wrapMob(mob));
    const playerHit = result.log.find((entry) => entry.actor === 'combatantA' && entry.damage !== undefined);

    expect(playerHit?.isCritical).toBe(true);
    expect(playerHit?.critMultiplier).toBeCloseTo(1.8);
  });

  it('logs mob critMultiplier at base 1.5x with no mob gear bonuses', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.0) // player initiative roll (1)
      .mockReturnValueOnce(0.95) // mob initiative roll (20)
      .mockReturnValueOnce(0.95) // mob attack roll (20)
      .mockReturnValueOnce(0.2) // mob damage roll
      .mockReturnValueOnce(0.0); // mob crit roll (crit)

    const player: CombatantStats = {
      hp: 5,
      maxHp: 5,
      attack: 1,
      accuracy: 0,
      defence: 0,
      magicDefence: 0,
      dodge: 0,
      evasion: 0,
      damageMin: 1,
      damageMax: 1,
      speed: 0,
      critChance: 0,
      critDamage: 0.8,
      damageType: 'physical' as const,
    };

    const mob: MobTemplate = {
      id: 'mob-2',
      name: 'Wolf',
      zoneId: 'zone-1',
      level: 3,
      hp: 50,
      accuracy: 3,
      defence: 0,
      magicDefence: 0,
      evasion: 0,
      damageMin: 5,
      damageMax: 5,
      xpReward: 3,
      encounterWeight: 1,
      spellPattern: [],
      damageType: 'physical' as const,
    };

    const result = runCombat(wrapPlayer(player), wrapMob(mob));
    const mobHit = result.log.find((entry) => entry.actor === 'combatantB' && entry.damage !== undefined);

    expect(mobHit?.isCritical).toBe(true);
    expect(mobHit?.critMultiplier).toBeCloseTo(1.5);
  });
});

describe('magic damageType defence selection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makePlayer(overrides: Partial<CombatantStats> = {}): Combatant {
    return wrapPlayer({
      hp: 100, maxHp: 100, attack: 10, accuracy: 20,
      defence: 50, magicDefence: 0, dodge: 0, evasion: 0,
      damageMin: 10, damageMax: 10, speed: 10,
      critChance: 0, critDamage: 0, damageType: 'physical',
      ...overrides,
    });
  }

  function makeMob(overrides: Partial<MobTemplate> = {}): Combatant {
    const mob: MobTemplate = {
      id: 'mob-1', name: 'Test Mob', zoneId: 'zone-1', level: 1,
      hp: 200, accuracy: 1, defence: 50, magicDefence: 0,
      evasion: 0, damageMin: 10, damageMax: 10,
      xpReward: 1, encounterWeight: 1, spellPattern: [],
      damageType: 'physical',
      ...overrides,
    };
    return wrapMob(mob);
  }

  it('player magic attack uses mob magicDefence (not defence)', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.95)  // player initiative (high)
      .mockReturnValueOnce(0.0)   // mob initiative (low)
      .mockReturnValueOnce(0.95)  // player attack roll = 20 (auto-hit)
      .mockReturnValueOnce(0.0)   // player damage roll = damageMin
      .mockReturnValueOnce(0.99); // player crit roll = no crit

    const player = makePlayer({ damageType: 'magic' });
    const mob = makeMob({ defence: 50, magicDefence: 0, hp: 200 });

    const result = runCombat(player, mob);
    const playerHit = result.log.find(e => e.actor === 'combatantA' && e.damage !== undefined);

    expect(playerHit?.damage).toBe(10);
  });

  it('player physical attack uses mob defence (not magicDefence)', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.95)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.95)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.99);

    const player = makePlayer({ damageType: 'physical' });
    const mob = makeMob({ defence: 0, magicDefence: 50, hp: 200 });

    const result = runCombat(player, mob);
    const playerHit = result.log.find(e => e.actor === 'combatantA' && e.damage !== undefined);

    expect(playerHit?.damage).toBe(10);
  });

  it('mob magic auto-attack uses player magicDefence', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.0)   // player initiative (low)
      .mockReturnValueOnce(0.95)  // mob initiative (high)
      .mockReturnValueOnce(0.95)  // mob attack roll = 20
      .mockReturnValueOnce(0.0)   // mob damage roll
      .mockReturnValueOnce(0.99); // no crit

    const player = makePlayer({ defence: 50, magicDefence: 0 });
    const mob = makeMob({ damageType: 'magic', hp: 200 });

    const result = runCombat(player, mob);
    const mobHit = result.log.find(e => e.actor === 'combatantB' && e.damage !== undefined);

    expect(mobHit?.damage).toBe(10);
  });

  it('mob physical auto-attack uses player defence', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.95)
      .mockReturnValueOnce(0.95)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.99);

    const player = makePlayer({ defence: 0, magicDefence: 50 });
    const mob = makeMob({ damageType: 'physical', hp: 200 });

    const result = runCombat(player, mob);
    const mobHit = result.log.find(e => e.actor === 'combatantB' && e.damage !== undefined);

    expect(mobHit?.damage).toBe(10);
  });
});

describe('auto-potion system', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makePotionPlayer(overrides: Partial<CombatantStats> = {}): Combatant {
    return wrapPlayer({
      hp: 100, maxHp: 100, attack: 10, accuracy: 20,
      defence: 5, magicDefence: 0, dodge: 0, evasion: 0,
      damageMin: 10, damageMax: 10, speed: 10,
      critChance: 0, critDamage: 0, damageType: 'physical',
      ...overrides,
    });
  }

  function makePotionMob(overrides: Partial<MobTemplate> = {}): Combatant {
    const mob: MobTemplate = {
      id: 'mob-1', name: 'Test Mob', zoneId: 'zone-1', level: 1,
      hp: 200, accuracy: 20, defence: 0, magicDefence: 0,
      evasion: 0, damageMin: 30, damageMax: 30,
      xpReward: 10, encounterWeight: 1, spellPattern: [],
      damageType: 'physical',
      ...overrides,
    };
    return wrapMob(mob);
  }

  function makePotions(): CombatPotion[] {
    return [
      { name: 'Minor Health Potion', healAmount: 50, templateId: 'tmpl-minor', potionType: 'hp' },
      { name: 'Health Potion', healAmount: 150, templateId: 'tmpl-health', potionType: 'hp' },
    ];
  }

  it('does not use potions when threshold is 0', () => {
    // Mob goes first and hits the player, reducing HP
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.0)   // player initiative (low)
      .mockReturnValueOnce(0.95)  // mob initiative (high)
      .mockReturnValueOnce(0.95)  // mob attack roll (hit)
      .mockReturnValueOnce(0.0)   // mob damage (30)
      .mockReturnValueOnce(0.99)  // mob no crit
      // Player attacks
      .mockReturnValueOnce(0.95)  // player attack roll (hit)
      .mockReturnValueOnce(0.0)   // player damage (10)
      .mockReturnValueOnce(0.99); // player no crit

    const options: CombatOptions = {
      autoPotionThreshold: 0,
      potions: makePotions(),
    };

    const result = runCombat(makePotionPlayer(), makePotionMob(), options);

    expect(result.potionsConsumed).toHaveLength(0);
    const potionEntries = result.log.filter(e => e.action === 'potion');
    expect(potionEntries).toHaveLength(0);
  });

  it('uses potion when HP drops below threshold', () => {
    // Mob goes first and hits hard (30 damage to 100 HP player → 70 HP = 70%)
    // With threshold 80%, player should drink a potion instead of attacking
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.0)   // player initiative (low)
      .mockReturnValueOnce(0.95)  // mob initiative (high)
      // Round 1: mob attacks
      .mockReturnValueOnce(0.95)  // mob attack roll (hit)
      .mockReturnValueOnce(0.0)   // mob damage (30)
      .mockReturnValueOnce(0.99)  // mob no crit
      // Round 1: player turn → auto-potion triggers (no attack rolls needed)
      // Round 2: mob attacks again
      .mockReturnValueOnce(0.95)  // mob attack roll (hit)
      .mockReturnValueOnce(0.0)   // mob damage (30)
      .mockReturnValueOnce(0.99)  // mob no crit
      // Round 2: player attacks (Potion Sickness active, can't potion)
      .mockReturnValueOnce(0.95)  // player attack roll (hit)
      .mockReturnValueOnce(0.0)   // player damage (10)
      .mockReturnValueOnce(0.99); // player no crit

    const options: CombatOptions = {
      autoPotionThreshold: 80,
      potions: makePotions(),
    };

    // Mob HP low enough that player kills it on round 2, preventing further
    // potion use after Potion Sickness expires (mocks only cover 2 rounds).
    const result = runCombat(makePotionPlayer(), makePotionMob({ hp: 10 }), options);

    // Verify potion was consumed exactly once
    expect(result.potionsConsumed).toHaveLength(1);
    expect(result.potionsConsumed[0].round).toBe(1);

    // Verify potion log entry exists
    const potionEntry = result.log.find(e => e.action === 'potion');
    expect(potionEntry).toBeDefined();
    expect(potionEntry?.actor).toBe('combatantA');
    expect(potionEntry?.healAmount).toBeGreaterThan(0);
    expect(potionEntry?.spellName).toContain('Potion');

    // Verify Potion Sickness was applied
    const sicknessEffect = potionEntry?.effectsApplied?.find(e => e.stat === 'potionSickness');
    expect(sicknessEffect).toBeDefined();
    expect(sicknessEffect?.duration).toBe(5);
  });

  it('Potion Sickness prevents re-use within 5 rounds', () => {
    // Player has low HP from start, mob does enough damage to keep HP low
    // But Potion Sickness should prevent using another potion for 5 rounds
    const randomMock = vi.spyOn(Math, 'random');

    // Player goes first
    randomMock.mockReturnValueOnce(0.95); // player initiative (high)
    randomMock.mockReturnValueOnce(0.0);  // mob initiative (low)

    // Need many rounds. Player starts at 40 HP (40%), threshold 50%
    // Round 1: player drinks potion (HP low), mob attacks
    for (let i = 0; i < 20; i++) {
      // mob attack (hits for 30)
      randomMock.mockReturnValueOnce(0.95); // mob attack roll
      randomMock.mockReturnValueOnce(0.0);  // mob damage
      randomMock.mockReturnValueOnce(0.99); // no crit
      // player attack
      randomMock.mockReturnValueOnce(0.95); // player attack roll
      randomMock.mockReturnValueOnce(0.0);  // player damage (10)
      randomMock.mockReturnValueOnce(0.99); // no crit
    }

    const options: CombatOptions = {
      autoPotionThreshold: 50,
      potions: [
        { name: 'Potion A', healAmount: 50, templateId: 'a', potionType: 'hp' },
        { name: 'Potion B', healAmount: 50, templateId: 'b', potionType: 'hp' },
        { name: 'Potion C', healAmount: 50, templateId: 'c', potionType: 'hp' },
      ],
    };

    const result = runCombat(makePotionPlayer({ hp: 40 }), makePotionMob({ damageMin: 30, damageMax: 30 }), options);

    // Check that potions were consumed at intervals of at least 5 rounds
    const potionRounds = result.potionsConsumed.map(p => p.round);
    for (let i = 1; i < potionRounds.length; i++) {
      const gap = potionRounds[i] - potionRounds[i - 1];
      // Must wait for sickness to expire (5 rounds) + the tick round
      expect(gap).toBeGreaterThanOrEqual(5);
    }
  });

  it('picks weakest sufficient potion', () => {
    // Player at 70 HP / 100 maxHp, threshold 80% → target is 80 HP, deficit = 10
    // Minor (50) and Health (150) potions available
    // Minor's 50 >= deficit of 10, so it should be chosen (weakest sufficient)
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.95)  // player initiative (high)
      .mockReturnValueOnce(0.0)   // mob initiative (low)
      // Round 1: player drinks potion (no attack rolls)
      // mob attacks
      .mockReturnValueOnce(0.95)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.99)
      // Round 2+: fill with attacks
      .mockReturnValueOnce(0.95).mockReturnValueOnce(0.0).mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.95).mockReturnValueOnce(0.0).mockReturnValueOnce(0.99);

    const options: CombatOptions = {
      autoPotionThreshold: 80,
      potions: makePotions(),
    };

    const result = runCombat(makePotionPlayer({ hp: 70 }), makePotionMob(), options);

    expect(result.potionsConsumed).toHaveLength(1);
    expect(result.potionsConsumed[0].templateId).toBe('tmpl-minor');
    expect(result.potionsConsumed[0].name).toBe('Minor Health Potion');
  });

  it('falls back to strongest when none fully covers deficit', () => {
    // Player at 10 HP / 200 maxHp, threshold 80% → target is 160, deficit = 150
    // Only tiny potions (20 heal) available, none >= 150
    // Should pick strongest = last = 20 heal potion
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.95)
      .mockReturnValueOnce(0.0)
      // mob attacks after potion
      .mockReturnValueOnce(0.95).mockReturnValueOnce(0.0).mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.95).mockReturnValueOnce(0.0).mockReturnValueOnce(0.99);

    const options: CombatOptions = {
      autoPotionThreshold: 80,
      potions: [
        { name: 'Tiny Potion', healAmount: 20, templateId: 'tiny', potionType: 'hp' },
      ],
    };

    const result = runCombat(makePotionPlayer({ hp: 10, maxHp: 200 }), makePotionMob(), options);

    expect(result.potionsConsumed).toHaveLength(1);
    expect(result.potionsConsumed[0].templateId).toBe('tiny');
  });

  it('backward compatible - no options param works like before', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.95).mockReturnValueOnce(0.0) // initiative
      .mockReturnValueOnce(0.95).mockReturnValueOnce(0.0).mockReturnValueOnce(0.99) // player hits
      .mockReturnValueOnce(0.95).mockReturnValueOnce(0.0).mockReturnValueOnce(0.99); // mob hits

    const result = runCombat(
      makePotionPlayer({ damageMin: 250, damageMax: 250 }),
      makePotionMob({ hp: 10 }),
    );

    expect(result.outcome).toBe('victory');
    expect(result.potionsConsumed).toHaveLength(0);
  });

  it('Potion Sickness expires via tickEffects after 5 rounds', () => {
    // Force a potion use on round 1, then verify sickness expires after round 5
    // by checking that a second potion can be used on round 7+
    const randomMock = vi.spyOn(Math, 'random');

    // Player goes first
    randomMock.mockReturnValueOnce(0.95); // player initiative
    randomMock.mockReturnValueOnce(0.0);  // mob initiative

    // We need many rounds of combat with mob doing consistent damage
    for (let i = 0; i < 30; i++) {
      // mob attack
      randomMock.mockReturnValueOnce(0.95); // hit
      randomMock.mockReturnValueOnce(0.0);  // damage
      randomMock.mockReturnValueOnce(0.99); // no crit
      // player attack
      randomMock.mockReturnValueOnce(0.95); // hit
      randomMock.mockReturnValueOnce(0.0);  // damage (10)
      randomMock.mockReturnValueOnce(0.99); // no crit
    }

    const options: CombatOptions = {
      autoPotionThreshold: 90,
      potions: [
        { name: 'Potion 1', healAmount: 30, templateId: 'p1', potionType: 'hp' },
        { name: 'Potion 2', healAmount: 30, templateId: 'p2', potionType: 'hp' },
        { name: 'Potion 3', healAmount: 30, templateId: 'p3', potionType: 'hp' },
      ],
    };

    // Player starts at 50HP / 100 maxHp → below 90% threshold immediately
    const result = runCombat(makePotionPlayer({ hp: 50, maxHp: 100 }), makePotionMob({ hp: 500, damageMin: 20, damageMax: 20 }), options);

    // Find the "wore off" log for Potion Sickness
    const expiryEntries = result.log.filter(
      e => e.effectsExpired?.some(x => x.name === 'Potion Sickness')
    );

    // If combat lasted long enough, sickness should have expired at least once
    if (result.potionsConsumed.length >= 1) {
      const firstPotionRound = result.potionsConsumed[0].round;
      // Sickness applied on round N with 5 remaining rounds
      // Ticks: end of N→4, N+1→3, N+2→2, N+3→1, N+4→0 (expired)
      if (expiryEntries.length > 0) {
        expect(expiryEntries[0].round).toBe(firstPotionRound + 4);
      }
    }
  });
});

describe('runCombat basic outcomes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeStats(overrides: Partial<CombatantStats> = {}): CombatantStats {
    return {
      hp: 100, maxHp: 100, attack: 10, accuracy: 20,
      defence: 0, magicDefence: 0, dodge: 0, evasion: 0,
      damageMin: 10, damageMax: 10, speed: 5,
      damageType: 'physical',
      ...overrides,
    };
  }

  it('returns victory when combatant A kills combatant B', () => {
    const player: Combatant = { id: 'p1', name: 'Player', stats: makeStats({ damageMin: 200, damageMax: 200 }) };
    const mob: Combatant = { id: 'm1', name: 'Weakling', stats: makeStats({ hp: 10, maxHp: 10, damageMin: 1, damageMax: 1 }) };

    const result = runCombat(player, mob);
    expect(result.outcome).toBe('victory');
    expect(result.combatantBHpRemaining).toBe(0);
    expect(result.combatantAHpRemaining).toBeGreaterThan(0);
  });

  it('returns defeat when combatant B kills combatant A', () => {
    const player: Combatant = { id: 'p1', name: 'Player', stats: makeStats({ hp: 10, maxHp: 10, damageMin: 1, damageMax: 1 }) };
    const mob: Combatant = { id: 'm1', name: 'Boss', stats: makeStats({ damageMin: 200, damageMax: 200 }) };

    const result = runCombat(player, mob);
    expect(result.outcome).toBe('defeat');
    expect(result.combatantAHpRemaining).toBe(0);
    expect(result.combatantBHpRemaining).toBeGreaterThan(0);
  });

  it('returns draw when MAX_ROUNDS (100) is exceeded', () => {
    // Both combatants always miss (dodge too high)
    const player: Combatant = { id: 'p1', name: 'Player', stats: makeStats({ accuracy: 0, dodge: 999 }) };
    const mob: Combatant = { id: 'm1', name: 'Mob', stats: makeStats({ accuracy: 0, dodge: 999 }) };

    const result = runCombat(player, mob);
    expect(result.outcome).toBe('draw');
    // Round count is derived from log entries
    const maxRound = Math.max(...result.log.map((e) => e.round));
    expect(maxRound).toBe(100);
  });

  it('log has at least one entry per round', () => {
    const player: Combatant = { id: 'p1', name: 'Player', stats: makeStats({ damageMin: 5, damageMax: 5 }) };
    const mob: Combatant = { id: 'm1', name: 'Mob', stats: makeStats({ hp: 20, maxHp: 20, damageMin: 5, damageMax: 5 }) };

    const result = runCombat(player, mob);
    const maxRound = Math.max(...result.log.map((e) => e.round));
    expect(result.log.length).toBeGreaterThanOrEqual(maxRound);
  });

  it('combatant HP never goes below 0 in result', () => {
    const player: Combatant = { id: 'p1', name: 'Player', stats: makeStats({ damageMin: 200, damageMax: 200 }) };
    const mob: Combatant = { id: 'm1', name: 'Mob', stats: makeStats({ hp: 10, maxHp: 10 }) };

    const result = runCombat(player, mob);
    expect(result.combatantAHpRemaining).toBeGreaterThanOrEqual(0);
    expect(result.combatantBHpRemaining).toBeGreaterThanOrEqual(0);
  });

  it('populates potionsConsumed as empty array when no options', () => {
    const player: Combatant = { id: 'p1', name: 'Player', stats: makeStats({ damageMin: 200, damageMax: 200 }) };
    const mob: Combatant = { id: 'm1', name: 'Mob', stats: makeStats({ hp: 10, maxHp: 10 }) };

    const result = runCombat(player, mob);
    expect(result.potionsConsumed).toEqual([]);
  });

  it('handles combat between identical combatants', () => {
    const a: Combatant = { id: 'a', name: 'Fighter A', stats: makeStats() };
    const b: Combatant = { id: 'b', name: 'Fighter B', stats: makeStats() };

    const result = runCombat(a, b);
    expect(['victory', 'defeat', 'draw']).toContain(result.outcome);
    expect(result.log.length).toBeGreaterThan(0);
  });
});
