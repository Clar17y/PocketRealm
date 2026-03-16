import { prisma } from '@pocketrealm/database';
import {
  buildPlayerCombatStats, calculateMaxHp,
  calculateMaxStamina, calculateStaminaRegenPerRound,
  calculateMaxMana, calculateManaRegenPerRound,
} from '@pocketrealm/game-engine';
import type { PerActionScaling, SkillType } from '@pocketrealm/shared';
import { normalizePlayerAttributes } from './attributesService';
import { buildPlayerTemplateCombatant } from './combatOrchestrationService';
import { getSkillLevels } from './combatStatsService';
import { getActiveTemplate } from './combatTemplateService';
import { getEquipmentStats } from './equipmentService';
import { getHpState } from './hpService';
import { getResourceState } from './resourceService';
import { getSkillPoints } from './skillPointService';

export type AttackStyle = 'melee' | 'ranged' | 'magic';

/** Determine attack style from main-hand weapon's required skill. */
export async function getAttackStyle(playerId: string): Promise<AttackStyle> {
  const mainHand = await prisma.playerEquipment.findUnique({
    where: { playerId_slot: { playerId, slot: 'main_hand' } },
    select: { item: { select: { template: { select: { requiredSkill: true } } } } },
  });
  const reqSkill = mainHand?.item?.template?.requiredSkill as string | null;
  if (reqSkill === 'ranged') return 'ranged';
  if (reqSkill === 'magic') return 'magic';
  return 'melee';
}

/**
 * Build a TemplateCombatant for PvP-style combat (arena, spar).
 *
 * @param useCurrentResources  true = attacker (live HP/stamina/mana),
 *                              false = defender ghost (max everything)
 */
export async function buildPvpCombatant(
  playerId: string,
  username: string,
  useCurrentResources: boolean,
) {
  const [player, equipStats, attackStyle, template, skillPoints, levels] = await Promise.all([
    prisma.player.findUniqueOrThrow({
      where: { id: playerId },
      select: { attributes: true },
    }),
    getEquipmentStats(playerId),
    getAttackStyle(playerId),
    getActiveTemplate(playerId),
    getSkillPoints(playerId),
    getSkillLevels(playerId, ['melee', 'ranged', 'evasion', 'magic'] as SkillType[]),
  ]);

  const attributes = normalizePlayerAttributes(player.attributes);
  const meleeLevel = levels.melee;
  const rangedLevel = levels.ranged;
  const evasionLevel = levels.evasion;
  const magicLevel = levels.magic;

  const skillLevel = attackStyle === 'ranged' ? rangedLevel
    : attackStyle === 'magic' ? magicLevel
    : meleeLevel;

  const maxHp = calculateMaxHp({
    vitalityLevel: attributes.vitality,
    equipmentHealthBonus: equipStats.health,
  });

  let currentHp = maxHp;
  let stamina: number;
  let maxStamina: number;
  let mana: number;
  let maxMana: number;

  if (useCurrentResources) {
    const [hpState, resources] = await Promise.all([
      getHpState(playerId),
      getResourceState(playerId),
    ]);
    currentHp = hpState.currentHp;
    stamina = resources.stamina.current;
    maxStamina = resources.stamina.max;
    mana = resources.mana.current;
    maxMana = resources.mana.max;
  } else {
    maxStamina = calculateMaxStamina({
      meleeLevel, rangedLevel, evasionLevel, equipmentStaminaBonus: 0,
    });
    stamina = maxStamina;
    maxMana = calculateMaxMana({ magicLevel, equipmentManaBonus: 0 });
    mana = maxMana;
  }

  const stats = buildPlayerCombatStats(
    currentHp, maxHp,
    { attackStyle, skillLevel, attributes },
    equipStats,
  );

  const perActionScaling: PerActionScaling = {
    skillLevels: { melee: meleeLevel, ranged: rangedLevel, magic: magicLevel },
    attributes: {
      strength: attributes.strength,
      dexterity: attributes.dexterity,
      intelligence: attributes.intelligence,
    },
    weaponPower: {
      attack: equipStats.attack,
      rangedPower: equipStats.rangedPower,
      magicPower: equipStats.magicPower,
    },
    equipmentAccuracy: equipStats.accuracy,
    weaponRequiredSkill: attackStyle,
  };

  return buildPlayerTemplateCombatant({
    playerId,
    username,
    playerStats: stats,
    template,
    stamina,
    maxStamina,
    staminaRegenPerRound: calculateStaminaRegenPerRound(meleeLevel, rangedLevel, evasionLevel),
    mana,
    maxMana,
    manaRegenPerRound: calculateManaRegenPerRound(magicLevel),
    unlockedActions: skillPoints.unlockedActions,
    perActionScaling,
  });
}
