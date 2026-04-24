import { randomUUID } from 'crypto';
import type { Server as SocketServer } from 'socket.io';
import { prisma } from '@pocketrealm/database';
import { logger } from '../../logger';
import {
  BASE_ACTION_DEFINITIONS,
  BOSS_ACTION_DEFINITIONS,
  BOSS_TEMPLATES,
  GUILD_CONSTANTS,
  WORLD_EVENT_CONSTANTS,
  type BossRoundSummary,
} from '@pocketrealm/shared';
import {
  buildPlayerCombatStats,
  calculateManaRegenPerRound,
  calculateStaminaRegenPerRound,
  initThreatTable,
  resolveBossRound as resolveBossRoundEngine,
  type BossRoundInput,
  type BossRoundParticipant,
  type BossRoundResult,
  type BossState,
} from '@pocketrealm/game-engine';
import { AppError } from '../../middleware/errorHandler';
import { calculateFleeWithGold, trackAchievements } from '../../utils/routeHelpers.js';
import { parseBossEffects, parseBossRoundSummaries } from '../../utils/bossJsonSchemas';
import { broadcastBossDefeatActivity } from '../chatActivityService';
import { emitSystemMessage } from '../systemMessageService';
import { getEquipmentStats } from '../equipmentService';
import { getPlayerProgressionState } from '../attributesService';
import { getActiveTemplate } from '../combatTemplateService';
import { getHpState, enterRecoveringState, setHp } from '../hpService';
import { getMainHandAttackSkill, getSkillLevel } from '../combatStatsService';
import { distributeBossLoot } from '../bossLootService';
import { redis } from '../../redis';
import { sendPush } from '../pushNotificationService';
import { addGuildXp } from '../guildService';
import { roundTimerRegistry } from '../roundTimerRegistry';
import { getIo } from '../../socket';
import { spendPlayerTurnsTx } from '../turnBankService';
import {
  computeResourcePools,
  isBossEncounterDue,
  resolveUsername,
  type DueBossEncounterRef,
} from './shared';

// Distributed lock to prevent concurrent resolution corrupting boss HP.
// A unique token is stored so the finally block can only release the lock
// it owns, guarding against TTL expiry while resolution is still running.
async function withBossRoundLock<T>(
  encounterId: string,
  resolve: () => Promise<T>,
): Promise<T | null> {
  const lockKey = `boss_resolve:${encounterId}`;
  const lockToken = randomUUID();
  const acquired = await redis.set(lockKey, lockToken, 'EX', 30, 'NX');
  if (!acquired) {
    return null;
  }

  try {
    return await resolve();
  } finally {
    const releaseScript = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
    await redis.eval(releaseScript, 1, lockKey, lockToken);
  }
}

async function revealBossRotation(
  mobTemplateId: string,
  alivePlayerIds: string[],
  roundNumber: number,
): Promise<void> {
  await Promise.all(
    alivePlayerIds.map((playerId) =>
      prisma.$queryRaw`
        INSERT INTO player_boss_rotations (player_id, mob_template_id, rounds_revealed)
        VALUES (${playerId}, ${mobTemplateId}, ${roundNumber})
        ON CONFLICT (player_id, mob_template_id)
        DO UPDATE SET rounds_revealed = GREATEST(player_boss_rotations.rounds_revealed, ${roundNumber})
      `,
    ),
  );
}

export async function resolveBossRound(
  encounterId: string,
  io: SocketServer | null,
): Promise<{ bossDefeated: boolean; roundResult: BossRoundResult } | null> {
  return withBossRoundLock(encounterId, () => resolveBossRoundInner(encounterId, io));
}

export async function resolveDueBossEncounter(
  encounterId: string,
  io: SocketServer | null,
): Promise<void> {
  const encounter = await prisma.bossEncounter.findUnique({
    where: { id: encounterId },
    select: { id: true, status: true, nextRoundAt: true },
  });
  if (!isBossEncounterDue(encounter)) {
    return;
  }

  const dueEncounter: DueBossEncounterRef = encounter;
  await withBossRoundLock(dueEncounter.id, () =>
    resolveBossRoundInner(dueEncounter.id, io, { requireDue: true }),
  );
}

