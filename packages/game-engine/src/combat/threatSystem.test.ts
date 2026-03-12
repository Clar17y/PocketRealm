import { describe, it, expect } from 'vitest';
import {
  initThreatTable,
  addDamageThreat,
  addHealThreat,
  applyTaunt,
  getSingleTarget,
  tickTaunts,
} from './threatSystem';

describe('threatSystem', () => {
  describe('initThreatTable', () => {
    it('creates entries with 0 threat and 0 taunt for each player', () => {
      const table = initThreatTable(['p1', 'p2', 'p3']);
      expect(table).toHaveLength(3);
      expect(table[0]).toEqual({ playerId: 'p1', threat: 0, tauntRoundsRemaining: 0 });
      expect(table[1]).toEqual({ playerId: 'p2', threat: 0, tauntRoundsRemaining: 0 });
      expect(table[2]).toEqual({ playerId: 'p3', threat: 0, tauntRoundsRemaining: 0 });
    });
  });

  describe('addDamageThreat', () => {
    it('increases threat by damage * THREAT_PER_DAMAGE', () => {
      const table = initThreatTable(['p1']);
      addDamageThreat(table, 'p1', 100);
      expect(table[0].threat).toBe(100);
    });

    it('accumulates across multiple calls', () => {
      const table = initThreatTable(['p1']);
      addDamageThreat(table, 'p1', 50);
      addDamageThreat(table, 'p1', 30);
      expect(table[0].threat).toBe(80);
    });
  });

  describe('addHealThreat', () => {
    it('increases threat by healAmount * THREAT_PER_HEAL', () => {
      const table = initThreatTable(['p1']);
      addHealThreat(table, 'p1', 100);
      expect(table[0].threat).toBe(50);
    });
  });

  describe('getSingleTarget', () => {
    it('returns highest threat alive player', () => {
      const table = initThreatTable(['p1', 'p2']);
      addDamageThreat(table, 'p1', 50);
      addDamageThreat(table, 'p2', 100);
      expect(getSingleTarget(table, new Set(['p1', 'p2']))).toBe('p2');
    });

    it('returns taunting player even if lower threat', () => {
      const table = initThreatTable(['p1', 'p2']);
      addDamageThreat(table, 'p2', 1000);
      applyTaunt(table, 'p1', 2);
      expect(getSingleTarget(table, new Set(['p1', 'p2']))).toBe('p1');
    });

    it('skips dead players', () => {
      const table = initThreatTable(['p1', 'p2']);
      addDamageThreat(table, 'p1', 200);
      addDamageThreat(table, 'p2', 50);
      expect(getSingleTarget(table, new Set(['p2']))).toBe('p2');
    });

    it('returns null when no alive players', () => {
      const table = initThreatTable(['p1']);
      expect(getSingleTarget(table, new Set())).toBeNull();
    });

    it('picks highest threat among multiple taunters', () => {
      const table = initThreatTable(['p1', 'p2', 'p3']);
      applyTaunt(table, 'p1', 2);
      applyTaunt(table, 'p2', 2);
      addDamageThreat(table, 'p2', 100);
      expect(getSingleTarget(table, new Set(['p1', 'p2', 'p3']))).toBe('p2');
    });
  });

  describe('applyTaunt', () => {
    it('sets duration and adds bonus threat', () => {
      const table = initThreatTable(['p1']);
      applyTaunt(table, 'p1', 3);
      expect(table[0].tauntRoundsRemaining).toBe(3);
      expect(table[0].threat).toBe(500);
    });
  });

  describe('tickTaunts', () => {
    it('decrements taunt rounds', () => {
      const table = initThreatTable(['p1']);
      applyTaunt(table, 'p1', 2);
      tickTaunts(table);
      expect(table[0].tauntRoundsRemaining).toBe(1);
      tickTaunts(table);
      expect(table[0].tauntRoundsRemaining).toBe(0);
    });

    it('does not go below zero', () => {
      const table = initThreatTable(['p1']);
      tickTaunts(table);
      expect(table[0].tauntRoundsRemaining).toBe(0);
    });

    it('removes flat threat bonus when taunt expires', () => {
      const table = initThreatTable(['p1']);
      addDamageThreat(table, 'p1', 100); // 100 threat from damage
      applyTaunt(table, 'p1', 2); // +500 bonus → 600 total
      expect(table[0].threat).toBe(600);

      tickTaunts(table); // round 1: still taunting
      expect(table[0].tauntRoundsRemaining).toBe(1);
      expect(table[0].threat).toBe(600); // bonus still applied

      tickTaunts(table); // round 2: taunt expires, bonus removed
      expect(table[0].tauntRoundsRemaining).toBe(0);
      expect(table[0].threat).toBe(100); // back to damage-only threat
    });

    it('threat does not go negative when bonus removed', () => {
      const table = initThreatTable(['p1']);
      applyTaunt(table, 'p1', 1); // +500 bonus, 0 base damage
      expect(table[0].threat).toBe(500);

      tickTaunts(table); // taunt expires, bonus removed
      expect(table[0].threat).toBe(0); // clamped to 0
    });

    it('only removes bonus from the expiring player', () => {
      const table = initThreatTable(['p1', 'p2']);
      addDamageThreat(table, 'p1', 200);
      addDamageThreat(table, 'p2', 50);
      applyTaunt(table, 'p1', 1); // expires next tick
      applyTaunt(table, 'p2', 3); // still active after tick

      tickTaunts(table);
      expect(table[0].threat).toBe(200); // p1: bonus removed, base remains
      expect(table[0].tauntRoundsRemaining).toBe(0);
      expect(table[1].threat).toBe(550); // p2: bonus still applied
      expect(table[1].tauntRoundsRemaining).toBe(2);
    });
  });

  describe('boss switches target when tank dies', () => {
    it('falls back to next highest threat', () => {
      const table = initThreatTable(['tank', 'dps']);
      addDamageThreat(table, 'tank', 500);
      addDamageThreat(table, 'dps', 200);
      // Tank dies — not in alivePlayerIds
      expect(getSingleTarget(table, new Set(['dps']))).toBe('dps');
    });
  });
});
