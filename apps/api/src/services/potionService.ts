import { Prisma, prisma } from '@adventure/database';
import type { CombatPotion, CombatTemplateSlotData, ConsumableEffect, ConsumableEffectType, PotionConsumed } from '@adventure/shared';

const POTION_ACTION_IDS = new Set(['use_hp_potion', 'use_stamina_potion', 'use_mana_potion']);

export function templateHasPotionActions(slots: CombatTemplateSlotData[]): boolean {
  return slots.some(s => POTION_ACTION_IDS.has(s.actionId) || (s.thenActionId && POTION_ACTION_IDS.has(s.thenActionId)));
}

function getEffectPotionType(effectType: ConsumableEffectType): 'hp' | 'stamina' | 'mana' {
  switch (effectType) {
    case 'heal_flat':
    case 'heal_percent':
      return 'hp';
    case 'restore_stamina':
      return 'stamina';
    case 'restore_mana':
      return 'mana';
  }
}

export async function buildPotionPool(playerId: string, maxHp: number): Promise<CombatPotion[]> {
  const consumables = await prisma.item.findMany({
    where: {
      ownerId: playerId,
      template: { itemType: 'consumable' },
    },
    include: { template: true },
  });

  const potions: CombatPotion[] = [];
  for (const item of consumables) {
    const effect = item.template.consumableEffect as ConsumableEffect | null;
    if (!effect) continue;

    const healAmount = effect.type === 'heal_flat'
      ? effect.value
      : effect.type === 'heal_percent'
        ? Math.floor(maxHp * effect.value)
        : effect.value;

    for (let i = 0; i < item.quantity; i++) {
      potions.push({
        name: item.template.name,
        healAmount,
        templateId: item.template.id,
        potionType: getEffectPotionType(effect.type),
      });
    }
  }
  return potions;
}

export async function deductConsumedPotions(
  playerId: string,
  consumed: PotionConsumed[],
  tx?: Prisma.TransactionClient,
): Promise<void> {
  if (consumed.length === 0) return;

  const db = tx ?? prisma;

  const counts = new Map<string, number>();
  for (const p of consumed) {
    counts.set(p.templateId, (counts.get(p.templateId) ?? 0) + 1);
  }

  for (const [templateId, count] of counts) {
    const item = await db.item.findFirst({
      where: { ownerId: playerId, templateId },
    });
    if (!item) continue;

    if (item.quantity <= count) {
      await db.item.delete({ where: { id: item.id } });
    } else {
      await db.item.update({
        where: { id: item.id },
        data: { quantity: item.quantity - count },
      });
    }
  }
}
