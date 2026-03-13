import { prisma } from '@pocketrealm/database';
import {
  SKILL_POINT_CONSTANTS,
  ALWAYS_AVAILABLE_ACTION_IDS,
  getAllTalentNodes,
  getTalentNode,
  type SkillPointAllocationData,
} from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { spendPlayerTurnsTx } from './turnBankService';

/**
 * Total skill points earned = sum of (level - 1) for all skills * POINTS_PER_LEVEL.
 * Level 1 is baseline so only levels above 1 generate points.
 */
async function getTotalPointsEarned(playerId: string): Promise<number> {
  const skills = await prisma.playerSkill.findMany({
    where: { playerId },
    select: { level: true },
  });
  return skills.reduce((sum, s) => sum + (s.level - 1), 0) * SKILL_POINT_CONSTANTS.POINTS_PER_LEVEL;
}

/** Get the player's allocation record, creating one if it doesn't exist. */
async function getOrCreateAllocation(playerId: string): Promise<{ allocations: Record<string, number> }> {
  const record = await prisma.skillPointAllocation.findUnique({ where: { playerId } });
  if (record) return { allocations: (record.allocations as Record<string, number>) ?? {} };

  const created = await prisma.skillPointAllocation.create({
    data: { playerId, allocations: {} },
  });
  return { allocations: (created.allocations as Record<string, number>) ?? {} };
}

/** Get current skill point state for a player. */
export async function getSkillPoints(playerId: string): Promise<SkillPointAllocationData> {
  const totalPointsEarned = await getTotalPointsEarned(playerId);
  const { allocations } = await getOrCreateAllocation(playerId);
  const totalPointsSpent = Object.values(allocations).reduce((sum, v) => sum + v, 0);

  // Derive unlocked actions from allocated nodes
  const unlockedActions: string[] = [];
  for (const nodeId of Object.keys(allocations)) {
    const node = getTalentNode(nodeId);
    if (node?.unlocksAction) unlockedActions.push(node.unlocksAction);
  }

  return {
    playerId,
    totalPointsEarned,
    totalPointsSpent,
    availablePoints: totalPointsEarned - totalPointsSpent,
    allocations,
    unlockedActions,
  };
}

/** Allocate points to a talent node (atomic transaction to prevent double-spend). */
export async function allocatePoints(playerId: string, nodeId: string): Promise<SkillPointAllocationData> {
  const node = getTalentNode(nodeId);
  if (!node) throw new AppError(404, `Talent node '${nodeId}' not found`, 'NODE_NOT_FOUND');

  await prisma.$transaction(async (tx: any) => {
    // Read state inside transaction for consistent snapshot
    const skills = await tx.playerSkill.findMany({
      where: { playerId },
      select: { level: true },
    });
    const totalPointsEarned = skills.reduce((sum: number, s: { level: number }) => sum + (s.level - 1), 0) * SKILL_POINT_CONSTANTS.POINTS_PER_LEVEL;

    const record = await tx.skillPointAllocation.findUnique({ where: { playerId } });
    const allocations: Record<string, number> = record
      ? ((record.allocations as Record<string, number>) ?? {})
      : ((await tx.skillPointAllocation.create({ data: { playerId, allocations: {} } })).allocations as Record<string, number>) ?? {};

    const totalPointsSpent = Object.values(allocations).reduce((sum: number, v: number) => sum + v, 0);
    const availablePoints = totalPointsEarned - totalPointsSpent;

    if (allocations[nodeId]) {
      throw new AppError(400, `Node '${nodeId}' is already unlocked`, 'ALREADY_ALLOCATED');
    }

    if (availablePoints < node.pointCost) {
      throw new AppError(
        400,
        `Not enough skill points (need ${node.pointCost}, have ${availablePoints})`,
        'INSUFFICIENT_POINTS',
      );
    }

    for (const prereq of node.prerequisites) {
      if (!allocations[prereq]) {
        throw new AppError(400, `Prerequisite '${prereq}' not unlocked`, 'PREREQUISITE_NOT_MET');
      }
    }

    if (node.skillLevelGate) {
      const skill = await tx.playerSkill.findFirst({
        where: { playerId, skillType: node.skillLevelGate.skill },
        select: { level: true },
      });
      const level = skill?.level ?? 1;
      if (level < node.skillLevelGate.level) {
        throw new AppError(
          400,
          `Requires ${node.skillLevelGate.skill} level ${node.skillLevelGate.level} (current: ${level})`,
          'SKILL_GATE_NOT_MET',
        );
      }
    }

    const newAllocations = { ...allocations, [nodeId]: node.pointCost };
    await tx.skillPointAllocation.update({
      where: { playerId },
      data: { allocations: newAllocations as any },
    });
  });

  return getSkillPoints(playerId);
}

/** Respec: spend turns, reset all allocations. */
export async function respecPoints(
  playerId: string,
  now: Date = new Date(),
): Promise<SkillPointAllocationData> {
  const state = await getSkillPoints(playerId);
  if (state.totalPointsSpent === 0) {
    throw new AppError(400, 'No points to respec', 'NOTHING_TO_RESPEC');
  }

  await prisma.$transaction(async (tx: any) => {
    await spendPlayerTurnsTx(tx, playerId, SKILL_POINT_CONSTANTS.RESPEC_TURN_COST, now);
    await tx.skillPointAllocation.update({
      where: { playerId },
      data: { allocations: {} },
    });
  });

  return getSkillPoints(playerId);
}

/** Get all action IDs unlocked by the player (base actions + talent unlocks). */
export async function getUnlockedActions(playerId: string): Promise<string[]> {
  const state = await getSkillPoints(playerId);
  return [
    ...ALWAYS_AVAILABLE_ACTION_IDS,
    ...state.unlockedActions,
  ];
}
