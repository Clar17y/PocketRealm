import { prisma } from '@adventure/database';
import type { CombatTemplateSlotData, CombatTemplateData, SlotCondition } from '@adventure/shared';
import { ALWAYS_AVAILABLE_ACTION_IDS, SKILL_POINT_CONSTANTS } from '@adventure/shared';
import { AppError } from '../middleware/errorHandler';

export interface CreateSlotInput {
  sortOrder?: number;
  actionId: string;
  condition?: SlotCondition;
  thenActionId?: string;
}

function toSlotData(slot: any): CombatTemplateSlotData {
  return {
    id: slot.id,
    sortOrder: slot.sortOrder,
    actionId: slot.actionId,
    ...(slot.conditionType ? {
      condition: {
        type: slot.conditionType,
        ...(slot.resource ? { resource: slot.resource } : {}),
        ...(slot.threshold != null ? { threshold: slot.threshold } : {}),
        ...(slot.effectName ? { effectName: slot.effectName } : {}),
      },
      thenActionId: slot.thenActionId,
    } : {}),
  };
}

function toTemplateData(record: any): CombatTemplateData {
  return {
    id: record.id,
    playerId: record.playerId,
    name: record.name,
    isActive: record.isActive,
    slots: (record.slots ?? []).map(toSlotData),
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt,
  };
}

export async function createTemplate(
  playerId: string,
  name: string,
  slots: CreateSlotInput[],
  unlockedActions: string[] = [],
): Promise<CombatTemplateData> {
  const count = await prisma.combatTemplate.count({ where: { playerId } });
  if (count >= SKILL_POINT_CONSTANTS.MAX_TEMPLATES) {
    throw new AppError(400, `Maximum ${SKILL_POINT_CONSTANTS.MAX_TEMPLATES} templates allowed`, 'TEMPLATE_LIMIT');
  }

  validateTemplateSlots(slots, unlockedActions);

  const isFirst = count === 0;
  const record = await prisma.combatTemplate.create({
    data: {
      playerId,
      name,
      isActive: isFirst,
      slots: {
        create: slots.map((s, i) => ({
          sortOrder: s.sortOrder ?? i,
          actionId: s.actionId,
          conditionType: s.condition?.type ?? null,
          resource: s.condition?.resource ?? null,
          threshold: s.condition?.threshold ?? null,
          effectName: s.condition?.effectName ?? null,
          thenActionId: s.thenActionId ?? null,
        })),
      },
    },
    include: { slots: { orderBy: { sortOrder: 'asc' } } },
  });

  return toTemplateData(record);
}

export async function getTemplates(playerId: string): Promise<CombatTemplateData[]> {
  const records = await prisma.combatTemplate.findMany({
    where: { playerId },
    orderBy: { createdAt: 'asc' },
    include: { slots: { orderBy: { sortOrder: 'asc' } } },
  });
  return records.map(toTemplateData);
}

export async function getActiveTemplate(playerId: string): Promise<CombatTemplateSlotData[]> {
  const record = await prisma.combatTemplate.findFirst({
    where: { playerId, isActive: true },
    include: { slots: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!record) {
    return [{ id: 'default', sortOrder: 0, actionId: SKILL_POINT_CONSTANTS.DEFAULT_ACTION_ID }];
  }

  return record.slots.map(toSlotData);
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
  slots?: CreateSlotInput[],
  unlockedActions: string[] = [],
): Promise<CombatTemplateData> {
  const template = await prisma.combatTemplate.findFirst({
    where: { id: templateId, playerId },
  });
  if (!template) throw new AppError(404, 'Template not found', 'NOT_FOUND');

  if (name !== undefined) {
    await prisma.combatTemplate.update({
      where: { id: templateId },
      data: { name },
    });
  }

  if (slots) {
    validateTemplateSlots(slots, unlockedActions);
    await prisma.$transaction(async (tx: any) => {
      await tx.combatTemplateSlot.deleteMany({ where: { templateId } });
      await tx.combatTemplateSlot.createMany({
        data: slots.map((s, i) => ({
          templateId,
          sortOrder: s.sortOrder ?? i,
          actionId: s.actionId,
          conditionType: s.condition?.type ?? null,
          resource: s.condition?.resource ?? null,
          threshold: s.condition?.threshold ?? null,
          effectName: s.condition?.effectName ?? null,
          thenActionId: s.thenActionId ?? null,
        })),
      });
    });
  }

  const record = await prisma.combatTemplate.findFirst({
    where: { id: templateId, playerId },
    include: { slots: { orderBy: { sortOrder: 'asc' } } },
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

export function validateTemplateSlots(
  slots: CreateSlotInput[],
  unlockedActions: string[] = [],
): void {
  if (slots.length === 0) {
    throw new AppError(400, 'Template must have at least one action', 'EMPTY_TEMPLATE');
  }

  const allAvailable = new Set([
    ...ALWAYS_AVAILABLE_ACTION_IDS,
    ...unlockedActions,
  ]);

  for (const slot of slots) {
    if (!allAvailable.has(slot.actionId)) {
      throw new AppError(400, `Action '${slot.actionId}' is not available`, 'ACTION_UNAVAILABLE');
    }

    if (slot.condition) {
      const { type } = slot.condition;

      if (type === 'resource_below' || type === 'resource_above') {
        if (!slot.condition.resource || slot.condition.threshold == null) {
          throw new AppError(
            400,
            `Condition '${type}' requires resource and threshold`,
            'INVALID_CONDITION',
          );
        }
      }

      if (type === 'has_buff' || type === 'has_debuff' || type === 'no_buff' || type === 'no_debuff') {
        if (!slot.condition.effectName) {
          throw new AppError(
            400,
            `Condition '${type}' requires effectName`,
            'INVALID_CONDITION',
          );
        }
      }

      if (!slot.thenActionId) {
        throw new AppError(
          400,
          'Slot with condition must have thenActionId',
          'INVALID_CONDITION',
        );
      }

      if (!allAvailable.has(slot.thenActionId)) {
        throw new AppError(400, `Action '${slot.thenActionId}' is not available`, 'ACTION_UNAVAILABLE');
      }
    }
  }
}
