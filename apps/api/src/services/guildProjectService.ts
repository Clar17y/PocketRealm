import { prisma, Prisma } from '@pocketrealm/database';
import {
  GUILD_PROJECT_DEFINITIONS,
  GUILD_PROJECT_CONSTANTS,
  getCategoryForTemplate,
  type GuildProjectDefinition,
} from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { requireRole } from './guildService';
import { spendPlayerTurnsTx } from './turnBankService';
import { consumeItemsByTemplateTx } from './inventoryService';
import { addGuildXp } from './guildService';
import { materialsProgressSchema } from '../utils/jsonColumnSchemas';

// ---------------------------------------------------------------------------
// Start Project
// ---------------------------------------------------------------------------

export async function startProject(
  playerId: string,
  guildId: string,
  projectKey: string,
) {
  const def = GUILD_PROJECT_DEFINITIONS.find((d) => d.key === projectKey);
  if (!def) throw new AppError(400, 'Unknown project key', 'INVALID_PROJECT');

  // Validate requester role
  const membership = await requireRole(playerId, 'officer');
  if (membership.guildId !== guildId) {
    throw new AppError(403, 'Not in this guild', 'NOT_IN_GUILD');
  }
  const guild = membership.guild;

  // Check no active project
  const activeProject = await prisma.guildProject.findFirst({
    where: { guildId, status: 'active' },
  });
  if (activeProject) {
    throw new AppError(400, 'Guild already has an active project', 'PROJECT_ALREADY_ACTIVE');
  }

  // Check not already completed
  const allProjects = await prisma.guildProject.findMany({
    where: { guildId },
    select: { projectKey: true, status: true },
  });
  const completedKeys = new Set(allProjects.filter((p) => p.status === 'completed').map((p) => p.projectKey));

  if (completedKeys.has(projectKey)) {
    throw new AppError(400, 'This project has already been completed', 'PROJECT_ALREADY_COMPLETED');
  }

  // Check prerequisites
  if (!arePrerequisitesMet(def, completedKeys)) {
    throw new AppError(400, 'Prerequisites not met', 'PREREQUISITES_NOT_MET');
  }

  // Check treasury
  if (guild.treasuryTurns < def.treasuryCost) {
    throw new AppError(400, 'Insufficient treasury for this project', 'INSUFFICIENT_TREASURY');
  }

  // Transaction: deduct treasury, create project, log
  const project = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.guild.update({
      where: { id: guildId },
      data: { treasuryTurns: { decrement: def.treasuryCost } },
    });

    const created = await tx.guildProject.create({
      data: {
        guildId,
        projectKey,
        turnsContributed: 0,
        materialsProgress: {},
        status: 'active',
      },
    });

    await tx.guildLog.create({
      data: {
        guildId,
        eventType: 'project_started',
        message: `${def.name} project started (cost: ${def.treasuryCost.toLocaleString()} treasury turns)`,
        metadata: { projectKey, treasuryCost: def.treasuryCost },
      },
    });

    return created;
  });

  return toProjectData(project, def);
}

// ---------------------------------------------------------------------------
// Get Guild Projects
// ---------------------------------------------------------------------------

