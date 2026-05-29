import { describe, expect, it } from 'vitest';

import { getTechniqueDefinition } from '../constants/vocationDefinitions';
import { describeVocationTechnique } from './vocationTechniqueDescriptions';

describe('vocationTechniqueDescriptions', () => {
  it('explains gathering techniques with their mechanical effect', () => {
    const grainCall = getTechniqueDefinition('forester_grain_call');
    const splitWedge = getTechniqueDefinition('forester_split_wedge');

    expect(describeVocationTechnique(grainCall)).toContain('Woodcutting wood: +1 output when you have at least 3 free inventory slots');
    expect(describeVocationTechnique(splitWedge)).toContain('Woodcutting wood: -4% turn cost when repeating the same node');
  });

  it('explains craft marks with benefits, drawbacks, and action modifiers', () => {
    const tightString = getTechniqueDefinition('bowyer_tight_string');

    expect(describeVocationTechnique(tightString)).toContain('Weaponsmithing weapon main hand: applies Tight String Mark');
    expect(describeVocationTechnique(tightString)).toContain('+4% ranged power');
    expect(describeVocationTechnique(tightString)).toContain('-2% accuracy');
    expect(describeVocationTechnique(tightString)).toContain('Light Attack, Normal Attack, Skill Attack: +4% damage, +8% durability wear');
  });
});
