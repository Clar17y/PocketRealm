import { describe, expect, it } from 'vitest';
import {
  resolvePlayerMaxHp,
  resolveMobMaxHp,
  formatCombatShareText,
  type ShareCombatLogEntry,
  type CombatShareInput,
} from './combatShare';

describe('resolvePlayerMaxHp', () => {
  it('returns explicit value when provided and > 0', () => {
    expect(resolvePlayerMaxHp([], 100)).toBe(100);
  });

  it('returns undefined for explicit value of 0', () => {
    expect(resolvePlayerMaxHp([], 0)).toBeUndefined();
  });

  it('returns undefined for negative explicit value', () => {
    expect(resolvePlayerMaxHp([], -5)).toBeUndefined();
  });

  it('extracts max from log entries when no explicit', () => {
    const log: ShareCombatLogEntry[] = [
      { round: 1, actor: 'combatantA', combatantAHpAfter: 80 },
      { round: 2, actor: 'combatantB', combatantAHpAfter: 100 },
      { round: 3, actor: 'combatantA', combatantAHpAfter: 60 },
    ];
    expect(resolvePlayerMaxHp(log)).toBe(100);
  });

  it('returns undefined for empty log', () => {
    expect(resolvePlayerMaxHp([])).toBeUndefined();
  });

  it('returns undefined when log has no playerHpAfter values', () => {
    const log: ShareCombatLogEntry[] = [
      { round: 1, actor: 'combatantA' },
    ];
    expect(resolvePlayerMaxHp(log)).toBeUndefined();
  });
});

describe('resolveMobMaxHp', () => {
  it('returns explicit value when provided', () => {
    expect(resolveMobMaxHp([], 50)).toBe(50);
  });

  it('extracts max from log entries', () => {
    const log: ShareCombatLogEntry[] = [
      { round: 1, actor: 'combatantA', combatantBHpAfter: 40 },
      { round: 2, actor: 'combatantB', combatantBHpAfter: 50 },
    ];
    expect(resolveMobMaxHp(log)).toBe(50);
  });

  it('returns undefined for empty log', () => {
    expect(resolveMobMaxHp([])).toBeUndefined();
  });
});

describe('formatCombatShareText', () => {
  it('formats full combat share text', () => {
    const input: CombatShareInput = {
      outcome: 'victory',
      mobName: 'Goblin',
      zoneName: 'Dark Forest',
      log: [
        { round: 1, actor: 'combatantA', damage: 10, combatantAHpAfter: 90, combatantBHpAfter: 40 },
        { round: 1, actor: 'combatantB', damage: 5, combatantAHpAfter: 85, combatantBHpAfter: 40 },
      ],
      rewards: {
        xp: 100,
        skillXpGrants: [{ skillType: 'melee', xpAfterEfficiency: 50 }],
        loot: [{ itemTemplateId: 'gold-coin', quantity: 10, itemName: 'Gold Coin' }],
      },
      playerMaxHp: 100,
      mobMaxHp: 50,
    };

    const text = formatCombatShareText(input);
    expect(text).toContain('PocketRealm Combat Log');
    expect(text).toContain('Outcome: victory');
    expect(text).toContain('Mob: Goblin');
    expect(text).toContain('Zone: Dark Forest');
    expect(text).toContain('R1 You 10 dmg');
    expect(text).toContain('XP: 100');
    expect(text).toContain('melee: +50 XP');
    expect(text).toContain('Gold Coin x10');
  });

  it('handles evaded attacks', () => {
    const input: CombatShareInput = {
      outcome: 'victory',
      log: [
        { round: 1, actor: 'combatantB', evaded: true, combatantAHpAfter: 100, combatantBHpAfter: 30 },
      ],
      rewards: { xp: 50, loot: [] },
    };

    const text = formatCombatShareText(input);
    expect(text).toContain('Dodged');
  });

  it('handles misses', () => {
    const input: CombatShareInput = {
      outcome: 'victory',
      log: [
        {
          round: 1,
          actor: 'combatantA',
          roll: 3,
          hitChance: 0.25,
          hitRollValue: 0.9,
          attackerHitScore: 12,
          defenderAvoidScore: 4,
          combatantAHpAfter: 100,
          combatantBHpAfter: 50,
        },
      ],
      rewards: { xp: 50, loot: [] },
    };

    const text = formatCombatShareText(input);
    expect(text).toContain('Miss');
  });

  it('does not infer misses from bare legacy roll fields', () => {
    const input: CombatShareInput = {
      outcome: 'victory',
      log: [
        { round: 1, actor: 'combatantA', roll: 3, combatantAHpAfter: 100, combatantBHpAfter: 50 },
      ],
      rewards: { xp: 50, loot: [] },
    };

    const text = formatCombatShareText(input);
    expect(text).not.toContain('Miss');
  });

  it('handles no loot', () => {
    const input: CombatShareInput = {
      outcome: 'victory',
      log: [],
      rewards: { xp: 50, loot: [] },
    };

    const text = formatCombatShareText(input);
    expect(text).not.toContain('Loot:');
  });

  it('uses itemTemplateId when itemName is null', () => {
    const input: CombatShareInput = {
      outcome: 'victory',
      log: [],
      rewards: {
        xp: 50,
        loot: [{ itemTemplateId: 'tpl-ore', quantity: 1, itemName: null }],
      },
    };

    const text = formatCombatShareText(input);
    expect(text).toContain('tpl-ore');
  });
});