export async function getGuildProjects(guildId: string) {
  const projects = await prisma.guildProject.findMany({
    where: { guildId },
    include: { contributions: true },
    orderBy: { startedAt: 'desc' },
  });

  // Collect unique player IDs from contributions to look up usernames
  const playerIds = new Set<string>();
  for (const p of projects) {
    for (const c of p.contributions) {
      playerIds.add(c.playerId);
    }
  }
  const players = playerIds.size > 0
    ? await prisma.player.findMany({
        where: { id: { in: [...playerIds] } },
        select: { id: true, username: true },
      })
    : [];
  const usernameMap = new Map(players.map((p) => [p.id, p.username]));

  return projects.map((p) => {
    const def = GUILD_PROJECT_DEFINITIONS.find((d) => d.key === p.projectKey);
    return {
      ...toProjectData(p, def),
      contributions: p.contributions.map((c) => ({
        playerId: c.playerId,
        username: usernameMap.get(c.playerId) ?? 'Unknown',
        turnsContributed: c.turnsContributed,
        materialsContributed: materialsProgressSchema.catch({}).parse(c.materialsContributed ?? {}),
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Contribute Turns
// ---------------------------------------------------------------------------

export async function contributeTurns(
  playerId: string,
  guildId: string,
  projectId: string,
  amount: number,
) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AppError(400, 'Amount must be a positive integer', 'INVALID_AMOUNT');
  }

  const membership = await prisma.guildMember.findUnique({ where: { playerId } });
  if (!membership || membership.guildId !== guildId) {
    throw new AppError(403, 'Not in this guild', 'NOT_IN_GUILD');
  }

  const project = await prisma.guildProject.findFirst({
    where: { id: projectId, guildId, status: 'active' },
  });
  if (!project) {
    throw new AppError(404, 'Project not found or not active', 'PROJECT_NOT_ACTIVE');
  }

  // Check per-project turn cap
  const contribution = await prisma.guildProjectContribution.findUnique({
    where: { projectId_playerId: { projectId, playerId } },
  });
  const contributedTurns = contribution?.turnsContributed ?? 0;
  if (contributedTurns + amount > GUILD_PROJECT_CONSTANTS.PER_PROJECT_TURN_CAP) {
    throw new AppError(400, `Exceeds per-project turn contribution cap (${GUILD_PROJECT_CONSTANTS.PER_PROJECT_TURN_CAP})`, 'CONTRIBUTION_CAP_EXCEEDED');
  }

  const def = GUILD_PROJECT_DEFINITIONS.find((d) => d.key === project.projectKey);

  // Cap to remaining needed
  const remaining = (def?.memberTurnGoal ?? Infinity) - project.turnsContributed;
  const effectiveAmount = Math.min(amount, remaining);

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Spend player turns
    await spendPlayerTurnsTx(tx, playerId, effectiveAmount);

    // Update project
    const updatedProject = await tx.guildProject.update({
      where: { id: projectId },
      data: { turnsContributed: { increment: effectiveAmount } },
    });

    // Upsert contribution
    await tx.guildProjectContribution.upsert({
      where: { projectId_playerId: { projectId, playerId } },
      create: { projectId, playerId, turnsContributed: effectiveAmount, materialsContributed: {} },
      update: { turnsContributed: { increment: effectiveAmount } },
    });

    // Check for completion
    await checkAndCompleteProject(tx, updatedProject, def, guildId);

    // Re-fetch to get final state
    return tx.guildProject.findUnique({ where: { id: projectId } });
  });

  return toProjectData(updated!, def);
}

// ---------------------------------------------------------------------------
// Contribute Materials
// ---------------------------------------------------------------------------

export async function contributeMaterials(
  playerId: string,
  guildId: string,
  projectId: string,
  templateId: string,
  quantity: number,
) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new AppError(400, 'Quantity must be a positive integer', 'INVALID_QUANTITY');
  }

  const membership = await prisma.guildMember.findUnique({ where: { playerId } });
  if (!membership || membership.guildId !== guildId) {
    throw new AppError(403, 'Not in this guild', 'NOT_IN_GUILD');
  }

  const project = await prisma.guildProject.findFirst({
    where: { id: projectId, guildId, status: 'active' },
  });
  if (!project) {
    throw new AppError(404, 'Project not found or not active', 'PROJECT_NOT_ACTIVE');
  }

  const def = GUILD_PROJECT_DEFINITIONS.find((d) => d.key === project.projectKey);
  if (!def) throw new AppError(500, 'Project definition not found', 'INTERNAL_ERROR');

  // Resolve template name to category
  const template = await prisma.itemTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new AppError(404, 'Item template not found', 'NOT_FOUND');

  const category = getCategoryForTemplate(template.name);
  if (!category) {
    throw new AppError(400, 'This material is not needed for this project', 'INVALID_MATERIAL');
  }

  // Check category is needed by this project
  const requiredCost = def.materialCosts.find((c) => c.category === category);
  if (!requiredCost) {
    throw new AppError(400, 'This material is not needed for this project', 'INVALID_MATERIAL');
  }

  // Check per-project material cap for this player
  const existingContribution = await prisma.guildProjectContribution.findUnique({
    where: { projectId_playerId: { projectId, playerId } },
  });
  const contributedMaterials = materialsProgressSchema.catch({}).parse(existingContribution?.materialsContributed ?? {});
  const playerCategoryTotal = contributedMaterials[category] ?? 0;
  if (playerCategoryTotal + quantity > GUILD_PROJECT_CONSTANTS.PER_PROJECT_MATERIAL_CAP) {
    throw new AppError(
      400,
      `Exceeds per-project material contribution cap (${GUILD_PROJECT_CONSTANTS.PER_PROJECT_MATERIAL_CAP} per category)`,
      'CONTRIBUTION_CAP_EXCEEDED',
    );
  }

  // Check category not already fully contributed
  const progress = materialsProgressSchema.catch({}).parse(project.materialsProgress ?? {});
  const currentProgress = progress[category] ?? 0;
  if (currentProgress >= requiredCost.quantity) {
    throw new AppError(400, `${category} materials already fully contributed`, 'CATEGORY_COMPLETE');
  }

  // Cap to remaining needed
  const remaining = requiredCost.quantity - currentProgress;
  const effectiveQuantity = Math.min(quantity, remaining);

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Consume items
    await consumeItemsByTemplateTx(tx, playerId, templateId, effectiveQuantity);

    // Update materials progress
    const newProgress = { ...progress, [category]: currentProgress + effectiveQuantity };
    const updatedProject = await tx.guildProject.update({
      where: { id: projectId },
      data: { materialsProgress: newProgress },
    });

    // Upsert contribution
    const existingContrib = await tx.guildProjectContribution.findUnique({
      where: { projectId_playerId: { projectId, playerId } },
    });
    const existingMaterials = materialsProgressSchema.catch({}).parse(existingContrib?.materialsContributed ?? {});
    const newMaterialsContrib = {
      ...existingMaterials,
      [category]: (existingMaterials[category] ?? 0) + effectiveQuantity,
    };

    await tx.guildProjectContribution.upsert({
      where: { projectId_playerId: { projectId, playerId } },
      create: { projectId, playerId, turnsContributed: 0, materialsContributed: newMaterialsContrib },
      update: { materialsContributed: newMaterialsContrib },
    });

    // Check for completion
    await checkAndCompleteProject(tx, updatedProject, def, guildId);

    // Re-fetch to get final state
    return tx.guildProject.findUnique({ where: { id: projectId } });
  });

  return toProjectData(updated!, def);
}

