import { prisma } from '@adventure/database';
import type { PerActionScaling, SkillType } from '@adventure/shared';
import type { EquipmentStats } from './equipmentService';

export type AttackSkill = 'melee' | 'ranged' | 'magic';

export function attackSkillFromRequiredSkill(value: SkillType | null | undefined): AttackSkill | null {
  if (value === 'melee' || value === 'ranged' || value === 'magic') return value;
  return null;
}

export async function getMainHandAttackSkill(playerId: string): Promise<AttackSkill | null> {
  const mainHand = await prisma.playerEquipment.findUnique({
    where: { playerId_slot: { playerId, slot: 'main_hand' } },
    include: { item: { include: { template: true } } },
  });
  const requiredSkill = mainHand?.item?.template?.requiredSkill as SkillType | null | undefined;
  return attackSkillFromRequiredSkill(requiredSkill);
}

export async function getSkillLevel(playerId: string, skillType: SkillType): Promise<number> {
  const skill = await prisma.playerSkill.findUnique({
    where: { playerId_skillType: { playerId, skillType } },
    select: { level: true },
  });
  return skill?.level ?? 1;
}

export async function buildPerActionScaling(
  playerId: string,
  preloaded?: {
    equipmentStats: EquipmentStats;
    attributes: { strength: number; dexterity: number; intelligence: number };
    weaponRequiredSkill: AttackSkill | null;
  },
): Promise<PerActionScaling> {
  const [meleeLevel, rangedLevel, magicLevel] = await Promise.all([
    getSkillLevel(playerId, 'melee'),
    getSkillLevel(playerId, 'ranged'),
    getSkillLevel(playerId, 'magic'),
  ]);

  if (preloaded) {
    const { equipmentStats, attributes, weaponRequiredSkill } = preloaded;
    return {
      skillLevels: { melee: meleeLevel, ranged: rangedLevel, magic: magicLevel },
      attributes: {
        strength: attributes.strength,
        dexterity: attributes.dexterity,
        intelligence: attributes.intelligence,
      },
      weaponPower: {
        attack: equipmentStats.attack,
        rangedPower: equipmentStats.rangedPower,
        magicPower: equipmentStats.magicPower,
      },
      equipmentAccuracy: equipmentStats.accuracy,
      weaponRequiredSkill,
    };
  }

  // Fallback: query everything from scratch
  const { getEquipmentStats } = await import('./equipmentService.js');
  const { getPlayerProgressionState } = await import('./attributesService.js');
  const [equipmentStats, progression, weaponRequiredSkill] = await Promise.all([
    getEquipmentStats(playerId),
    getPlayerProgressionState(playerId),
    getMainHandAttackSkill(playerId),
  ]);

  return {
    skillLevels: { melee: meleeLevel, ranged: rangedLevel, magic: magicLevel },
    attributes: {
      strength: progression.attributes.strength,
      dexterity: progression.attributes.dexterity,
      intelligence: progression.attributes.intelligence,
    },
    weaponPower: {
      attack: equipmentStats.attack,
      rangedPower: equipmentStats.rangedPower,
      magicPower: equipmentStats.magicPower,
    },
    equipmentAccuracy: equipmentStats.accuracy,
    weaponRequiredSkill,
  };
}
