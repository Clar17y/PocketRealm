import { prisma } from '@adventure/database';
import type { CombatTemplateAction, CombatTemplateData } from '@adventure/shared';
import { ALWAYS_AVAILABLE_ACTION_IDS, SKILL_POINT_CONSTANTS } from '@adventure/shared';
import { AppError } from '../middleware/errorHandler';

function toTemplateData(record: any): CombatTemplateData {
  return {
    id: record.id,
    playerId: record.playerId,
    name: record.name,
    isActive: record.isActive,
    actions: record.actions as CombatTemplateAction[],
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt,
  };
}

export async function createTemplate(
  playerId: string,
  name: string,
  actions: CombatTemplateAction[],
  unlockedActions: string[] = [],
): Promise<CombatTemplateData> {
  const count = await prisma.combatTemplate.count({ where: { playerId } });
  if (count >= SKILL_POINT_CONSTANTS.MAX_TEMPLATES) {
    throw new AppError(400, `Maximum ${SKILL_POINT_CONSTANTS.MAX_TEMPLATES} templates allowed`, 'TEMPLATE_LIMIT');
  }

  validateTemplateActions(actions, unlockedActions);

  const isFirst = count === 0;
  const record = await prisma.combatTemplate.create({
    data: {
      playerId,
      name,
      isActive: isFirst,
      actions: actions as any,
    },
  });

  return toTemplateData(record);
}

export async function getTemplates(playerId: string): Promise<CombatTemplateData[]> {
  const records = await prisma.combatTemplate.findMany({
    where: { playerId },
    orderBy: { createdAt: 'asc' },
  });
  return records.map(toTemplateData);
}

export async function getActiveTemplate(playerId: string): Promise<CombatTemplateAction[]> {
  const record = await prisma.combatTemplate.findFirst({
    where: { playerId, isActive: true },
  });

  if (!record) {
    return [{ actionId: SKILL_POINT_CONSTANTS.DEFAULT_ACTION_ID }];
  }

  return record.actions as unknown as CombatTemplateAction[];
}

export async function setActiveTemplate(playerId: string, templateId: string): Promise<void> {
  const template = await prisma.combatTemplate.findFirst({
    where: { id: templateId, playerId },
  });
  if (!template) throw new AppError(404, 'Template not found', 'NOT_FOUND');

  await prisma.$transaction(async (tx: any) => {
    await tx.combatTemplate.updateMany({
      where: { playerId },
      data: { isActive: false },
    });
    await tx.combatTemplate.update({
      where: { id: templateId },
      data: { isActive: true },
    });
  });
}

export async function updateTemplate(
  playerId: string,
  templateId: string,
  name?: string,
  actions?: CombatTemplateAction[],
  unlockedActions: string[] = [],
): Promise<CombatTemplateData> {
  const template = await prisma.combatTemplate.findFirst({
    where: { id: templateId, playerId },
  });
  if (!template) throw new AppError(404, 'Template not found', 'NOT_FOUND');

  if (actions) {
    validateTemplateActions(actions, unlockedActions);
  }

  const data: any = {};
  if (name !== undefined) data.name = name;
  if (actions !== undefined) data.actions = actions as any;

  const record = await prisma.combatTemplate.update({
    where: { id: templateId },
    data,
  });

  return toTemplateData(record);
}

export async function deleteTemplate(playerId: string, templateId: string): Promise<void> {
  const template = await prisma.combatTemplate.findFirst({
    where: { id: templateId, playerId },
  });
  if (!template) throw new AppError(404, 'Template not found', 'NOT_FOUND');
  if (template.isActive) {
    throw new AppError(400, 'Cannot delete the active template', 'ACTIVE_TEMPLATE');
  }

  await prisma.combatTemplate.delete({ where: { id: templateId } });
}

export function validateTemplateActions(
  actions: CombatTemplateAction[],
  unlockedActions: string[] = [],
): void {
  if (actions.length === 0) {
    throw new AppError(400, 'Template must have at least one action', 'EMPTY_TEMPLATE');
  }

  const allAvailable = new Set([
    ...ALWAYS_AVAILABLE_ACTION_IDS,
    ...unlockedActions,
  ]);

  for (const action of actions) {
    if (!allAvailable.has(action.actionId)) {
      throw new AppError(400, `Action '${action.actionId}' is not available`, 'ACTION_UNAVAILABLE');
    }
  }
}