// ---------------------------------------------------------------------------
// Get Available Projects
// ---------------------------------------------------------------------------

export async function getAvailableProjects(guildId: string) {
  const allProjects = await prisma.guildProject.findMany({
    where: { guildId },
    select: { projectKey: true, status: true },
  });
  const completedKeys = new Set(allProjects.filter((p) => p.status === 'completed').map((p) => p.projectKey));
  const activeKeys = new Set(allProjects.filter((p) => p.status === 'active').map((p) => p.projectKey));

  const hasActiveProject = await prisma.guildProject.findFirst({
    where: { guildId, status: 'active' },
  });

  return GUILD_PROJECT_DEFINITIONS
    .filter((def) => !completedKeys.has(def.key) && !activeKeys.has(def.key))
    .map((def) => {
      const prereqsMet = arePrerequisitesMet(def, completedKeys);
      let canStart = prereqsMet && !hasActiveProject;
      let reason: string | undefined;

      if (hasActiveProject) {
        canStart = false;
        reason = 'Another project is already active';
      } else if (!prereqsMet) {
        canStart = false;
        reason = 'Prerequisites not met';
      }

      return {
        key: def.key,
        name: def.name,
        description: def.description,
        level: def.level,
        prerequisites: def.prerequisites,
        treasuryCost: def.treasuryCost,
        materialCosts: [...def.materialCosts],
        memberTurnGoal: def.memberTurnGoal,
        perks: [...def.perks],
        guildXpReward: def.guildXpReward,
        canStart,
        reason,
      };
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function arePrerequisitesMet(
  def: GuildProjectDefinition,
  completedKeys: Set<string>,
): boolean {
  // Apothecary special case: requires ANY one L1 project
  if (def.key === 'apothecary') {
    const l1Keys = GUILD_PROJECT_DEFINITIONS.filter((d) => d.level === 1).map((d) => d.key);
    return l1Keys.some((k) => completedKeys.has(k));
  }

  // Standard: all listed prerequisites must be completed
  if (def.prerequisites.length === 0) return true;
  return def.prerequisites.every((prereq) => completedKeys.has(prereq));
}

async function checkAndCompleteProject(
  tx: Prisma.TransactionClient,
  project: { id: string; projectKey: string; turnsContributed: number; materialsProgress: any },
  def: GuildProjectDefinition | undefined,
  guildId: string,
): Promise<void> {
  if (!def) return;

  // Check turns goal
  if (project.turnsContributed < def.memberTurnGoal) return;

  // Check all material goals
  const progress = materialsProgressSchema.catch({}).parse(project.materialsProgress ?? {});
  for (const cost of def.materialCosts) {
    if ((progress[cost.category] ?? 0) < cost.quantity) return;
  }

  // All goals met — complete project
  await tx.guildProject.update({
    where: { id: project.id },
    data: { status: 'completed', completedAt: new Date() },
  });

  // Grant guild XP (inside transaction)
  await addGuildXp(guildId, def.guildXpReward, tx);

  // Log
  await tx.guildLog.create({
    data: {
      guildId,
      eventType: 'project_completed',
      message: `${def.name} project completed!`,
      metadata: { projectKey: def.key, guildXpReward: def.guildXpReward },
    },
  });
}

function toProjectData(
  project: {
    id: string;
    projectKey: string;
    turnsContributed: number;
    materialsProgress: any;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
  },
  def: GuildProjectDefinition | undefined,
) {
  return {
    id: project.id,
    projectKey: project.projectKey,
    name: def?.name ?? project.projectKey,
    description: def?.description ?? '',
    level: def?.level ?? 0,
    status: project.status,
    treasuryCost: def?.treasuryCost ?? 0,
    materialCosts: def?.materialCosts ? [...def.materialCosts] : [],
    materialsProgress: materialsProgressSchema.catch({}).parse(project.materialsProgress ?? {}),
    memberTurnGoal: def?.memberTurnGoal ?? 0,
    turnsContributed: project.turnsContributed,
    perks: def?.perks ? [...def.perks] : [],
    startedAt: project.startedAt.toISOString(),
    completedAt: project.completedAt?.toISOString() ?? null,
  };
}
