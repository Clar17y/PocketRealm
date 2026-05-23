import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';
import {
  applyProspectingResourceWeightBias,
  buildProspectableResourceNodesByZone,
  calculateProspectingTargetShare,
} from './resourceProspectingService';

describe('calculateProspectingTargetShare', () => {
  it('uses the three-node split at level and caps at ten levels above', () => {
    expect(calculateProspectingTargetShare({ nodeCount: 3, skillLevel: 5, levelRequired: 5 })).toBeCloseTo(0.5);
    expect(calculateProspectingTargetShare({ nodeCount: 3, skillLevel: 10, levelRequired: 5 })).toBeCloseTo(0.65);
    expect(calculateProspectingTargetShare({ nodeCount: 3, skillLevel: 15, levelRequired: 5 })).toBeCloseTo(0.8);
    expect(calculateProspectingTargetShare({ nodeCount: 3, skillLevel: 3, levelRequired: 5 })).toBeCloseTo(0.5);
  });

  it('uses the two-node split for zones with two resource templates', () => {
    expect(calculateProspectingTargetShare({ nodeCount: 2, skillLevel: 5, levelRequired: 5 })).toBeCloseTo(0.65);
    expect(calculateProspectingTargetShare({ nodeCount: 2, skillLevel: 15, levelRequired: 5 })).toBeCloseTo(0.85);
  });

  it('selects the only node when a zone has one resource template', () => {
    expect(calculateProspectingTargetShare({ nodeCount: 1, skillLevel: 1, levelRequired: 10 })).toBe(1);
  });
});

describe('applyProspectingResourceWeightBias', () => {
  it('converts the selected target into request-local discovery weights', () => {
    const nodes = [
      { id: 'node-copper', discoveryWeight: 100, resourceType: 'copper_ore', levelRequired: 1 },
      { id: 'node-oak', discoveryWeight: 100, resourceType: 'oak_log', levelRequired: 1 },
      { id: 'node-sage', discoveryWeight: 100, resourceType: 'forest_sage', levelRequired: 1 },
    ];

    const result = applyProspectingResourceWeightBias(nodes, 'node-copper', 1);

    expect(result.map((node) => node.discoveryWeight)).toEqual([0.5, 0.25, 0.25]);
    expect(nodes.map((node) => node.discoveryWeight)).toEqual([100, 100, 100]);
  });

  it('returns the original weights when the target is not in the zone', () => {
    const nodes = [
      { id: 'node-oak', discoveryWeight: 80, resourceType: 'oak_log', levelRequired: 1 },
    ];

    expect(applyProspectingResourceWeightBias(nodes, 'node-copper', 10)).toEqual(nodes);
  });
});

describe('buildProspectableResourceNodesByZone', () => {
  beforeEach(() => vi.clearAllMocks());

  it('groups resource node templates by zone', async () => {
    mockPrisma.resourceNode.findMany.mockResolvedValue([
      { id: 'node-copper', zoneId: 'zone-forest', resourceType: 'copper_ore', skillRequired: 'mining', levelRequired: 1 },
      { id: 'node-oak', zoneId: 'zone-forest', resourceType: 'oak_log', skillRequired: 'woodcutting', levelRequired: 1 },
    ]);

    const result = await buildProspectableResourceNodesByZone(['zone-forest']);

    expect(result.get('zone-forest')).toEqual([
      { resourceNodeId: 'node-copper', resourceType: 'copper_ore', skillRequired: 'mining', levelRequired: 1 },
      { resourceNodeId: 'node-oak', resourceType: 'oak_log', skillRequired: 'woodcutting', levelRequired: 1 },
    ]);
  });
});
