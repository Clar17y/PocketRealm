import { describe, expect, it } from 'vitest';
import { KNOWN_EFFECTS } from './combatEffectNames';

function descriptionFor(effectName: string): string {
  const effect = KNOWN_EFFECTS.find((entry) => entry.name === effectName);
  if (!effect) throw new Error(`Missing effect ${effectName}`);
  return effect.description;
}

describe('combat effect display names', () => {
  it('describes stat modifiers with player-facing stat labels and values', () => {
    expect(descriptionFor('Arcane Burn')).toBe('Magic Defence -15 for 3 rounds');
    expect(descriptionFor('Berserker Rage')).toBe('Attack +30% for 5 rounds');
  });

  it('describes damage-over-time and status effects without raw placeholder stats', () => {
    expect(descriptionFor('Burn')).toBe('Magic DoT: 5 damage + 15% of hit damage per round for 3 rounds');
    expect(descriptionFor('Death Mark')).toBe('Defence -40 and Magic DoT: 5 damage per round for 4 rounds');
    expect(descriptionFor('Pinned')).toBe('Forced to defend for 1 round');
  });

  it('keeps boss-only effects readable in template selectors', () => {
    expect(descriptionFor('Marked for Death')).toBe('Marked for death for 2 rounds (boss ability)');
  });
});
