import { prisma } from '@pocketrealm/database';
import {
  GATHERING_SKILLS,
  RESOURCE_PROSPECTING_CONSTANTS,
  type SkillType,
} from '@pocketrealm/shared';

export interface ProspectableResourceNode {
  resourceNodeId: string;
  resourceType: string;
  skillRequired: SkillType;
  levelRequired: number;
}

type WeightedResourceNode = {
  id: string;
  discoveryWeight: number;
  levelRequired: number;
};

export function toGatheringSkillType(value: string): SkillType {
  return GATHERING_SKILLS.includes(value as SkillType) ? value as SkillType : 'mining';
}

export function calculateProspectingTargetShare({
  nodeCount,
  skillLevel,
  levelRequired,
}: {
  nodeCount: number;
  skillLevel: number;
  levelRequired: number;
}): number {
  if (nodeCount <= 1) return 1;

  const atLevel = nodeCount === 2
    ? RESOURCE_PROSPECTING_CONSTANTS.TWO_NODE_TARGET_SHARE_AT_LEVEL
    : RESOURCE_PROSPECTING_CONSTANTS.THREE_NODE_TARGET_SHARE_AT_LEVEL;
  const cap = nodeCount === 2
    ? RESOURCE_PROSPECTING_CONSTANTS.TWO_NODE_TARGET_SHARE_CAP
    : RESOURCE_PROSPECTING_CONSTANTS.THREE_NODE_TARGET_SHARE_CAP;
  const levelsAbove = Math.max(0, skillLevel - levelRequired);
  const progress = Math.min(
    levelsAbove / RESOURCE_PROSPECTING_CONSTANTS.TARGET_BIAS_LEVELS_TO_CAP,
    1,
  );

  return atLevel + (cap - atLevel) * progress;
}

export function applyProspectingResourceWeightBias<T extends WeightedResourceNode>(
  nodes: T[],
  prospectingResourceNodeId: string | null | undefined,
  skillLevel: number,
): T[] {
  if (!prospectingResourceNodeId) return nodes;
  const target = nodes.find((node) => node.id === prospectingResourceNodeId);
  if (!target) return nodes;

  const targetShare = calculateProspectingTargetShare({
    nodeCount: nodes.length,
    skillLevel,
    levelRequired: target.levelRequired,
  });
  const nonTargetShare = nodes.length > 1 ? (1 - targetShare) / (nodes.length - 1) : 0;

  return nodes.map((node) => ({
    ...node,
    discoveryWeight: node.id === prospectingResourceNodeId ? targetShare : nonTargetShare,
  }));
}

export async function buildProspectableResourceNodesByZone(
  zoneIds: string[],
): Promise<Map<string, ProspectableResourceNode[]>> {
  if (zoneIds.length === 0) return new Map<string, ProspectableResourceNode[]>();

  const nodes = await prisma.resourceNode.findMany({
    where: { zoneId: { in: zoneIds } },
    select: {
      id: true,
      zoneId: true,
      resourceType: true,
      skillRequired: true,
      levelRequired: true,
    },
    orderBy: [
      { levelRequired: 'asc' },
      { resourceType: 'asc' },
    ],
  });

  const byZone = new Map<string, ProspectableResourceNode[]>();
  for (const node of nodes) {
    const zoneNodes = byZone.get(node.zoneId) ?? [];
    zoneNodes.push({
      resourceNodeId: node.id,
      resourceType: node.resourceType,
      skillRequired: toGatheringSkillType(node.skillRequired),
      levelRequired: node.levelRequired,
    });
    byZone.set(node.zoneId, zoneNodes);
  }

  return byZone;
}
