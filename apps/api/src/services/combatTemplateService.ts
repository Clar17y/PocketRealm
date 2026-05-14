import { ALWAYS_AVAILABLE_ACTION_IDS, BASE_ACTION_DEFINITIONS } from '@pocketrealm/shared/constants/combatActionDefinitions';
import { prisma, Prisma } from '@pocketrealm/database';
import type { CombatTemplate, CombatTemplateSlot } from '@pocketrealm/database';
import type { CombatTemplateSlotData, CombatTemplateData, SlotCondition } from '@pocketrealm/shared';
import { PREMIUM_CONSTANTS, SKILL_POINT_CONSTANTS } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { getHasActivePremiumEntitlement } from './premiumEntitlement';

interface CreateSlotInput {
  sortOrder?: number;
  actionId: string;
  condition?: SlotCondition;
  thenActionId?: string;
}

function toSlotCreateData(slot: CreateSlotInput, index: number) {
  return {
    sortOrder: slot.sortOrder ?? index,
    actionId: slot.actionId,
    conditionType: slot.condition?.type ?? null,
    resource: slot.condition?.resource ?? null,
    threshold: slot.condition?.threshold ?? null,
    effectName: slot.condition?.effectName ?? null,
    thenActionId: slot.thenActionId ?? null,
  };
}

function toSlotData(slot: CombatTemplateSlot): CombatTemplateSlotData {
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
      thenActionId: slot.thenActionId ?? undefined,
    } : {}),
  };
}

function toTemplateData(record: CombatTemplate & { slots: CombatTemplateSlot[] }): CombatTemplateData {
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
  const [count, hasActivePremiumEntitlement] = await Promise.all([
    prisma.combatTemplate.count({ where: { playerId } }),
    getHasActivePremiumEntitlement(prisma, playerId),
  ]);
  const templateLimit = hasActivePremiumEntitlement
    ? PREMIUM_CONSTANTS.TEMPLATE_LIMIT_CHAMPION
    : PREMIUM_CONSTANTS.TEMPLATE_LIMIT_FREE;

  if (count >= templateLimit) {
    throw new AppError(400, `Maximum ${templateLimit} templates allowed`, 'TEMPLATE_LIMIT');
  }

  validateTemplateSlots(slots, unlockedActions);

  const isFirst = count === 0;
  const record = await prisma.combatTemplate.create({
    data: {
      playerId,
      name,
      isActive: isFirst,
      slots: {
        create: slots.map(toSlotCreateData),
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

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

  if (slots) {
    validateTemplateSlots(slots, unlockedActions);
  }

  await prisma.$transaction(async (tx) => {
    if (name !== undefined) {
      await tx.combatTemplate.update({
        where: { id: templateId },
        data: { name },
      });
    }
    if (slots) {
      await tx.combatTemplateSlot.deleteMany({ where: { templateId } });
      await tx.combatTemplateSlot.createMany({
        data: slots.map((s, i) => ({ templateId, ...toSlotCreateData(s, i) })),
      });
    }
  });

  const updated = await prisma.combatTemplate.findUniqueOrThrow({
    where: { id: templateId },
    include: { slots: { orderBy: { sortOrder: 'asc' } } },
  });
  return toTemplateData(updated);
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
    // Validate action exists in the definition registry (prevents corrupt templates)
    if (!BASE_ACTION_DEFINITIONS[slot.actionId]) {
      throw new AppError(400, `Unknown action '${slot.actionId}'`, 'UNKNOWN_ACTION');
    }
    if (!allAvailable.has(slot.actionId)) {
      throw new AppError(400, `Action '${slot.actionId}' is not available`, 'ACTION_UNAVAILABLE');
    }

    // Condition field consistency (resource/threshold, effectName) is validated
    // by Zod schemas in the route layer. Here we only check action availability.
    if (slot.thenActionId) {
      if (!BASE_ACTION_DEFINITIONS[slot.thenActionId]) {
        throw new AppError(400, `Unknown action '${slot.thenActionId}'`, 'UNKNOWN_ACTION');
      }
      if (!allAvailable.has(slot.thenActionId)) {
        throw new AppError(400, `Action '${slot.thenActionId}' is not available`, 'ACTION_UNAVAILABLE');
      }
    }
  }
}
