import { vi, describe, it, expect, afterEach } from 'vitest';
import type { CombatantStats, ActionDefinition, CombatTemplateSlotData, PerActionScaling } from '@adventure/shared';
import { BASE_ACTION_DEFINITIONS, COMBAT_ACTION_CONSTANTS } from '@adventure/shared';
import { runTemplateCombat, type TemplateCombatant } from './templateCombatEngine';

// --- Helpers ---

function makeStats(overrides: Partial<CombatantStats> = {}): CombatantStats {
  return {
    hp: 100,
    maxHp: 100,
    attack: 10,
    accuracy: 20,
    defence: 0,
    magicDefence: 0,
    dodge: 0,
    evasion: 0,
    damageMin: 10,
    damageMax: 10,
    speed: 5,
    damageType: 'physical',
    ...overrides,
  };
}

function templateOf(...actionIds: string[]): CombatTemplateSlotData[] {
  return actionIds.map((id, i) => ({ id: `slot-${i}`, sortOrder: i, actionId: id }));
}

function makeCombatant(
  name: string,
  overrides: Partial<TemplateCombatant> = {},
): TemplateCombatant {
  return {
    id: `${name.toLowerCase()}-1`,
    name,
    stats: makeStats(),
    template: templateOf('light_attack'),
    stamina: 100,
    maxStamina: 100,
    staminaRegenPerRound: 10,
    mana: 50,
    maxMana: 50,
    manaRegenPerRound: 5,
    actionDefinitions: BASE_ACTION_DEFINITIONS,
    ...overrides,
  };
}

/**
 * Mock Math.random to return deterministic values.
 * The engine uses Math.random via damageCalculator functions:
 * - rollInitiative: rollD20 + speed = floor(random*20)+1 + speed
 * - rollD20: floor(random*20)+1
 * - rollDamage: floor(random*(max-min+1))+min
 * - isCriticalHit: random < critChance
 *
 * This helper creates a sequence that:
 * - Sets initiative (A first by default)
 * - Makes attacks always hit (roll 18+)
 * - Returns min damage
 * - Never crits
 */
function mockCombatRandom(overrides?: {
  initA?: number;     // 0..1 → d20 for A initiative
  initB?: number;     // 0..1 → d20 for B initiative
  attackRoll?: number; // 0..1 → d20 for attack rolls (repeated)
  damageRoll?: number; // 0..1 → damage roll position (repeated)
  critRoll?: number;   // 0..1 → crit check (repeated)
}) {
  const initA = overrides?.initA ?? 0.9;   // d20 = 19
  const initB = overrides?.initB ?? 0.1;   // d20 = 3
  const attackRoll = overrides?.attackRoll ?? 0.85; // d20 = 18 (hits)
  const damageRoll = overrides?.damageRoll ?? 0.0;  // min damage
  const critRoll = overrides?.critRoll ?? 0.99;      // no crit

  let callCount = 0;
  return vi.spyOn(Math, 'random').mockImplementation(() => {
    callCount++;
    // First two calls are initiative rolls
    if (callCount === 1) return initA;
    if (callCount === 2) return initB;
    // After that, repeating pattern: attackRoll, damageRoll, critRoll
    const phase = (callCount - 3) % 3;
    if (phase === 0) return attackRoll;
    if (phase === 1) return damageRoll;
    return critRoll;
  });
}

// --- Tests ---

