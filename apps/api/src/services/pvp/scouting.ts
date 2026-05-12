import { TALENT_TREE_DEFINITIONS } from '@pocketrealm/shared/constants/talentTreeDefinitions';
import { BASE_ACTION_DEFINITIONS } from '@pocketrealm/shared/constants/combatActionDefinitions';
import { prisma } from '@pocketrealm/database';
import {
  calculateMaxMana, calculateMaxStamina, } from '@pocketrealm/game-engine';
import {
  PVP_CONSTANTS, type ActionDefinition } from '@pocketrealm/shared';
import { AppError } from '../../middleware/errorHandler';
import { getEquipmentStats } from '../equipmentService';
import { getHpState } from '../hpService';
import { getSkillPoints } from '../skillPointService';
import { getActiveTemplate } from '../combatTemplateService';
import { normalizePlayerAttributes } from '../attributesService';
import { spendPlayerTurnsTx } from '../turnBankService';

async function calculatePowerRating(playerId: string): Promise<number> {
  const [equipStats, player, combatSkills] = await Promise.all([
    getEquipmentStats(playerId),
    prisma.player.findUnique({
      where: { id: playerId },
      select: { attributes: true },
    }),
    prisma.playerSkill.findMany({
      where: { playerId, skillType: { in: ['melee', 'ranged', 'magic'] } },
      select: { level: true },
    }),
  ]);

  const statTotal = equipStats.attack
    + equipStats.rangedPower
    + equipStats.magicPower
    + equipStats.armor
    + equipStats.magicDefence
    + equipStats.health
    + equipStats.dodge
    + equipStats.accuracy;

  const attrs = normalizePlayerAttributes(player?.attributes);
  const attrTotal = attrs.vitality
    + attrs.strength
    + attrs.dexterity
    + attrs.intelligence
    + attrs.luck
    + attrs.evasion;

  const skillTotal = combatSkills.reduce((sum, skill) => sum + skill.level, 0);
  return statTotal + attrTotal + skillTotal;
}

function computeTemplateCategoryBreakdown(
  template: Array<{ actionId: string }>,
  actionDefs: Record<string, ActionDefinition>,
): { offensiveCount: number; defensiveCount: number; supportiveCount: number } {
  let offensiveCount = 0;
  let defensiveCount = 0;
  let supportiveCount = 0;

  for (const action of template) {
    const definition = actionDefs[action.actionId];
    if (!definition) {
      continue;
    }

    switch (definition.category) {
      case 'offensive':
        offensiveCount += 1;
        break;
      case 'defensive':
        defensiveCount += 1;
        break;
      case 'supportive':
        supportiveCount += 1;
        break;
    }
  }

  return { offensiveCount, defensiveCount, supportiveCount };
}

function computeTalentInvestment(allocations: Record<string, number>): Record<string, number> {
  const investment: Record<string, number> = { melee: 0, ranged: 0, magic: 0, survival: 0 };

  for (const nodeId of Object.keys(allocations)) {
    for (const [tree, nodes] of Object.entries(TALENT_TREE_DEFINITIONS)) {
      const node = nodes.find((candidate) => candidate.id === nodeId);
      if (node) {
        investment[tree] = Math.max(investment[tree], node.tier);
      }
    }
  }

  return investment;
}

export async function scoutOpponent(attackerId: string, targetId: string) {
  const hpState = await getHpState(attackerId);
  if (hpState.isRecovering) {
    throw new AppError(400, 'Cannot scout while recovering', 'IS_RECOVERING');
  }

  const attackerZone = await prisma.player.findUnique({
    where: { id: attackerId },
    select: { currentZone: { select: { zoneType: true } } },
  });
  if (attackerZone?.currentZone?.zoneType !== 'town') {
    throw new AppError(400, 'Must be in a town to scout', 'NOT_IN_TOWN');
  }

  const target = await prisma.player.findUnique({
    where: { id: targetId },
    select: {
      characterLevel: true,
      attributes: true,
    },
  });
  if (!target) {
    throw new AppError(404, 'Target player not found', 'NOT_FOUND');
  }

  await prisma.$transaction(async (tx) => {
    await spendPlayerTurnsTx(tx, attackerId, PVP_CONSTANTS.SCOUT_TURN_COST);
  });

  const [targetEquipment, [targetPower, myPower], targetTemplate, targetSkills, skillPoints] = await Promise.all([
    prisma.playerEquipment.findMany({
      where: { playerId: targetId, itemId: { not: null } },
      include: { item: { include: { template: true } } },
    }),
    Promise.all([calculatePowerRating(targetId), calculatePowerRating(attackerId)]),
    getActiveTemplate(targetId),
    prisma.playerSkill.findMany({
      where: { playerId: targetId },
      select: { skillType: true, level: true },
    }),
    getSkillPoints(targetId),
  ]);

  const mainHand = targetEquipment.find((equipment) => equipment.slot === 'main_hand');
  const weaponSkill = mainHand?.item?.template?.requiredSkill as string | null;
  const attackStyle = weaponSkill === 'ranged'
    ? 'ranged'
    : weaponSkill === 'magic'
      ? 'magic'
      : 'melee';

  const chest = targetEquipment.find((equipment) => equipment.slot === 'chest');
  const weightClass = chest?.item?.template?.weightClass as string | null;
  const armorClass = weightClass ?? 'none';

  const categoryBreakdown = computeTemplateCategoryBreakdown(
    targetTemplate,
    BASE_ACTION_DEFINITIONS,
  );

  const skillMap: Record<string, number> = {};
  for (const skill of targetSkills) {
    skillMap[skill.skillType] = skill.level;
  }

  const maxStamina = calculateMaxStamina({
    meleeLevel: skillMap.melee ?? 1,
    rangedLevel: skillMap.ranged ?? 1,
    evasionLevel: skillMap.evasion ?? 1,
    equipmentStaminaBonus: 0,
  });
  const maxMana = calculateMaxMana({
    magicLevel: skillMap.magic ?? 1,
    equipmentManaBonus: 0,
  });
  const talentInvestment = computeTalentInvestment(skillPoints.allocations);

  await prisma.pvpScoutLog.create({
    data: { scouterId: attackerId, targetId },
  });

  return {
    combatLevel: target.characterLevel,
    attackStyle,
    armorClass,
    powerRating: targetPower,
    myPowerRating: myPower,
    templateInfo: {
      templateLength: targetTemplate.length,
      ...categoryBreakdown,
      maxStamina,
      maxMana,
      talentInvestment,
    },
  };
}
