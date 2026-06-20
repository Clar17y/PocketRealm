import { describe, expect, it } from 'vitest';
import { TALENT_TREE_DEFINITIONS, getAllTalentNodes, getTalentNode } from './talentTreeDefinitions';
import { BASE_ACTION_DEFINITIONS } from './combatActionDefinitions';

describe('talentTreeDefinitions', () => {
  describe('tree structure consistency', () => {
    it('combat trees have 4 nodes per tier (T1-T4) and 2 at T5', () => {
      for (const treeName of ['melee', 'ranged', 'magic'] as const) {
        const nodes = TALENT_TREE_DEFINITIONS[treeName];
        for (let tier = 1; tier <= 4; tier++) {
          const tierNodes = nodes.filter(n => n.tier === tier);
          expect(tierNodes.length, `${treeName} tier ${tier}`).toBe(4);
        }
        const t5Nodes = nodes.filter(n => n.tier === 5);
        expect(t5Nodes.length, `${treeName} tier 5`).toBe(2);
        expect(nodes.length, `${treeName} total`).toBe(18);
      }
    });

    it('survival tree has 3 nodes per tier (T1-T4) and 2 at T5', () => {
      const nodes = TALENT_TREE_DEFINITIONS.survival;
      for (let tier = 1; tier <= 4; tier++) {
        const tierNodes = nodes.filter(n => n.tier === tier);
        expect(tierNodes.length, `survival tier ${tier}`).toBe(3);
      }
      const t5Nodes = nodes.filter(n => n.tier === 5);
      expect(t5Nodes.length, 'survival tier 5').toBe(2);
      expect(nodes.length, 'survival total').toBe(14);
    });
  });

  describe('AoE availability at tier 2', () => {
    it('each combat tree has an AoE action at tier 2', () => {
      const trees = { melee: 'cleave', ranged: 'scatter_shot', magic: 'frost_nova' } as const;
      for (const [treeName, expectedAoe] of Object.entries(trees)) {
        const t2Nodes = TALENT_TREE_DEFINITIONS[treeName as keyof typeof trees]
          .filter(n => n.tier === 2);
        const aoeNode = t2Nodes.find(n => n.unlocksAction === expectedAoe);
        expect(aoeNode, `${treeName} should have ${expectedAoe} at tier 2`).toBeDefined();
      }
    });

    it('talent damage actions expose target mode metadata for planning displays', () => {
      for (const node of getAllTalentNodes()) {
        if (!node.unlocksAction) continue;

        const action = BASE_ACTION_DEFINITIONS[node.unlocksAction];
        if (action.damageMultiplier == null) continue;

        expect(
          action.targetMode,
          `${node.unlocksAction} must declare targetMode for skill tree damage metadata`,
        ).toBeDefined();
      }

      expect(BASE_ACTION_DEFINITIONS.power_strike.targetMode).toBe('single_target');
      expect(BASE_ACTION_DEFINITIONS.cleave.targetMode).toBe('aoe');
      expect(BASE_ACTION_DEFINITIONS.frost_nova.targetMode).toBe('aoe');
    });
  });

  describe('prerequisite validity', () => {
    it('all prerequisites reference existing node IDs', () => {
      const allNodes = getAllTalentNodes();
      const allIds = new Set(allNodes.map(n => n.id));
      for (const node of allNodes) {
        for (const prereq of node.prerequisites) {
          expect(allIds.has(prereq), `${node.id} prereq '${prereq}' must exist`).toBe(true);
        }
      }
    });

    it('all unlocksAction references exist in BASE_ACTION_DEFINITIONS', () => {
      const allNodes = getAllTalentNodes();
      for (const node of allNodes) {
        if (node.unlocksAction) {
          expect(
            BASE_ACTION_DEFINITIONS[node.unlocksAction],
            `${node.id} unlocksAction '${node.unlocksAction}' must exist`,
          ).toBeDefined();
        }
      }
    });

    it('tier 1 nodes have no prerequisites', () => {
      const allNodes = getAllTalentNodes();
      const t1Nodes = allNodes.filter(n => n.tier === 1);
      for (const node of t1Nodes) {
        expect(node.prerequisites, `${node.id} (tier 1) should have no prereqs`).toEqual([]);
      }
    });

    it('prerequisites only reference nodes from earlier tiers in the same tree', () => {
      for (const [treeName, nodes] of Object.entries(TALENT_TREE_DEFINITIONS)) {
        for (const node of nodes) {
          for (const prereqId of node.prerequisites) {
            const prereqNode = getTalentNode(prereqId);
            expect(prereqNode, `${node.id} prereq '${prereqId}' must exist`).toBeDefined();
            expect(prereqNode!.tier, `${node.id} prereq '${prereqId}' must be earlier tier`).toBeLessThan(node.tier);
            expect(prereqNode!.tree, `${node.id} prereq '${prereqId}' must be same tree`).toBe(treeName);
          }
        }
      }
    });
  });

  describe('node ID conventions', () => {
    it('all node IDs follow {tree}_{snake_case} pattern', () => {
      for (const [treeName, nodes] of Object.entries(TALENT_TREE_DEFINITIONS)) {
        for (const node of nodes) {
          expect(node.id.startsWith(`${treeName}_`), `${node.id} should start with ${treeName}_`).toBe(true);
        }
      }
    });

    it('all nodes have matching tree field', () => {
      for (const [treeName, nodes] of Object.entries(TALENT_TREE_DEFINITIONS)) {
        for (const node of nodes) {
          expect(node.tree, `${node.id} tree field`).toBe(treeName);
        }
      }
    });
  });
});