async function resolveBossRoundInner(
  encounterId: string,
  io: SocketServer | null,
  options: { requireDue?: boolean } = {},
): Promise<{ bossDefeated: boolean; roundResult: BossRoundResult } | null> {
  const encounter = await prisma.bossEncounter.findUnique({
    where: { id: encounterId },
    include: {
      event: { select: { zoneId: true, title: true, zone: { select: { name: true, difficulty: true } } } },
      mobTemplate: {
        select: {
          id: true,
          name: true,
          level: true,
          defence: true,
          magicDefence: true,
          evasion: true,
          damageMin: true,
          damageMax: true,
          accuracy: true,
          hp: true,
          damageType: true,
          bossAoeDmg: true,
        },
      },
    },
  });
  if (!encounter || encounter.status === 'defeated' || encounter.status === 'expired') {
    return null;
  }
  if (options.requireDue && !isBossEncounterDue(encounter)) {
    return null;
  }

  const nextRound = encounter.roundNumber + 1;
  const signups = await prisma.bossParticipant.findMany({
    where: { encounterId, roundNumber: nextRound },
  });
  if (signups.length === 0) {
    return null;
  }

  const zoneTier = encounter.event.zone?.difficulty ?? 1;
  const tierIndex = Math.max(0, Math.min(4, zoneTier - 1));
  const participantCount = signups.length;

  const hpPerPlayer =
    WORLD_EVENT_CONSTANTS.BOSS_HP_PER_PLAYER_BY_TIER[tierIndex]
    ?? WORLD_EVENT_CONSTANTS.BOSS_HP_PER_PLAYER_BY_TIER[0]
    ?? 500;
  const scaledMaxHp = hpPerPlayer * participantCount;
  const hpPercent = encounter.maxHp > 0 ? encounter.currentHp / encounter.maxHp : 1;
  const scaledCurrentHp = Math.round(scaledMaxHp * hpPercent);
  await prisma.bossEncounter.update({
    where: { id: encounterId },
    data: { maxHp: scaledMaxHp, currentHp: scaledCurrentHp, scaledAt: new Date() },
  });
  encounter.maxHp = scaledMaxHp;
  encounter.currentHp = scaledCurrentHp;

  const participants: BossRoundParticipant[] = await Promise.all(
    signups.map(async (signup) => {
      const [hpState, equipStats, template, resources, mainHandSkill, progression] = await Promise.all([
        getHpState(signup.playerId),
        getEquipmentStats(signup.playerId),
        getActiveTemplate(signup.playerId),
        computeResourcePools(signup.playerId),
        getMainHandAttackSkill(signup.playerId),
        getPlayerProgressionState(signup.playerId),
      ]);
      const attackSkill = mainHandSkill ?? 'melee';
      const attackSkillLevel = await getSkillLevel(signup.playerId, attackSkill);
      const stats = buildPlayerCombatStats(
        hpState.maxHp,
        hpState.maxHp,
        {
          attackStyle: attackSkill,
          skillLevel: attackSkillLevel,
          attributes: progression.attributes,
        },
        equipStats,
      );

      return {
        playerId: signup.playerId,
        stats,
        template,
        actionDefinitions: { ...BASE_ACTION_DEFINITIONS },
        hp: signup.currentHp,
        maxHp: hpState.maxHp,
        stamina: signup.currentStamina,
        maxStamina: resources.maxStamina,
        staminaRegenPerRound: calculateStaminaRegenPerRound(
          resources.meleeLevel,
          resources.rangedLevel,
          resources.evasionLevel,
        ),
        mana: signup.currentMana,
        maxMana: resources.maxMana,
        manaRegenPerRound: calculateManaRegenPerRound(resources.magicLevel),
        templateRound: signup.templateRound,
        activeEffects: [],
      };
    }),
  );

  const mob = encounter.mobTemplate;
  const bossTemplate = BOSS_TEMPLATES[mob.name];
  const bossState: BossState = {
    hp: encounter.currentHp,
    maxHp: encounter.maxHp,
    stats: {
      hp: encounter.currentHp,
      maxHp: encounter.maxHp,
      attack: mob.accuracy,
      accuracy: mob.accuracy,
      defence: mob.defence,
      magicDefence: mob.magicDefence,
      dodge: mob.evasion,
      evasion: 0,
      damageMin: mob.damageMin,
      damageMax: mob.damageMax,
      speed: 0,
      damageType: mob.damageType === 'magic' ? 'magic' : 'physical',
    },
    template: bossTemplate?.actions ?? [{ actionId: 'boss_physical_attack', targetMode: 'single_target' as const }],
    actionDefinitions: bossTemplate?.actionDefinitions ?? BOSS_ACTION_DEFINITIONS,
    roundNumber: nextRound,
    activeEffects: parseBossEffects(encounter.bossEffects, 'encounter.bossEffects'),
  };

  const threatTable = initThreatTable(signups.map((signup) => signup.playerId));
  for (const signup of signups) {
    const entry = threatTable.find((candidate) => candidate.playerId === signup.playerId);
    if (entry) {
      entry.threat = signup.threat;
    }
  }

  const input: BossRoundInput = {
    boss: bossState,
    participants,
    threatTable,
  };
  const result = resolveBossRoundEngine(input);

  const totalPlayerDmg = result.participantResults.reduce((sum, row) => sum + row.damageDealt, 0);
  const playersAlive = result.participantResults.filter((row) => !row.isDead).length;
  const playersDead = result.participantResults.filter((row) => row.isDead).length;
  const roundSummary: BossRoundSummary = {
    round: nextRound,
    bossDamage: result.participantResults.reduce((sum, row) => sum + row.damageTaken, 0),
    totalPlayerDamage: totalPlayerDmg,
    bossHpPercent: encounter.maxHp > 0 ? Math.round((result.bossHpAfter / encounter.maxHp) * 100) : 0,
    playersAlive,
    playersDead,
  };
  const existingSummaries = parseBossRoundSummaries(encounter.roundSummaries, 'encounter.roundSummaries') ?? [];
  const newSummaries = [...existingSummaries, roundSummary];

  const nextNextRoundAt = new Date(Date.now() + WORLD_EVENT_CONSTANTS.BOSS_ROUND_INTERVAL_MINUTES * 60 * 1000);
  const shouldKeepScheduling = !result.bossDefeated && !result.allPlayersDead;

  let killedBy: string | null = null;
  if (result.bossDefeated) {
    const allParticipantsForKill = await prisma.bossParticipant.findMany({
      where: { encounterId },
      select: { playerId: true, totalDamage: true },
    });
    const cumulativeDamage = new Map<string, number>();
    for (const participant of allParticipantsForKill) {
      cumulativeDamage.set(
        participant.playerId,
        (cumulativeDamage.get(participant.playerId) ?? 0) + participant.totalDamage,
      );
    }
    for (const participantResult of result.participantResults) {
      if (participantResult.damageDealt > 0) {
        cumulativeDamage.set(
          participantResult.playerId,
          (cumulativeDamage.get(participantResult.playerId) ?? 0) + participantResult.damageDealt,
        );
      }
    }

    let topDamage = 0;
    for (const [playerId, damage] of cumulativeDamage) {
      if (damage > topDamage) {
        topDamage = damage;
        killedBy = playerId;
      }
    }
  }

  // Optimistic lock: only update if roundNumber hasn't changed since we read the encounter.
  const updated = await prisma.bossEncounter.updateMany({
    where: { id: encounterId, roundNumber: encounter.roundNumber, status: 'in_progress' },
    data: {
      currentHp: result.bossHpAfter,
      roundNumber: nextRound,
      nextRoundAt: shouldKeepScheduling ? nextNextRoundAt : null,
      status: result.bossDefeated ? 'defeated' : 'in_progress',
      killedBy,
      bossEffects: JSON.parse(JSON.stringify(result.bossActiveEffectsAfter)),
      roundSummaries: JSON.parse(JSON.stringify(newSummaries)),
    },
  });
  if (updated.count === 0) {
    return null;
  }

  if (result.bossDefeated) {
    roundTimerRegistry.cancel('bossEncounter', encounterId);
  } else if (!result.allPlayersDead) {
    roundTimerRegistry.schedule('bossEncounter', encounterId, nextNextRoundAt, getIo);
  }

  await Promise.all(
    result.participantResults.map((participantResult) =>
      prisma.bossParticipant.updateMany({
        where: { encounterId, playerId: participantResult.playerId, roundNumber: nextRound },
        data: {
          totalDamage: { increment: participantResult.damageDealt },
          totalHealing: { increment: participantResult.healingDone },
          attacks: {
            increment:
              participantResult.damageDealt > 0
                ? 1
                : participantResult.hit === false && participantResult.actionId !== 'defend'
                  ? 1
                  : 0,
          },
          hits: { increment: participantResult.hit ? 1 : 0 },
          crits: { increment: participantResult.isCritical ? 1 : 0 },
          currentHp: participantResult.hpAfter,
          currentStamina: participantResult.staminaAfter,
          currentMana: participantResult.manaAfter,
          threat: result.threatTableAfter.find((entry) => entry.playerId === participantResult.playerId)?.threat ?? 0,
          damageAbsorbed: { increment: participantResult.damageAbsorbed },
          templateRound: participantResult.templateRoundAfter,
          status: participantResult.isDead ? 'knocked_out' : 'alive',
        },
      }),
    ),
  );

  const uniquePlayerIds = [...new Set(result.participantResults.map((row) => row.playerId))];
  const memberships = await prisma.guildMember.findMany({
    where: { playerId: { in: uniquePlayerIds } },
    select: { guildId: true },
  });
  const guildIds = new Set(memberships.map((membership) => membership.guildId));
  for (const guildId of guildIds) {
    await addGuildXp(guildId, GUILD_CONSTANTS.XP_PER_BOSS_ROUND);
  }

  const alivePlayerIdsForReveal = result.participantResults
    .filter((participantResult) => !participantResult.isDead)
    .map((participantResult) => participantResult.playerId);
  if (alivePlayerIdsForReveal.length > 0) {
    await revealBossRotation(encounter.mobTemplate.id, alivePlayerIdsForReveal, nextRound);
  }

  if (!result.bossDefeated && !result.allPlayersDead) {
    const autoSignupParticipants = signups.filter((signup) => signup.autoSignUp);
    if (autoSignupParticipants.length > 0) {
      const turnCost = WORLD_EVENT_CONSTANTS.BOSS_SIGNUP_TURN_COST;
      const autoNextRound = nextRound + 1;
      const alivePlayerIds = new Set(
        result.participantResults.filter((row) => !row.isDead).map((row) => row.playerId),
      );
      const eligible = autoSignupParticipants.filter((participant) => alivePlayerIds.has(participant.playerId));

      if (eligible.length > 0) {
        await Promise.all(
          eligible.map(async (participant) => {
            const participantResult = result.participantResults.find((row) => row.playerId === participant.playerId);
            if (!participantResult) {
              return;
            }

            try {
              await prisma.$transaction(async (tx) => {
                await spendPlayerTurnsTx(tx, participant.playerId, turnCost);
                await tx.bossParticipant.create({
                  data: {
                    encounterId,
                    playerId: participant.playerId,
                    roundNumber: autoNextRound,
                    turnsCommitted: turnCost,
                    currentHp: participantResult.hpAfter,
                    currentStamina: participantResult.staminaAfter,
                    currentMana: participantResult.manaAfter,
                    threat: result.threatTableAfter.find((entry) => entry.playerId === participant.playerId)?.threat ?? 0,
                    templateRound: participantResult.templateRoundAfter,
                    status: 'alive',
                    autoSignUp: true,
                  },
                });
              });
            } catch (error) {
              if (error instanceof AppError && error.code === 'INSUFFICIENT_TURNS') {
                return;
              }

              logger.error({ err: error, playerId: participant.playerId }, 'Boss auto-signup failed unexpectedly');
            }
          }),
        );
      }
    }
  }

  if (result.allPlayersDead) {
    await Promise.all(
      participants.map(async (participant) => {
        const progression = await getPlayerProgressionState(participant.playerId);
        const fleeResult = await calculateFleeWithGold(participant.playerId, {
          evasionLevel: progression.attributes.evasion,
          mobLevel: encounter.mobTemplate.level ?? 1,
          maxHp: participant.maxHp,
        });
        if (fleeResult.outcome === 'knockout') {
          await enterRecoveringState(participant.playerId, participant.maxHp);
          await trackAchievements(participant.playerId, { totalDeaths: 1 });
        } else {
          await setHp(participant.playerId, fleeResult.remainingHp);
        }
      }),
    );

    await prisma.bossEncounter.update({
      where: { id: encounterId },
      data: {
        currentHp: result.bossHpAfter,
        nextRoundAt: new Date(Date.now() + WORLD_EVENT_CONSTANTS.BOSS_ROUND_INTERVAL_MINUTES * 60 * 1000),
        status: 'waiting',
        scaledAt: null,
      },
    });
    roundTimerRegistry.cancel('bossEncounter', encounterId);

    const zoneName = encounter.event.zone?.name ?? 'unknown';
    await emitSystemMessage(
      io,
      'world',
      'world',
      `The raid against ${encounter.mobTemplate.name} in ${zoneName} has been wiped!`,
    );
    if (encounter.event.zoneId) {
      await emitSystemMessage(
        io,
        'zone',
        `zone:${encounter.event.zoneId}`,
        `The raid against ${encounter.mobTemplate.name} has been wiped! The boss is weakened...`,
      );
    }

    return { bossDefeated: false, roundResult: result };
  }

  if (result.bossDefeated) {
    await prisma.worldEvent.updateMany({
      where: { id: encounter.eventId, status: 'active' },
      data: { status: 'completed' },
    });

    const allParticipants = await prisma.bossParticipant.findMany({
      where: { encounterId },
    });
    const contributorMap = new Map<
      string,
      {
        totalDamage: number;
        totalHealing: number;
        damageAbsorbed: number;
        roundsSurvived: number;
        attackSkill?: string;
      }
    >();
    for (const participant of allParticipants) {
      const existing = contributorMap.get(participant.playerId);
      if (existing) {
        existing.totalDamage += participant.totalDamage;
        existing.totalHealing += participant.totalHealing;
        existing.damageAbsorbed += participant.damageAbsorbed;
        existing.roundsSurvived += participant.status === 'alive' ? 1 : 0;
      } else {
        contributorMap.set(participant.playerId, {
          totalDamage: participant.totalDamage,
          totalHealing: participant.totalHealing,
          damageAbsorbed: participant.damageAbsorbed,
          roundsSurvived: participant.status === 'alive' ? 1 : 0,
        });
      }
    }

    await Promise.all(
      Array.from(contributorMap.keys()).map(async (playerId) => {
        const entry = contributorMap.get(playerId);
        if (entry && !entry.attackSkill) {
          const mainHandSkill = await getMainHandAttackSkill(playerId);
          entry.attackSkill = mainHandSkill ?? 'melee';
        }
      }),
    );

    const contributors = Array.from(contributorMap.entries()).map(([playerId, stats]) => ({
      playerId,
      totalDamage: stats.totalDamage,
      totalHealing: stats.totalHealing,
      damageAbsorbed: stats.damageAbsorbed,
      roundsSurvived: stats.roundsSurvived,
      attackSkill: stats.attackSkill,
    }));
    const rewardsByPlayer = await distributeBossLoot(
      encounter.mobTemplateId,
      encounter.mobTemplate.level ?? 1,
      contributors,
      zoneTier,
    );
    await prisma.bossEncounter.update({
      where: { id: encounterId },
      data: { rewardsByPlayer: JSON.parse(JSON.stringify(rewardsByPlayer)) },
    });

    const killerName = (await resolveUsername(killedBy)) ?? 'unknown';
    const zoneName = encounter.event.zone?.name ?? 'unknown';
    void broadcastBossDefeatActivity({
      zoneId: encounter.event.zoneId,
      zoneName,
      bossName: encounter.mobTemplate.name,
      killerName,
    }).catch((error: unknown) => {
      logger.error({ err: error, bossEncounterId: encounterId }, 'Boss defeat activity broadcast failed');
    });

    for (const playerId of contributorMap.keys()) {
      void sendPush(playerId, 'bossKilled', {
        title: 'Boss Defeated!',
        body: `${encounter.mobTemplate.name} has been slain!`,
        tag: 'boss-killed',
        data: { type: 'boss', encounterId },
      });
    }
  } else {
    const hpPercent = Math.round((result.bossHpAfter / encounter.maxHp) * 100);
    await emitSystemMessage(
      io,
      'zone',
      `zone:${encounter.event.zoneId}`,
      `Boss round ${nextRound}: ${totalPlayerDmg} damage dealt to ${encounter.mobTemplate.name} (${hpPercent}% HP remaining)`,
    );
  }

  logger.info({
    bossEncounterId: encounterId,
    round: nextRound,
    participantCount,
  }, 'Boss round resolved');

  return { bossDefeated: result.bossDefeated, roundResult: result };
}

export async function checkAndResolveDueBossRounds(io: SocketServer | null): Promise<void> {
  const now = new Date();
  const dueEncounters = await prisma.bossEncounter.findMany({
    where: {
      status: 'in_progress',
      nextRoundAt: { lte: now },
    },
    select: { id: true },
  });

  for (const encounter of dueEncounters) {
    await resolveBossRound(encounter.id, io);
  }
}
