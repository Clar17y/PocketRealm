// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { recordTurnsSpent, getTopZone } from '../activityTracker';

describe('activityTracker', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('recordTurnsSpent', () => {
    it('stores turn count for a zone', () => {
      recordTurnsSpent('deep-forest', 10);
      expect(sessionStorage.getItem('turns-spent:deep-forest')).toBe('10');
    });

    it('accumulates turns across multiple calls', () => {
      recordTurnsSpent('deep-forest', 10);
      recordTurnsSpent('deep-forest', 5);
      expect(sessionStorage.getItem('turns-spent:deep-forest')).toBe('15');
    });

    it('tracks multiple zones independently', () => {
      recordTurnsSpent('deep-forest', 10);
      recordTurnsSpent('crystal-caves', 20);
      expect(sessionStorage.getItem('turns-spent:deep-forest')).toBe('10');
      expect(sessionStorage.getItem('turns-spent:crystal-caves')).toBe('20');
    });
  });

  describe('getTopZone', () => {
    it('returns null when no turns recorded', () => {
      expect(getTopZone()).toBeNull();
    });

    it('returns the zone with the most turns', () => {
      recordTurnsSpent('deep-forest', 10);
      recordTurnsSpent('crystal-caves', 20);
      recordTurnsSpent('forest-edge', 5);
      expect(getTopZone()).toBe('crystal-caves');
    });

    it('returns one zone when tied (deterministic)', () => {
      recordTurnsSpent('deep-forest', 10);
      recordTurnsSpent('crystal-caves', 10);
      const result = getTopZone();
      expect(['deep-forest', 'crystal-caves']).toContain(result);
    });

    it('ignores non-turns-spent sessionStorage keys', () => {
      sessionStorage.setItem('unrelated-key', '999');
      recordTurnsSpent('deep-forest', 5);
      expect(getTopZone()).toBe('deep-forest');
    });
  });
});
