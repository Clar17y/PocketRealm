import { prisma } from '@adventure/database';
import { redis } from '../redis';
import { buildPlayerCombatStats, runTemplateCombat, mobToTemplateCombatant, applyMobPrefix } from '@adventure/game-engine';
import type { TemplateCombatResult } from '@adventure/game-engine';
import { TRAINING_CONSTANTS } from '@adventure/shared';
import { AppError } from '../middleware/errorHandler';
import { getEquipmentStats } from './equipmentService';
import { getPlayerProgressionState } from './attributesService';
import { getHpState } from './hpService';
import { getMainHandAttackSkill, getSkillLevel, buildPerActionScaling, type AttackSkill } from './combatStatsService';
import { toMobTemplate } from '../utils/routeHelpers.js';
import { buildPlayerTemplateCombatant } from './combatOrchestrationService';
import { mapTemplateCombatLog } from './combatLogMapper';
import { getActiveTemplate } from './combatTemplateService';
import { getResourceState } from './resourceService';
import { getSkillPoints } from './skillPointService';

function cooldownKey(playerId: string): string {
  return `training:cooldown:${playerId}`;
}

export async function getCooldownRemaining(playerId: string): Promise<number> {
  const ttl = await redis.ttl(cooldownKey(playerId));
  return ttl > 0 ? ttl : 0;
}

export type TrainingCombatResult = Omit<TemplateCombatResult, 'log'> & {
  log: ReturnType<typeof mapTemplateCombatLog>;
};

export async function simulateFight(
  playerId: string,
  mobTemplateId: string,
  prefix: string | null,
): Promise<{ combat: TrainingCombatResult; cooldownSeconds: number }> {
  const remaining = await getCooldownRemaining(playerId);
  if (remaining > 0) {
    throw new AppError(429, `Training cooldown: ${remaining}s remaining`, 'TRAINING_COOLDOWN');
  }

  // Verify mob is in player's bestiary
  const bestiaryEntry = await prisma.playerBestiary.findUnique({
    where: { playerId_mobTemplateId: { playerId, mobTemplateId } },
  });
  if (!bestiaryEntry) {
    throw new AppError(400, 'You have not encountered this mob', 'MOB_NOT_IN_BESTIARY');
  }

  // If prefix specified, verify player has seen it
  if (prefix) {
    const prefixEntry = await prisma.playerBestiaryPrefix.findUnique({
      where: { playerId_mobTemplateId_prefix: { playerId, mobTemplateId, prefix } },
    });
    if (!prefixEntry) {
      throw new AppError(400, 'You have not encountered this prefix variant', 'PREFIX_NOT_IN_BESTIARY');
    }
  }

  // Load mob template
  const mob = await prisma.mobTemplate.findUnique({ where: { id: mobTemplateId } });
  if (!mob) throw new AppError(404, 'Mob not found', 'NOT_FOUND');

  // Load player username for the combatant label
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { username: true },
  });
  if (!player) throw new AppError(404, 'Player not found', 'NOT_FOUND');

  // Build player combat stats using the same patterns as combat routes
  const mainHandAttackSkill = await getMainHandAttackSkill(playerId);
  const attackSkill: AttackSkill = mainHandAttackSkill ?? 'melee';

  const [hpState, attackLevel, progression, equipmentStats, playerTemplate, resourceState, skillPointState] = await Promise.all([
    getHpState(playerId),
    getSkillLevel(playerId, attackSkill),
    getPlayerProgressionState(playerId),
    getEquipmentStats(playerId),
    getActiveTemplate(playerId),
    getResourceState(playerId),
    getSkillPoints(playerId),
  ]);

  const playerStats = buildPlayerCombatStats(
    hpState.currentHp,
    hpState.maxHp,
    { attackStyle: attackSkill, skillLevel: attackLevel, attributes: progression.attributes },
    equipmentStats,
  );

  const perActionScaling = await buildPerActionScaling(playerId, {
    equipmentStats,
    attributes: progression.attributes,
    weaponRequiredSkill: mainHandAttackSkill,
  });

  // Build player TemplateCombatant
  const playerCombatant = buildPlayerTemplateCombatant({
    playerId,
    username: player.username,
    playerStats,
    template: playerTemplate,
    stamina: resourceState.stamina.current,
    maxStamina: resourceState.stamina.max,
    staminaRegenPerRound: resourceState.stamina.regenPerRound,
    mana: resourceState.mana.current,
    maxMana: resourceState.mana.max,
    manaRegenPerRound: resourceState.mana.regenPerRound,
    unlockedActions: skillPointState.unlockedActions,
    perActionScaling,
  });

  // Build mob TemplateCombatant
  const mobTemplate = toMobTemplate(mob as Record<string, unknown>);
  const finalMob = applyMobPrefix(mobTemplate, prefix);
  const mobCombatant = mobToTemplateCombatant(finalMob);

  // Run template combat
  const combatResult = runTemplateCombat(playerCombatant, mobCombatant);

  // Set cooldown
  await redis.set(cooldownKey(playerId), '1', 'EX', TRAINING_CONSTANTS.COOLDOWN_SECONDS);

  return {
    combat: {
      ...combatResult,
      log: mapTemplateCombatLog(combatResult.log),
    },
    cooldownSeconds: TRAINING_CONSTANTS.COOLDOWN_SECONDS,
  };
}