describe('runTemplateCombat', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic combat log structure', () => {
    it('produces valid combat log with correct structure for light attack loops', () => {
      mockCombatRandom();

      const a = makeCombatant('Player', {
        stats: makeStats({ damageMin: 30, damageMax: 30, hp: 100, maxHp: 100 }),
      });
      const b = makeCombatant('Goblin', {
        stats: makeStats({ damageMin: 5, damageMax: 5, hp: 50, maxHp: 50 }),
      });

      const result = runTemplateCombat(a, b);

      expect(result.outcome).toBe('victory');
      expect(result.log.length).toBeGreaterThan(0);

      for (const entry of result.log) {
        expect(entry).toHaveProperty('combatantAAction');
        expect(entry).toHaveProperty('combatantBAction');
        expect(typeof entry.combatantAStaminaAfter).toBe('number');
        expect(typeof entry.combatantBStaminaAfter).toBe('number');
        expect(typeof entry.combatantAManaAfter).toBe('number');
        expect(typeof entry.combatantBManaAfter).toBe('number');
      }
    });
  });

  describe('template looping', () => {
    it('loops a 6-action template correctly over 12 rounds', () => {
      mockCombatRandom();

      const sixActionTemplate = templateOf(
        'light_attack', 'normal_attack', 'light_attack',
        'defend', 'light_attack', 'light_attack',
      );

      const a = makeCombatant('Player', {
        template: sixActionTemplate,
        stats: makeStats({ hp: 5000, maxHp: 5000, damageMin: 5, damageMax: 5 }),
        stamina: 500,
        maxStamina: 500,
      });
      const b = makeCombatant('Goblin', {
        template: templateOf('defend'),
        stats: makeStats({ hp: 5000, maxHp: 5000, damageMin: 1, damageMax: 1 }),
      });

      const result = runTemplateCombat(a, b);

      // Verify template loops correctly
      const aEntries = result.log.filter(
        (e) => e.actor === 'combatantA' && e.action !== 'regen' && e.round >= 1 && e.round <= 12,
      );

      // Round 1 & 7 → index 0 → light_attack
      const round1 = aEntries.find((e) => e.round === 1);
      const round7 = aEntries.find((e) => e.round === 7);
      expect(round1?.combatantAAction).toBe('light_attack');
      expect(round7?.combatantAAction).toBe('light_attack');

      // Round 2 & 8 → index 1 → normal_attack
      const round2 = aEntries.find((e) => e.round === 2);
      const round8 = aEntries.find((e) => e.round === 8);
      expect(round2?.combatantAAction).toBe('normal_attack');
      expect(round8?.combatantAAction).toBe('normal_attack');

      // Round 4 & 10 → index 3 → defend
      const round4 = aEntries.find((e) => e.round === 4);
      const round10 = aEntries.find((e) => e.round === 10);
      expect(round4?.combatantAAction).toBe('defend');
      expect(round10?.combatantAAction).toBe('defend');
    });
  });

  describe('resource depletion and exhaustion', () => {
    it('falls back to Defend when resources depleted (wasExhausted flag)', () => {
      mockCombatRandom();

      // heavy_attack costs 40 stamina; A starts with exactly 40, no regen
      const a = makeCombatant('Player', {
        template: templateOf('heavy_attack'),
        stamina: 40,
        maxStamina: 40,
        staminaRegenPerRound: 0,
        stats: makeStats({ hp: 500, maxHp: 500, damageMin: 5, damageMax: 5 }),
      });
      const b = makeCombatant('Goblin', {
        template: templateOf('light_attack'),
        stats: makeStats({ hp: 500, maxHp: 500, damageMin: 1, damageMax: 1 }),
      });

      const result = runTemplateCombat(a, b);

      // Round 1: A can afford heavy_attack (40 stamina). Costs deducted after both act.
      // Round 2: A now has 0 stamina → falls back to Defend
      const round2Entries = result.log.filter((e) => e.round === 2 && e.actor === 'combatantA');
      const exhaustedEntry = round2Entries.find((e) => e.wasExhausted === true);
      expect(exhaustedEntry).toBeDefined();
      expect(exhaustedEntry?.combatantAAction).toBe('defend');
    });
  });

  describe('counter and ward interactions', () => {
    it('Counter avoids physical attack (guaranteed_miss in log)', () => {
      mockCombatRandom();

      const a = makeCombatant('Player', {
        template: templateOf('normal_attack'),
        stats: makeStats({ hp: 200, maxHp: 200, damageMin: 50, damageMax: 50 }),
      });
      const b = makeCombatant('Goblin', {
        template: templateOf('counter'),
        stats: makeStats({ hp: 200, maxHp: 200, damageMin: 5, damageMax: 5 }),
        stamina: 500,
        maxStamina: 500,
      });

      const result = runTemplateCombat(a, b);

      // A's physical attack should be blocked by B's counter
      const round1AEntries = result.log.filter((e) => e.round === 1 && e.actor === 'combatantA');
      const blockedEntry = round1AEntries.find((e) => e.message.includes('avoids'));
      expect(blockedEntry).toBeDefined();
      expect(blockedEntry?.damage).toBeUndefined();
    });

    it('Ward resists spell (guaranteed_miss in log)', () => {
      mockCombatRandom();

      const magicSpell: ActionDefinition = {
        id: 'fireball',
        name: 'Fireball',
        description: 'Magic damage',
        actionType: 'damage_spell',
        category: 'offensive',
        cost: { stamina: 15, mana: 30 },
        damageMultiplier: 1.0,
        damageType: 'magic',
      };

      const customDefs = { ...BASE_ACTION_DEFINITIONS, fireball: magicSpell };

      const a = makeCombatant('Mage', {
        template: templateOf('fireball'),
        actionDefinitions: customDefs,
        stats: makeStats({ hp: 200, maxHp: 200, damageMin: 20, damageMax: 20 }),
        mana: 500,
        maxMana: 500,
      });
      const b = makeCombatant('Defender', {
        template: templateOf('ward'),
        stats: makeStats({ hp: 200, maxHp: 200, damageMin: 5, damageMax: 5 }),
        mana: 500,
        maxMana: 500,
      });

      const result = runTemplateCombat(a, b);

      const round1AEntries = result.log.filter((e) => e.round === 1 && e.actor === 'combatantA');
      const blockedEntry = round1AEntries.find((e) => e.message.includes('avoids'));
      expect(blockedEntry).toBeDefined();
      expect(blockedEntry?.damage).toBeUndefined();
    });
  });

  describe('buff system', () => {
    it('Buff is applied, tracked, and expires after duration', () => {
      mockCombatRandom();

      const buffAction: ActionDefinition = {
        id: 'battle_cry',
        name: 'Battle Cry',
        description: 'Buff attack',
        actionType: 'buff',
        category: 'supportive',
        cost: { stamina: 10, mana: 0 },
        isChanneling: true,
        effect: {
          name: 'Battle Cry',
          stat: 'attack',
          modifier: 5,
          duration: 3,
        },
      };

      const customDefs = { ...BASE_ACTION_DEFINITIONS, battle_cry: buffAction };

      const a = makeCombatant('Player', {
        template: templateOf('battle_cry', 'light_attack', 'light_attack', 'light_attack', 'light_attack'),
        actionDefinitions: customDefs,
        stats: makeStats({ hp: 500, maxHp: 500, damageMin: 10, damageMax: 10 }),
        stamina: 500,
        maxStamina: 500,
      });
      const b = makeCombatant('Goblin', {
        template: templateOf('light_attack'),
        stats: makeStats({ hp: 500, maxHp: 500, damageMin: 1, damageMax: 1 }),
      });

      const result = runTemplateCombat(a, b);

      // Round 1: A uses Battle Cry (supportive, logged as 'spell')
      const buffEntry = result.log.find(
        (e) => e.round === 1 && e.actor === 'combatantA' && e.spellName === 'Battle Cry',
      );
      expect(buffEntry).toBeDefined();
      expect(buffEntry?.effectsApplied).toBeDefined();
      expect(buffEntry?.effectsApplied?.[0]?.stat).toBe('attack');
      expect(buffEntry?.effectsApplied?.[0]?.modifier).toBe(5);
      expect(buffEntry?.effectsApplied?.[0]?.duration).toBe(3);

      // The buff expires after 3 rounds of ticking
      expect(result.totalRounds).toBeGreaterThanOrEqual(4);
    });
  });

  describe('combat outcomes', () => {
    it('Combat ends on death (victory outcome)', () => {
      mockCombatRandom();

      const a = makeCombatant('Player', {
        stats: makeStats({ damageMin: 200, damageMax: 200 }),
      });
      const b = makeCombatant('Goblin', {
        stats: makeStats({ hp: 10, maxHp: 10, damageMin: 1, damageMax: 1 }),
      });

      const result = runTemplateCombat(a, b);

      expect(result.outcome).toBe('victory');
      expect(result.combatantBHpRemaining).toBe(0);
      expect(result.combatantAHpRemaining).toBeGreaterThan(0);
    });

    it('Combat ends on death (defeat outcome)', () => {
      // B goes first (higher initiative)
      mockCombatRandom({ initA: 0.1, initB: 0.9 });

      const a = makeCombatant('Player', {
        stats: makeStats({ hp: 10, maxHp: 10, damageMin: 1, damageMax: 1 }),
      });
      const b = makeCombatant('Boss', {
        stats: makeStats({ damageMin: 200, damageMax: 200 }),
      });

      const result = runTemplateCombat(a, b);

      expect(result.outcome).toBe('defeat');
      expect(result.combatantAHpRemaining).toBe(0);
    });

    it('Max 100 rounds results in draw', () => {
      // All random calls return 0.0: initiative d20=1, attack d20=1 (always misses)
      vi.spyOn(Math, 'random').mockReturnValue(0.0);

      const a = makeCombatant('Player', {
        stats: makeStats({ hp: 100, maxHp: 100, dodge: 999, accuracy: 0, speed: 0 }),
      });
      const b = makeCombatant('Goblin', {
        stats: makeStats({ hp: 100, maxHp: 100, dodge: 999, accuracy: 0, speed: 0 }),
      });

      const result = runTemplateCombat(a, b);

      expect(result.outcome).toBe('draw');
      expect(result.totalRounds).toBe(100);
    });
  });

  describe('in-combat resource regen', () => {
    it('applies stamina and mana regen each round', () => {
      mockCombatRandom();

      const a = makeCombatant('Player', {
        template: templateOf('light_attack'),
        stamina: 20,
        maxStamina: 200,
        staminaRegenPerRound: 10,
        mana: 0,
        maxMana: 100,
        manaRegenPerRound: 5,
        stats: makeStats({ hp: 5000, maxHp: 5000, damageMin: 5, damageMax: 5 }),
      });
      const b = makeCombatant('Goblin', {
        template: templateOf('defend'),
        stats: makeStats({ hp: 5000, maxHp: 5000, damageMin: 1, damageMax: 1 }),
      });

      const result = runTemplateCombat(a, b);

      // Round 2 should show mana regen from 0
      const round2A = result.log.filter((e) => e.round === 2 && e.actor === 'combatantA');
      if (round2A.length > 0) {
        expect(round2A[0].combatantAManaAfter).toBeGreaterThanOrEqual(5);
      }

      // Round 3 should show further regen
      const round3A = result.log.filter((e) => e.round === 3 && e.actor === 'combatantA');
      if (round3A.length > 0) {
        expect(round3A[0].combatantAManaAfter).toBeGreaterThanOrEqual(10);
      }
    });
  });

  describe('resource remaining values', () => {
    it('stamina and mana remaining values are correct in result', () => {
      mockCombatRandom();

      // Quick kill: A one-shots B in round 1
      const a = makeCombatant('Player', {
        template: templateOf('light_attack'),
        stamina: 100,
        maxStamina: 100,
        staminaRegenPerRound: 10,
        mana: 50,
        maxMana: 50,
        manaRegenPerRound: 5,
        stats: makeStats({ damageMin: 200, damageMax: 200 }),
      });
      const b = makeCombatant('Goblin', {
        stats: makeStats({ hp: 10, maxHp: 10, damageMin: 1, damageMax: 1 }),
      });

      const result = runTemplateCombat(a, b);

      // Costs are deducted even on a killing blow
      expect(result.outcome).toBe('victory');
      expect(result.combatantAStaminaRemaining).toBe(100 - COMBAT_ACTION_CONSTANTS.LIGHT_ATTACK_STAMINA);
      expect(result.combatantAManaRemaining).toBe(50);
    });

    it('multi-round combat deducts stamina correctly', () => {
      mockCombatRandom();

      const a = makeCombatant('Player', {
        template: templateOf('light_attack'),
        stamina: 100,
        maxStamina: 100,
        staminaRegenPerRound: 0,
        mana: 50,
        maxMana: 50,
        manaRegenPerRound: 0,
        stats: makeStats({ hp: 200, maxHp: 200, damageMin: 20, damageMax: 20 }),
      });
      const b = makeCombatant('Goblin', {
        template: templateOf('light_attack'),
        stamina: 100,
        maxStamina: 100,
        staminaRegenPerRound: 0,
        stats: makeStats({ hp: 100, maxHp: 100, damageMin: 5, damageMax: 5 }),
      });

      const result = runTemplateCombat(a, b);

      // Stamina should have been deducted across multiple rounds
      expect(result.combatantAStaminaRemaining).toBeLessThan(100);
    });
  });

  describe('initiative', () => {
    it('determines action order based on initiative roll', () => {
      // B goes first (higher initiative)
      mockCombatRandom({ initA: 0.1, initB: 0.9 });

      const a = makeCombatant('Player', {
        stats: makeStats({ hp: 200, maxHp: 200, damageMin: 10, damageMax: 10 }),
      });
      const b = makeCombatant('Goblin', {
        stats: makeStats({ hp: 200, maxHp: 200, damageMin: 10, damageMax: 10 }),
      });

      const result = runTemplateCombat(a, b);

      // B should act first in round 1
      const round1Entries = result.log.filter((e) => e.round === 1);
      expect(round1Entries[0].actor).toBe('combatantB');
    });

    it('A goes first when initiatives are tied', () => {
      mockCombatRandom({ initA: 0.5, initB: 0.5 });

      const a = makeCombatant('Player', {
        stats: makeStats({ hp: 200, maxHp: 200, speed: 5 }),
      });
      const b = makeCombatant('Goblin', {
        stats: makeStats({ hp: 200, maxHp: 200, speed: 5 }),
      });

      const result = runTemplateCombat(a, b);

      const round1Entries = result.log.filter((e) => e.round === 1);
      expect(round1Entries[0].actor).toBe('combatantA');
    });
  });

  describe('damage multiplier', () => {
    it('action damage multiplier is applied to rolled damage', () => {
      mockCombatRandom();

      // heavy_attack has damageMultiplier: 1.5
      const a = makeCombatant('Player', {
        template: templateOf('heavy_attack'),
        stats: makeStats({ hp: 200, maxHp: 200, damageMin: 20, damageMax: 20 }),
        stamina: 500,
        maxStamina: 500,
      });
      const b = makeCombatant('Goblin', {
        template: templateOf('defend'),
        stats: makeStats({ hp: 200, maxHp: 200, damageMin: 1, damageMax: 1, defence: 0 }),
      });

      const result = runTemplateCombat(a, b);

      const attackEntry = result.log.find(
        (e) => e.round === 1 && e.actor === 'combatantA' && e.damage !== undefined,
      );
      expect(attackEntry).toBeDefined();
      // rawDamage = floor(20 * 1.5 * 1.0) = 30 (action multiplier, no channeling bonus)
      expect(attackEntry?.rawDamage).toBe(30);
      // Defend gives 35% damage reduction: floor(30 * (1 - 0.35)) = floor(19.5) = 19
      expect(attackEntry?.damage).toBe(19);
    });

    it('channeling bonus multiplier stacks with action multiplier', () => {
      mockCombatRandom();

      // Both use heavy_attack (1.5x multiplier, isChanneling)
      // Both are offensive + channeling → both get CHANNELING_BONUS_DAMAGE (1.5x) on top
      const a = makeCombatant('Player', {
        template: templateOf('heavy_attack'),
        stats: makeStats({ hp: 500, maxHp: 500, damageMin: 10, damageMax: 10 }),
        stamina: 500,
        maxStamina: 500,
      });
      const b = makeCombatant('Goblin', {
        template: templateOf('heavy_attack'),
        stats: makeStats({ hp: 500, maxHp: 500, damageMin: 10, damageMax: 10, defence: 0 }),
        stamina: 500,
        maxStamina: 500,
      });

      const result = runTemplateCombat(a, b);

      // rawDamage = floor(10 * 1.5 * 1.5) = floor(22.5) = 22
      const aAttack = result.log.find(
        (e) => e.round === 1 && e.actor === 'combatantA' && e.damage !== undefined,
      );
      expect(aAttack).toBeDefined();
      expect(aAttack?.rawDamage).toBe(22);
    });
  });

  describe('potion system', () => {
    it('uses potion when use_hp_potion action is in template', () => {
      mockCombatRandom();

      const a = makeCombatant('Player', {
        template: templateOf('use_hp_potion', 'light_attack'),
        stats: makeStats({ hp: 50, maxHp: 100, damageMin: 200, damageMax: 200 }),
      });
      const b = makeCombatant('Goblin', {
        stats: makeStats({ hp: 10, maxHp: 10, damageMin: 1, damageMax: 1 }),
      });

      const result = runTemplateCombat(a, b, {
        potions: [
          { name: 'Health Potion', healAmount: 30, templateId: 'hp-1', potionType: 'hp' },
        ],
      });

      expect(result.potionsConsumed).toHaveLength(1);
      expect(result.potionsConsumed[0].name).toBe('Health Potion');
      expect(result.potionsConsumed[0].healAmount).toBe(30);
      expect(result.potionsConsumed[0].round).toBe(1);
    });

    it('potion sickness prevents re-use within cooldown period', () => {
      mockCombatRandom();

      const a = makeCombatant('Player', {
        template: templateOf('use_hp_potion'),
        stats: makeStats({ hp: 30, maxHp: 100, damageMin: 5, damageMax: 5 }),
      });
      const b = makeCombatant('Goblin', {
        template: templateOf('light_attack'),
        stats: makeStats({ hp: 500, maxHp: 500, damageMin: 5, damageMax: 5 }),
      });

      const result = runTemplateCombat(a, b, {
        potions: [
          { name: 'Potion A', healAmount: 10, templateId: 'a', potionType: 'hp' },
          { name: 'Potion B', healAmount: 10, templateId: 'b', potionType: 'hp' },
          { name: 'Potion C', healAmount: 10, templateId: 'c', potionType: 'hp' },
        ],
      });

      // First potion consumed
      expect(result.potionsConsumed.length).toBeGreaterThanOrEqual(1);
      const firstRound = result.potionsConsumed[0].round;

      // If a second was consumed, the gap must be >= POTION_SICKNESS_ROUNDS
      if (result.potionsConsumed.length >= 2) {
        expect(result.potionsConsumed[1].round - firstRound).toBeGreaterThanOrEqual(
          COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS,
        );
      }

      // When potion sick, the action falls back to Defend (wasExhausted=true)
      const defendFallbacks = result.log.filter(
        (e) => e.actor === 'combatantA' && e.action === 'defend' && e.wasExhausted,
      );
      expect(defendFallbacks.length).toBeGreaterThan(0);
    });
  });

  describe('stamina and mana potions', () => {
    it('stamina potion restores stamina during combat', () => {
      mockCombatRandom();

      const a = makeCombatant('Player', {
        template: templateOf('use_stamina_potion', 'light_attack'),
        stats: makeStats({ hp: 100, maxHp: 100, damageMin: 200, damageMax: 200 }),
        stamina: 20,
        maxStamina: 100,
        staminaRegenPerRound: 0,
      });
      const b = makeCombatant('Goblin', {
        stats: makeStats({ hp: 10, maxHp: 10, damageMin: 1, damageMax: 1 }),
      });

      const result = runTemplateCombat(a, b, {
        potions: [
          { name: 'Stamina Potion', healAmount: 60, templateId: 'stam-1', potionType: 'stamina' },
        ],
      });

      expect(result.potionsConsumed).toHaveLength(1);
      expect(result.potionsConsumed[0].name).toBe('Stamina Potion');
      expect(result.potionsConsumed[0].healAmount).toBe(60);
      // Stamina should have increased
      const potionEntry = result.log.find(
        (e) => e.round === 1 && e.actor === 'combatantA' && e.action === 'potion',
      );
      expect(potionEntry).toBeDefined();
      expect(potionEntry?.message).toContain('Stamina');
    });

    it('mana potion restores mana during combat', () => {
      mockCombatRandom();

      const a = makeCombatant('Player', {
        template: templateOf('use_mana_potion', 'light_attack'),
        stats: makeStats({ hp: 100, maxHp: 100, damageMin: 200, damageMax: 200 }),
        mana: 5,
        maxMana: 100,
        manaRegenPerRound: 0,
      });
      const b = makeCombatant('Goblin', {
        stats: makeStats({ hp: 10, maxHp: 10, damageMin: 1, damageMax: 1 }),
      });

      const result = runTemplateCombat(a, b, {
        potions: [
          { name: 'Mana Potion', healAmount: 40, templateId: 'mana-1', potionType: 'mana' },
        ],
      });

      expect(result.potionsConsumed).toHaveLength(1);
      expect(result.potionsConsumed[0].name).toBe('Mana Potion');
      expect(result.potionsConsumed[0].healAmount).toBe(40);
      const potionEntry = result.log.find(
        (e) => e.round === 1 && e.actor === 'combatantA' && e.action === 'potion',
      );
      expect(potionEntry).toBeDefined();
      expect(potionEntry?.message).toContain('Mana');
    });

    it('potion type matching only uses matching potion from pool', () => {
      mockCombatRandom();

      const a = makeCombatant('Player', {
        template: templateOf('use_stamina_potion', 'light_attack'),
        stats: makeStats({ hp: 50, maxHp: 100, damageMin: 200, damageMax: 200 }),
        stamina: 20,
        maxStamina: 100,
        staminaRegenPerRound: 0,
      });
      const b = makeCombatant('Goblin', {
        stats: makeStats({ hp: 10, maxHp: 10, damageMin: 1, damageMax: 1 }),
      });

      const result = runTemplateCombat(a, b, {
        potions: [
          { name: 'Health Potion', healAmount: 50, templateId: 'hp-1', potionType: 'hp' },
          { name: 'Stamina Potion', healAmount: 30, templateId: 'stam-1', potionType: 'stamina' },
        ],
      });

      // Should have used the stamina potion, not the health potion
      expect(result.potionsConsumed).toHaveLength(1);
      expect(result.potionsConsumed[0].name).toBe('Stamina Potion');
      expect(result.potionsConsumed[0].templateId).toBe('stam-1');
    });

    it('potion sickness is shared across all potion types', () => {
      mockCombatRandom();

      // Use HP potion first, then try stamina potion on the next round
      const a = makeCombatant('Player', {
        template: templateOf('use_hp_potion', 'use_stamina_potion', 'light_attack', 'light_attack', 'light_attack'),
        stats: makeStats({ hp: 50, maxHp: 100, damageMin: 5, damageMax: 5 }),
        stamina: 50,
        maxStamina: 100,
        staminaRegenPerRound: 10,
      });
      const b = makeCombatant('Goblin', {
        template: templateOf('light_attack'),
        stats: makeStats({ hp: 500, maxHp: 500, damageMin: 1, damageMax: 1 }),
      });

      const result = runTemplateCombat(a, b, {
        potions: [
          { name: 'Health Potion', healAmount: 20, templateId: 'hp-1', potionType: 'hp' },
          { name: 'Stamina Potion', healAmount: 30, templateId: 'stam-1', potionType: 'stamina' },
        ],
      });

      // HP potion consumed round 1
      expect(result.potionsConsumed.length).toBeGreaterThanOrEqual(1);
      expect(result.potionsConsumed[0].name).toBe('Health Potion');

      // Round 2: Stamina potion should be blocked by potion sickness — falls back to Defend
      const defendFallback = result.log.find(
        (e) => e.round === 2 && e.actor === 'combatantA' && e.action === 'defend' && e.wasExhausted,
      );
      expect(defendFallback).toBeDefined();
    });

    it('mana potion is capped at max mana', () => {
      mockCombatRandom();

      const a = makeCombatant('Player', {
        template: templateOf('use_mana_potion', 'light_attack'),
        stats: makeStats({ hp: 100, maxHp: 100, damageMin: 200, damageMax: 200 }),
        mana: 45,
        maxMana: 50,
        manaRegenPerRound: 0,
      });
      const b = makeCombatant('Goblin', {
        stats: makeStats({ hp: 10, maxHp: 10, damageMin: 1, damageMax: 1 }),
      });

      const result = runTemplateCombat(a, b, {
        potions: [
          { name: 'Mana Potion', healAmount: 40, templateId: 'mana-1', potionType: 'mana' },
        ],
      });

      // Only 5 mana can be restored (45 + 40 capped at 50)
      expect(result.potionsConsumed).toHaveLength(1);
      expect(result.potionsConsumed[0].healAmount).toBe(5);
    });

    it('no matching potion type falls back to Defend', () => {
      mockCombatRandom();

      const a = makeCombatant('Player', {
        template: templateOf('use_mana_potion', 'light_attack'),
        stats: makeStats({ hp: 100, maxHp: 100, damageMin: 200, damageMax: 200 }),
      });
      const b = makeCombatant('Goblin', {
        stats: makeStats({ hp: 10, maxHp: 10, damageMin: 1, damageMax: 1 }),
      });

      const result = runTemplateCombat(a, b, {
        potions: [
          { name: 'Health Potion', healAmount: 50, templateId: 'hp-1', potionType: 'hp' },
        ],
      });

      // No mana potions available, so the action falls back to Defend
      expect(result.potionsConsumed).toHaveLength(0);
      const defendFallback = result.log.find(
        (e) => e.round === 1 && e.actor === 'combatantA' && e.action === 'defend' && e.wasExhausted,
      );
      expect(defendFallback).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('handles combat between identical combatants', () => {
      mockCombatRandom();

      const a = makeCombatant('Fighter A');
      const b = makeCombatant('Fighter B');

      const result = runTemplateCombat(a, b);
      expect(['victory', 'defeat', 'draw']).toContain(result.outcome);
      expect(result.log.length).toBeGreaterThan(0);
      expect(result.totalRounds).toBeGreaterThanOrEqual(1);
    });

    it('combatant HP never goes below 0 in result', () => {
      mockCombatRandom();

      const a = makeCombatant('Player', {
        stats: makeStats({ damageMin: 500, damageMax: 500 }),
      });
      const b = makeCombatant('Goblin', {
        stats: makeStats({ hp: 10, maxHp: 10 }),
      });

      const result = runTemplateCombat(a, b);
      expect(result.combatantAHpRemaining).toBeGreaterThanOrEqual(0);
      expect(result.combatantBHpRemaining).toBeGreaterThanOrEqual(0);
    });

    it('resource regen is capped at max', () => {
      mockCombatRandom();

      const a = makeCombatant('Player', {
        stamina: 100,
        maxStamina: 100,
        staminaRegenPerRound: 50,
        mana: 50,
        maxMana: 50,
        manaRegenPerRound: 25,
        stats: makeStats({ hp: 5000, maxHp: 5000, damageMin: 5, damageMax: 5 }),
      });
      const b = makeCombatant('Goblin', {
        stats: makeStats({ hp: 5000, maxHp: 5000, damageMin: 1, damageMax: 1 }),
      });

      const result = runTemplateCombat(a, b);

      for (const entry of result.log) {
        expect(entry.combatantAStaminaAfter).toBeLessThanOrEqual(100);
        expect(entry.combatantAManaAfter).toBeLessThanOrEqual(50);
      }
    });
  });

  describe('per-action scaling', () => {
    // Shared perActionScaling data for a magic-focused player
    const magicScaling: PerActionScaling = {
      skillLevels: { melee: 5, ranged: 5, magic: 30 },
      attributes: { strength: 3, dexterity: 3, intelligence: 25 },
      weaponPower: { attack: 5, rangedPower: 5, magicPower: 24 },
      equipmentAccuracy: 10,
      weaponRequiredSkill: 'magic',
    };

    it('magic-scaling action uses magic stats for damage', () => {
      // fire_bolt: scalingStat='magic', damageMultiplier=1.2, damageType='magic'
      // magic resolved: totalAttack = 30 + 24 + 25 = 79
      // damageMin = 1 + floor(79/5) = 16, damageMax = 5 + floor(79/2) = 44
      // With min damage roll: rawDamage = floor(16 * 1.2) = 19
      mockCombatRandom();

      const a = makeCombatant('Mage', {
        template: templateOf('fire_bolt'),
        actionDefinitions: BASE_ACTION_DEFINITIONS,
        stats: makeStats({
          hp: 500, maxHp: 500,
          // Global stats are set low — per-action scaling should override
          damageMin: 1, damageMax: 1, accuracy: 0,
        }),
        mana: 500,
        maxMana: 500,
        perActionScaling: magicScaling,
      });
      const b = makeCombatant('Target', {
        template: templateOf('defend'),
        stats: makeStats({ hp: 5000, maxHp: 5000, damageMin: 1, damageMax: 1, magicDefence: 0 }),
      });

      const result = runTemplateCombat(a, b);

      // Find A's first attack entry
      const attackEntry = result.log.find(
        (e) => e.round === 1 && e.actor === 'combatantA' && e.damage !== undefined,
      );
      expect(attackEntry).toBeDefined();
      // rawDamage = floor(16 * 1.2 * 1.0) = 19 (min roll, action multiplier, no interaction bonus)
      // With defend's 35% reduction: floor(19 * 0.65) = 12
      expect(attackEntry?.rawDamage).toBe(19);
      expect(attackEntry?.damage).toBe(12);
    });

    it('melee-scaling action on magic-weapon user uses melee stats', () => {
      // power_strike: scalingStat='melee', damageMultiplier=1.3
      // melee resolved: totalAttack = 5 + 5 + 3 = 13
      // damageMin = 1 + floor(13/5) = 3, damageMax = 5 + floor(13/2) = 11
      // With min damage roll: rawDamage = floor(3 * 1.3) = 3
      mockCombatRandom();

      const a = makeCombatant('Mage', {
        template: templateOf('power_strike'),
        actionDefinitions: BASE_ACTION_DEFINITIONS,
        stats: makeStats({
          hp: 500, maxHp: 500,
          // High global stats that should be ignored with per-action scaling
          damageMin: 50, damageMax: 50, accuracy: 50,
        }),
        stamina: 500,
        maxStamina: 500,
        perActionScaling: magicScaling,
      });
      const b = makeCombatant('Target', {
        template: templateOf('defend'),
        stats: makeStats({ hp: 5000, maxHp: 5000, damageMin: 1, damageMax: 1, defence: 0 }),
      });

      const result = runTemplateCombat(a, b);

      const attackEntry = result.log.find(
        (e) => e.round === 1 && e.actor === 'combatantA' && e.damage !== undefined,
      );
      expect(attackEntry).toBeDefined();
      // rawDamage = floor(3 * 1.3 * 1.0) = 3 (min roll)
      // With defend's 35% reduction: max(1, floor(3 * 0.65)) = max(1, 1) = 1
      expect(attackEntry?.rawDamage).toBe(3);
      expect(attackEntry?.damage).toBe(1);
    });

    it('mob without perActionScaling uses pre-computed stats', () => {
      mockCombatRandom();

      // Mob with no perActionScaling — should use stats.damageMin/Max directly
      const a = makeCombatant('Mob', {
        template: templateOf('light_attack'),
        stats: makeStats({ hp: 200, maxHp: 200, damageMin: 15, damageMax: 15 }),
        // No perActionScaling
      });
      const b = makeCombatant('Target', {
        template: templateOf('light_attack'),
        stats: makeStats({ hp: 200, maxHp: 200, damageMin: 5, damageMax: 5, defence: 0 }),
      });

      const result = runTemplateCombat(a, b);

      const attackEntry = result.log.find(
        (e) => e.round === 1 && e.actor === 'combatantA' && e.damage !== undefined,
      );
      expect(attackEntry).toBeDefined();
      // light_attack: damageMultiplier=0.6 → rawDamage = floor(15 * 0.6) = 9
      expect(attackEntry?.rawDamage).toBe(9);
    });

    it('action damageType determines which defence is used', () => {
      // Create a custom action: melee scaling but magic damage type
      // This should hit magicDefence, not physical defence
      const magicMelee: ActionDefinition = {
        id: 'magic_melee',
        name: 'Enchanted Strike',
        description: 'A melee strike infused with magic energy.',
        actionType: 'skill_attack',
        category: 'offensive',
        scalingStat: 'melee',
        cost: { stamina: 10, mana: 0 },
        damageMultiplier: 1.0,
        damageType: 'magic',
      };

      const customDefs = { ...BASE_ACTION_DEFINITIONS, magic_melee: magicMelee };

      mockCombatRandom();

      const a = makeCombatant('Fighter', {
        template: templateOf('magic_melee'),
        actionDefinitions: customDefs,
        stats: makeStats({ hp: 500, maxHp: 500, damageMin: 20, damageMax: 20 }),
        stamina: 500,
        maxStamina: 500,
      });
      // Target has high physical defence but no magic defence
      const b = makeCombatant('Target', {
        template: templateOf('defend'),
        stats: makeStats({
          hp: 5000, maxHp: 5000, damageMin: 1, damageMax: 1,
          defence: 200,       // High physical defence
          magicDefence: 0,    // No magic defence
        }),
      });

      const result = runTemplateCombat(a, b);

      const attackEntry = result.log.find(
        (e) => e.round === 1 && e.actor === 'combatantA' && e.damage !== undefined,
      );
      expect(attackEntry).toBeDefined();
      // rawDamage = floor(20 * 1.0 * 1.0) = 20
      expect(attackEntry?.rawDamage).toBe(20);
      // Magic defence is 0 → no defence reduction → only defend's 35% reduction
      // floor(20 * 0.65) = 13
      expect(attackEntry?.damage).toBe(13);
      // Log should show magicDefence, not physical defence
      expect(attackEntry?.targetMagicDefence).toBe(0);
      expect(attackEntry?.targetDefence).toBeUndefined();
    });
  });

  describe('DOT/HOT tick system', () => {
    it('DOT deals damage each round', () => {
      mockCombatRandom();

      const poisonAttack: ActionDefinition = {
        id: 'poison_strike',
        name: 'Poison Strike',
        description: 'An attack that poisons the target.',
        actionType: 'skill_attack',
        category: 'offensive',
        cost: { stamina: 15, mana: 0 },
        damageMultiplier: 1.0,
        damageType: 'physical',
        effect: {
          name: 'Poison',
          stat: 'attack',
          modifier: 0,
          duration: 4,
          isDebuff: true,
          damagePerRound: 10,
          dotDamageType: 'magic',
        },
      };

      const customDefs = { ...BASE_ACTION_DEFINITIONS, poison_strike: poisonAttack };

      const a = makeCombatant('Player', {
        template: templateOf('poison_strike', 'light_attack', 'light_attack', 'light_attack'),
        actionDefinitions: customDefs,
        stats: makeStats({ hp: 500, maxHp: 500, damageMin: 10, damageMax: 10 }),
        stamina: 500,
        maxStamina: 500,
      });
      const b = makeCombatant('Goblin', {
        template: templateOf('light_attack'),
        stats: makeStats({ hp: 500, maxHp: 500, damageMin: 1, damageMax: 1, magicDefence: 0 }),
      });

      const result = runTemplateCombat(a, b);

      // Should have DOT tick entries in the log
      const dotTicks = result.log.filter(e => e.tickType === 'dot_tick');
      expect(dotTicks.length).toBeGreaterThan(0);

      // DOT should deal damage
      for (const tick of dotTicks) {
        expect(tick.damage).toBeGreaterThan(0);
        expect(tick.spellName).toBe('Poison');
        expect(tick.message).toContain('magic damage');
      }
    });

    it('HOT heals each round via supportive action', () => {
      mockCombatRandom();

      const regenSpell: ActionDefinition = {
        id: 'regeneration',
        name: 'Regeneration',
        description: 'Heal over time.',
        actionType: 'buff',
        category: 'supportive',
        cost: { stamina: 5, mana: 20 },
        isChanneling: true,
        effect: {
          name: 'Regeneration',
          stat: 'defence',
          modifier: 0,
          duration: 4,
          healPerRound: 8,
        },
      };

      const customDefs = { ...BASE_ACTION_DEFINITIONS, regeneration: regenSpell };

      const a = makeCombatant('Player', {
        template: templateOf('regeneration', 'light_attack', 'light_attack', 'light_attack'),
        actionDefinitions: customDefs,
        stats: makeStats({ hp: 60, maxHp: 100, damageMin: 5, damageMax: 5 }),
        mana: 500,
        maxMana: 500,
      });
      const b = makeCombatant('Goblin', {
        template: templateOf('light_attack'),
        stats: makeStats({ hp: 500, maxHp: 500, damageMin: 1, damageMax: 1 }),
      });

      const result = runTemplateCombat(a, b);

      const hotTicks = result.log.filter(e => e.tickType === 'hot_tick');
      expect(hotTicks.length).toBeGreaterThan(0);

      for (const tick of hotTicks) {
        expect(tick.healAmount).toBeGreaterThan(0);
        expect(tick.spellName).toBe('Regeneration');
        expect(tick.message).toContain('heals');
      }
    });

    it('DOT can kill target', () => {
      mockCombatRandom();

      // Strong DOT on a low-HP target that defends (takes no direct damage to die from)
      const strongDotAttack: ActionDefinition = {
        id: 'deadly_poison',
        name: 'Deadly Poison',
        description: 'Lethal poison.',
        actionType: 'skill_attack',
        category: 'offensive',
        cost: { stamina: 10, mana: 0 },
        damageMultiplier: 0.1,
        damageType: 'physical',
        effect: {
          name: 'Deadly Poison',
          stat: 'attack',
          modifier: 0,
          duration: 10,
          isDebuff: true,
          damagePerRound: 50,
          dotDamageType: 'magic',
        },
      };

      const customDefs = { ...BASE_ACTION_DEFINITIONS, deadly_poison: strongDotAttack };

      const a = makeCombatant('Player', {
        template: templateOf('deadly_poison', 'defend', 'defend', 'defend'),
        actionDefinitions: customDefs,
        stats: makeStats({ hp: 500, maxHp: 500, damageMin: 10, damageMax: 10 }),
        stamina: 500,
        maxStamina: 500,
      });
      const b = makeCombatant('Goblin', {
        template: templateOf('defend'),
        stats: makeStats({ hp: 80, maxHp: 80, damageMin: 1, damageMax: 1, magicDefence: 0 }),
      });

      const result = runTemplateCombat(a, b);

      expect(result.outcome).toBe('victory');
      expect(result.combatantBHpRemaining).toBe(0);

      // Verify DOT ticks appear in the log
      const dotTicks = result.log.filter(e => e.tickType === 'dot_tick');
      expect(dotTicks.length).toBeGreaterThan(0);
    });

    it('same-name DOT refreshes duration instead of stacking', () => {
      mockCombatRandom();

      const poisonAttack: ActionDefinition = {
        id: 'poison_strike',
        name: 'Poison Strike',
        description: 'Poisons the target.',
        actionType: 'skill_attack',
        category: 'offensive',
        cost: { stamina: 10, mana: 0 },
        damageMultiplier: 1.0,
        damageType: 'physical',
        effect: {
          name: 'Poison',
          stat: 'attack',
          modifier: 0,
          duration: 3,
          isDebuff: true,
          damagePerRound: 10,
          dotDamageType: 'magic',
        },
      };

      const customDefs = { ...BASE_ACTION_DEFINITIONS, poison_strike: poisonAttack };

      // Both rounds use poison_strike → second application should refresh, not stack
      const a = makeCombatant('Player', {
        template: templateOf('poison_strike'),
        actionDefinitions: customDefs,
        stats: makeStats({ hp: 500, maxHp: 500, damageMin: 10, damageMax: 10 }),
        stamina: 500,
        maxStamina: 500,
      });
      const b = makeCombatant('Goblin', {
        template: templateOf('light_attack'),
        stats: makeStats({ hp: 500, maxHp: 500, damageMin: 1, damageMax: 1, magicDefence: 0 }),
      });

      const result = runTemplateCombat(a, b);

      // If DOTs stacked, each tick after round 2 would deal 20 damage (10+10).
      // With refresh, each tick should only deal 10.
      const dotTicks = result.log.filter(e => e.tickType === 'dot_tick');
      expect(dotTicks.length).toBeGreaterThan(0);

      // All DOT ticks should deal the same amount (10 damage with 0 magic defence)
      const uniqueDamages = new Set(dotTicks.map(e => e.damage));
      expect(uniqueDamages.size).toBe(1);
      expect(dotTicks[0].damage).toBe(10);
    });

    it('DOT snapshot uses % of triggering hit damage', () => {
      mockCombatRandom();

      const percentDotAttack: ActionDefinition = {
        id: 'burning_strike',
        name: 'Burning Strike',
        description: 'Sets the target on fire.',
        actionType: 'skill_attack',
        category: 'offensive',
        cost: { stamina: 15, mana: 0 },
        damageMultiplier: 1.0,
        damageType: 'physical',
        effect: {
          name: 'Burning',
          stat: 'attack',
          modifier: 0,
          duration: 3,
          isDebuff: true,
          damagePerRound: 5,
          damagePerRoundPercent: 50,
          dotDamageType: 'physical',
        },
      };

      const customDefs = { ...BASE_ACTION_DEFINITIONS, burning_strike: percentDotAttack };

      // With damageMin/Max = 20, no defence, no crit, damageMultiplier=1.0:
      // finalDamage = 20
      // DOT per round = 5 (flat) + floor(20 * 50 / 100) = 5 + 10 = 15
      const a = makeCombatant('Player', {
        template: templateOf('burning_strike', 'defend', 'defend', 'defend'),
        actionDefinitions: customDefs,
        stats: makeStats({ hp: 500, maxHp: 500, damageMin: 20, damageMax: 20 }),
        stamina: 500,
        maxStamina: 500,
      });
      const b = makeCombatant('Goblin', {
        template: templateOf('defend'),
        stats: makeStats({ hp: 500, maxHp: 500, damageMin: 1, damageMax: 1, defence: 0 }),
      });

      const result = runTemplateCombat(a, b);

      const dotTicks = result.log.filter(e => e.tickType === 'dot_tick');
      expect(dotTicks.length).toBeGreaterThan(0);

      // The initial hit has defend's 35% reduction: floor(20 * 0.65) = 13
      // DOT snapshot: flat 5 + floor(13 * 50 / 100) = 5 + 6 = 11
      // DOT tick with 0 physical defence → damage = 11
      expect(dotTicks[0].damage).toBe(11);
    });
  });

  describe('life leech', () => {
    it('heals attacker for percentage of damage dealt', () => {
      // Attack always hits, min damage, no crit
      mockCombatRandom();

      const leechAttack: ActionDefinition = {
        id: 'drain_strike',
        name: 'Drain Strike',
        description: 'Drains life from the target.',
        actionType: 'skill_attack',
        category: 'offensive',
        cost: { stamina: 10, mana: 0 },
        damageMultiplier: 1.0,
        damageType: 'physical',
        lifeLeechPercent: 50,
      };
      const customDefs = { ...BASE_ACTION_DEFINITIONS, drain_strike: leechAttack };

      // Both use offensive actions so random call pattern stays aligned (3 calls each per round).
      // damageMin/Max = 20, no defence, no crit → finalDamage = 20
      // leech = floor(20 * 50 / 100) = 10
      const a = makeCombatant('Player', {
        template: templateOf('drain_strike'),
        actionDefinitions: customDefs,
        stats: makeStats({ hp: 60, maxHp: 100, damageMin: 20, damageMax: 20 }),
        stamina: 200,
        maxStamina: 200,
      });
      const b = makeCombatant('Goblin', {
        template: templateOf('light_attack'),
        stats: makeStats({ hp: 500, maxHp: 500, damageMin: 1, damageMax: 1 }),
      });

      const result = runTemplateCombat(a, b);

      // Find the first attack log entry from Player with damage
      const attackLog = result.log.find(
        e => e.actor === 'combatantA' && e.damage !== undefined && e.damage > 0,
      );
      expect(attackLog).toBeDefined();
      expect(attackLog!.damage).toBe(20);
      expect(attackLog!.leechHeal).toBe(10);
      expect(attackLog!.message).toContain('Leeches 10 HP');

      // Player HP after leech: started at 60, +10 leech = 70
      expect(attackLog!.combatantAHpAfter).toBe(70);
    });

    it('caps leech heal at missing HP (no overheal)', () => {
      mockCombatRandom();

      const leechAttack: ActionDefinition = {
        id: 'drain_strike',
        name: 'Drain Strike',
        description: 'Drains life from the target.',
        actionType: 'skill_attack',
        category: 'offensive',
        cost: { stamina: 10, mana: 0 },
        damageMultiplier: 1.0,
        damageType: 'physical',
        lifeLeechPercent: 100,
      };
      const customDefs = { ...BASE_ACTION_DEFINITIONS, drain_strike: leechAttack };

      // Attacker at full HP → leech = floor(20 * 100 / 100) = 20, but capped at 0 missing HP
      const a = makeCombatant('Player', {
        template: templateOf('drain_strike'),
        actionDefinitions: customDefs,
        stats: makeStats({ hp: 100, maxHp: 100, damageMin: 20, damageMax: 20 }),
        stamina: 200,
        maxStamina: 200,
      });
      const b = makeCombatant('Goblin', {
        template: templateOf('light_attack'),
        stats: makeStats({ hp: 500, maxHp: 500, damageMin: 1, damageMax: 1 }),
      });

      const result = runTemplateCombat(a, b);

      const attackLog = result.log.find(
        e => e.actor === 'combatantA' && e.damage !== undefined && e.damage > 0,
      );
      expect(attackLog).toBeDefined();
      expect(attackLog!.damage).toBe(20);
      // No leech because attacker is at full HP
      expect(attackLog!.leechHeal).toBeUndefined();
      expect(attackLog!.message).not.toContain('Leeches');
    });

    it('does not leech on missed attacks', () => {
      // Use a custom mock that always returns 0.0 after initiative, so every
      // d20 is a natural 1 (always miss) regardless of call pattern alignment.
      let callCount = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => {
        callCount++;
        if (callCount === 1) return 0.9; // initA (A goes first)
        if (callCount === 2) return 0.1; // initB
        return 0.0; // All subsequent: d20=1 (natural miss), damage=min, crit=no
      });

      const leechAttack: ActionDefinition = {
        id: 'drain_strike',
        name: 'Drain Strike',
        description: 'Drains life from the target.',
        actionType: 'skill_attack',
        category: 'offensive',
        cost: { stamina: 10, mana: 0 },
        damageMultiplier: 1.0,
        damageType: 'physical',
        lifeLeechPercent: 100,
      };
      const customDefs = { ...BASE_ACTION_DEFINITIONS, drain_strike: leechAttack };

      const a = makeCombatant('Player', {
        template: templateOf('drain_strike'),
        actionDefinitions: customDefs,
        stats: makeStats({ hp: 50, maxHp: 100, damageMin: 20, damageMax: 20, accuracy: 0 }),
        stamina: 200,
        maxStamina: 200,
      });
      // Goblin also uses an offensive action to keep random pattern consistent
      const b = makeCombatant('Goblin', {
        template: templateOf('light_attack'),
        stats: makeStats({ hp: 500, maxHp: 500, damageMin: 1, damageMax: 1, accuracy: 0 }),
      });

      const result = runTemplateCombat(a, b);

      // All of Player's attacks should miss (natural 1)
      const playerAttacks = result.log.filter(
        e => e.actor === 'combatantA' && e.action === 'attack',
      );
      expect(playerAttacks.length).toBeGreaterThan(0);
      for (const entry of playerAttacks) {
        expect(entry.leechHeal).toBeUndefined();
        expect(entry.message).not.toContain('Leeches');
        expect(entry.message).toContain('misses');
      }
    });
  });
});
