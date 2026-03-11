import { Prisma, prisma } from '@pocketrealm/database';
import type { CombatPotion, CombatTemplateSlotData, ConsumableEffect, ConsumableEffectType, PotionConsumed } from '@pocketrealm/shared';

const POTION_ACTION_IDS = new Set([
  'use_hp_potion', 'use_stamina_potion', 'use_mana_potion',
  'use_cleanse_potion', 'use_resist_potion', 'use_elixir_of_power',
]);

export function templateHasPotionActions(slots: CombatTemplateSlotData[]): boolean {
  return slots.some(s => POTION_ACTION_IDS.has(s.actionId) || (s.thenActionId && POTION_ACTION_IDS.has(s.thenActionId)));
}

function getEffectPotionType(effectType: ConsumableEffectType): CombatPotion['potionType'] {
  switch (effectType) {
    case 'heal_flat':
    case 'heal_percent':
      return 'hp';
    case 'restore_stamina':
      return 'stamina';
    case 'restore_mana':
      return 'mana';
    case 'cleanse_magic_dot':
      return 'cleanse';
    case 'buff_attack':
      return 'buff_attack';
    case 'buff_defence':
      return 'buff_defence';
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

    const potionType = getEffectPotionType(effect.type);
    const isResource = potionType === 'hp' || potionType === 'stamina' || potionType === 'mana';

    const healAmount = isResource
      ? (effect.type === 'heal_flat'
          ? effect.value
          : effect.type === 'heal_percent'
            ? Math.floor(maxHp * effect.value)
            : effect.value)
      : 0;

    for (let i = 0; i < item.quantity; i++) {
      const potion: CombatPotion = {
        name: item.template.name,
        healAmount,
        templateId: item.template.id,
        potionType,
      };

      if (effect.duration) potion.buffDuration = effect.duration;
      if (!isResource && effect.value) potion.buffValue = effect.value;

      potions.push(potion);
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
