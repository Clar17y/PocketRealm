import { prisma } from '@pocketrealm/database';
import type { PerActionScaling, SkillType } from '@pocketrealm/shared';
import type { EquipmentStats } from './equipmentService';

export type AttackSkill = 'melee' | 'ranged' | 'magic';

export function attackSkillFromRequiredSkill(value: SkillType | null | undefined): AttackSkill | null {
  if (value === 'melee' || value === 'ranged' || value === 'magic') return value;
  return null;
}

export async function getMainHandAttackSkill(playerId: string): Promise<AttackSkill | null> {
  const mainHand = await prisma.playerEquipment.findUnique({
    where: { playerId_slot: { playerId, slot: 'main_hand' } },
    select: { item: { select: { template: { select: { requiredSkill: true } } } } },
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

export async function getSkillLevels(
  playerId: string,
  skillTypes: SkillType[],
): Promise<Record<string, number>> {
  const skills = await prisma.playerSkill.findMany({
    where: { playerId, skillType: { in: skillTypes } },
    select: { skillType: true, level: true },
  });
  const map: Record<string, number> = {};
  for (const st of skillTypes) map[st] = 1; // defaults
  for (const s of skills) map[s.skillType] = s.level;
  return map;
}

export async function buildPerActionScaling(
  playerId: string,
  preloaded?: {
    equipmentStats: EquipmentStats;
    attributes: { strength: number; dexterity: number; intelligence: number };
    weaponRequiredSkill: AttackSkill | null;
    guildDamageMultiplier?: number;
  },
): Promise<PerActionScaling> {
  const levels = await getSkillLevels(playerId, ['melee', 'ranged', 'magic']);
  const meleeLevel = levels.melee;
  const rangedLevel = levels.ranged;
  const magicLevel = levels.magic;

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
      guildDamageMultiplier: preloaded.guildDamageMultiplier,
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
