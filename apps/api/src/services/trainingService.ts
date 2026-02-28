import { prisma } from '@adventure/database';
import { redis } from '../redis';
import { runCombat, buildPlayerCombatStats, mobToCombatantStats, applyMobPrefix } from '@adventure/game-engine';
import { TRAINING_CONSTANTS } from '@adventure/shared';
import type { Combatant, CombatResult } from '@adventure/shared';
import { AppError } from '../middleware/errorHandler';
import { getEquipmentStats } from './equipmentService';
import { getPlayerProgressionState } from './attributesService';
import { getHpState } from './hpService';
import { getMainHandAttackSkill, getSkillLevel, type AttackSkill } from './combatStatsService';

function cooldownKey(playerId: string): string {
  return `training:cooldown:${playerId}`;
}

export async function getCooldownRemaining(playerId: string): Promise<number> {
  const ttl = await redis.ttl(cooldownKey(playerId));
  return ttl > 0 ? ttl : 0;
}

export async function simulateFight(
  playerId: string,
  mobTemplateId: string,
  prefix: string | null,
): Promise<{ combat: CombatResult; cooldownSeconds: number }> {
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

  // Build player combat stats using the same patterns as combat routes
  const mainHandAttackSkill = await getMainHandAttackSkill(playerId);
  const attackSkill: AttackSkill = mainHandAttackSkill ?? 'melee';

  const [hpState, attackLevel, progression, equipmentStats] = await Promise.all([
    getHpState(playerId),
    getSkillLevel(playerId, attackSkill),
    getPlayerProgressionState(playerId),
    getEquipmentStats(playerId),
  ]);

  const playerStats = buildPlayerCombatStats(
    hpState.currentHp,
    hpState.maxHp,
    { attackStyle: attackSkill, skillLevel: attackLevel, attributes: progression.attributes },
    equipmentStats,
  );

  // Apply prefix if specified
  const finalMob = prefix ? applyMobPrefix(mob as any, prefix) : mob;

  const combatantA: Combatant = { id: playerId, name: 'You', stats: playerStats };
  const combatantB: Combatant = {
    id: mob.id,
    name: prefix ? `${prefix} ${mob.name}` : mob.name,
    stats: mobToCombatantStats(finalMob as any),
  };

  const combatResult = runCombat(combatantA, combatantB);

  // Set cooldown
  await redis.set(cooldownKey(playerId), '1', 'EX', TRAINING_CONSTANTS.COOLDOWN_SECONDS);

  return { combat: combatResult, cooldownSeconds: TRAINING_CONSTANTS.COOLDOWN_SECONDS };
}
