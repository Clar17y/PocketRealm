import { prisma } from '@pocketrealm/database';
import {
  buildPlayerCombatStats, calculateMaxHp,
  calculateMaxStamina, calculateStaminaRegenPerRound,
  calculateMaxMana, calculateManaRegenPerRound,
} from '@pocketrealm/game-engine';
import type { SkillType } from '@pocketrealm/shared';
import { normalizePlayerAttributes } from './attributesService';
import { buildPlayerTemplateCombatant } from './combatOrchestrationService';
import { getSkillLevel } from './combatStatsService';
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
    include: { item: { include: { template: true } } },
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
  const [player, equipStats, attackStyle, template, skillPoints] = await Promise.all([
    prisma.player.findUniqueOrThrow({
      where: { id: playerId },
      select: { attributes: true },
    }),
    getEquipmentStats(playerId),
    getAttackStyle(playerId),
    getActiveTemplate(playerId),
    getSkillPoints(playerId),
  ]);

  const attributes = normalizePlayerAttributes(player.attributes);

  const [meleeLevel, rangedLevel, evasionLevel, magicLevel] = await Promise.all([
    getSkillLevel(playerId, 'melee'),
    getSkillLevel(playerId, 'ranged'),
    getSkillLevel(playerId, 'evasion' as SkillType),
    getSkillLevel(playerId, 'magic'),
  ]);

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
  });
}
