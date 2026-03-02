import type { Server as SocketServer } from 'socket.io';
import { prisma } from '@adventure/database';
import {
  WORLD_EVENT_CONSTANTS,
  BASE_ACTION_DEFINITIONS,
  BOSS_TEMPLATES,
  type BossActiveEffect,
  type BossEncounterData,
  type BossEncounterStatus,
  type BossParticipantData,
  type BossParticipantStatus,
  type BossPlayerReward,
  type BossRoundSummary,
} from '@adventure/shared';
import {
  resolveBossRound as resolveBossRoundEngine,
  buildPlayerCombatStats,
  calculateFleeResult,
  calculateMaxStamina,
  calculateStaminaRegenPerRound,
  calculateMaxMana,
  calculateManaRegenPerRound,
  initThreatTable,
  type BossRoundParticipant,
  type BossState,
  type BossRoundInput,
  type BossRoundResult,
} from '@adventure/game-engine';
import { emitSystemMessage } from './systemMessageService';
import { spendPlayerTurnsTx } from './turnBankService';
import { getEquipmentStats } from './equipmentService';
import { getPlayerProgressionState } from './attributesService';
import { getMainHandAttackSkill, getSkillLevel } from './combatStatsService';
import { getHpState, setHp, enterRecoveringState } from './hpService';
import { getActiveTemplate } from './combatTemplateService';
import { trackAchievements } from '../utils/routeHelpers.js';
import { distributeBossLoot } from './bossLootService';

// --- Mappers ---

function toBossEncounterData(row: {
  id: string;
  eventId: string;
  mobTemplateId: string;
  currentHp: number;
  maxHp: number;
  baseHp: number;
  bossEffects?: unknown;
  roundNumber: number;
  nextRoundAt: Date | null;
  status: string;
  killedBy: string | null;
  roundSummaries?: unknown;
  rewardsByPlayer?: unknown;
}): BossEncounterData {
  let parsedSummaries: BossRoundSummary[] | null = null;
  if (Array.isArray(row.roundSummaries)) {
    parsedSummaries = row.roundSummaries as BossRoundSummary[];
  }
  const parsedRewards = (row.rewardsByPlayer && typeof row.rewardsByPlayer === 'object' && !Array.isArray(row.rewardsByPlayer))
    ? row.rewardsByPlayer as Record<string, BossPlayerReward>
    : null;
  return {
    id: row.id,
    eventId: row.eventId,
    mobTemplateId: row.mobTemplateId,
    currentHp: row.currentHp,
    maxHp: row.maxHp,
    baseHp: row.baseHp,
    bossEffects: Array.isArray(row.bossEffects) ? row.bossEffects as BossActiveEffect[] : [],
    roundNumber: row.roundNumber,
    nextRoundAt: row.nextRoundAt?.toISOString() ?? null,
    status: row.status as BossEncounterStatus,
    killedBy: row.killedBy,
    roundSummaries: parsedSummaries,
    rewardsByPlayer: parsedRewards,
  };
}

function toBossParticipantData(row: {
  id: string;
  encounterId: string;
  playerId: string;
  roundNumber: number;
  turnsCommitted: number;
  totalDamage: number;
  totalHealing: number;
  attacks: number;
  hits: number;
  crits: number;
  autoSignUp: boolean;
  currentHp: number;
  currentStamina: number;
  currentMana: number;
  threat: number;
  damageAbsorbed: number;
  templateRound: number;
  status: string;
}): BossParticipantData {
  return {
    id: row.id,
    encounterId: row.encounterId,
    playerId: row.playerId,
    roundNumber: row.roundNumber,
    turnsCommitted: row.turnsCommitted,
    totalDamage: row.totalDamage,
    totalHealing: row.totalHealing,
    attacks: row.attacks,
    hits: row.hits,
    crits: row.crits,
    autoSignUp: row.autoSignUp,
    currentHp: row.currentHp,
    currentStamina: row.currentStamina,
    currentMana: row.currentMana,
    threat: row.threat,
    damageAbsorbed: row.damageAbsorbed,
    templateRound: row.templateRound,
    status: row.status as BossParticipantStatus,
  };
}

// --- Public API ---

export async function createBossEncounter(
  eventId: string,
  mobTemplateId: string,
  baseHp: number,
): Promise<BossEncounterData> {
  const nextRoundAt = new Date(
    Date.now() + WORLD_EVENT_CONSTANTS.BOSS_INITIAL_WAIT_MINUTES * 60 * 1000,
  );

  const row = await prisma.bossEncounter.create({
    data: {
      eventId,
      mobTemplateId,
      currentHp: baseHp,
      maxHp: baseHp,
      baseHp,
      roundNumber: 0,
      nextRoundAt,
      status: 'waiting',
    },
  });

  return toBossEncounterData(row);
}

export async function signUpForBossRound(
  encounterId: string,
  playerId: string,
  playerMaxHp: number,
  maxStamina: number,
  maxMana: number,
  autoSignUp = false,
): Promise<BossParticipantData> {
  const turnCost = WORLD_EVENT_CONSTANTS.BOSS_SIGNUP_TURN_COST;

  const encounter = await prisma.bossEncounter.findUnique({
    where: { id: encounterId },
  });
  if (!encounter) throw new Error('Boss encounter not found');
  if (encounter.status === 'defeated' || encounter.status === 'expired') {
    throw new Error('Boss encounter is already over');
  }

  const nextRound = encounter.roundNumber + 1;

  // Check for existing signup this round
  const existing = await prisma.bossParticipant.findUnique({
    where: {
      encounterId_playerId_roundNumber: {
        encounterId,
        playerId,
        roundNumber: nextRound,
      },
    },
  });

  let row;
  if (existing) {
    // Update autoSignUp on existing signup — no additional turn cost
    row = await prisma.bossParticipant.update({
      where: { id: existing.id },
      data: { autoSignUp },
    });
  } else {
    row = await prisma.$transaction(async (tx) => {
      await spendPlayerTurnsTx(tx, playerId, turnCost);

      return tx.bossParticipant.create({
        data: {
          encounterId,
          playerId,
          roundNumber: nextRound,
          turnsCommitted: turnCost,
          currentHp: playerMaxHp,
          currentStamina: maxStamina,
          currentMana: maxMana,
          status: 'alive',
          autoSignUp,
        },
      });
    });
  }

  // If this is the first signup and encounter is waiting, start it
  if (encounter.status === 'waiting') {
    await prisma.bossEncounter.update({
      where: { id: encounterId },
      data: { status: 'in_progress' },
    });
  }

  return toBossParticipantData(row);
}

export async function getBossEncounterStatus(encounterId: string): Promise<{
  encounter: BossEncounterData;
  participants: BossParticipantData[];
} | null> {
  const encounter = await prisma.bossEncounter.findUnique({
    where: { id: encounterId },
  });
  if (!encounter) return null;

  const participants = await prisma.bossParticipant.findMany({
    where: { encounterId },
    orderBy: [{ roundNumber: 'asc' }, { totalDamage: 'desc' }],
  });

  return {
    encounter: toBossEncounterData(encounter),
    participants: participants.map(toBossParticipantData),
  };
}

export async function resolveBossRound(
  encounterId: string,
  io: SocketServer | null,
): Promise<{ bossDefeated: boolean; roundResult: BossRoundResult } | null> {
  const encounter = await prisma.bossEncounter.findUnique({
    where: { id: encounterId },
    include: {
      event: { select: { zoneId: true, title: true, zone: { select: { name: true, difficulty: true } } } },
      mobTemplate: { select: { id: true, name: true, level: true, defence: true, magicDefence: true, evasion: true, damageMin: true, damageMax: true, accuracy: true, hp: true, damageType: true, bossAoeDmg: true } },
    },
  });
  if (!encounter || encounter.status === 'defeated' || encounter.status === 'expired') {
    return null;
  }

  const nextRound = encounter.roundNumber + 1;
  const signups = await prisma.bossParticipant.findMany({
    where: { encounterId, roundNumber: nextRound },
  });

  if (signups.length === 0) return null;

  const zoneTier = encounter.event.zone?.difficulty ?? 1;
  const tierIndex = Math.max(0, Math.min(4, zoneTier - 1));
  const participantCount = signups.length;

  // Rescale boss HP every round based on current participants (% preserved)
  const scaledMaxHp = WORLD_EVENT_CONSTANTS.BOSS_HP_PER_PLAYER_BY_TIER[tierIndex]! * participantCount;
  const hpPercent = encounter.maxHp > 0 ? encounter.currentHp / encounter.maxHp : 1;
  const scaledCurrentHp = Math.round(scaledMaxHp * hpPercent);
  await prisma.bossEncounter.update({
    where: { id: encounterId },
    data: { maxHp: scaledMaxHp, currentHp: scaledCurrentHp, scaledAt: new Date() },
  });
  encounter.maxHp = scaledMaxHp;
  encounter.currentHp = scaledCurrentHp;

  // Build participant combatants with carried-forward resources
  const participants: BossRoundParticipant[] = await Promise.all(
    signups.map(async (signup) => {
      const [hpState, equipStats, progression, template] = await Promise.all([
        getHpState(signup.playerId),
        getEquipmentStats(signup.playerId),
        getPlayerProgressionState(signup.playerId),
        getActiveTemplate(signup.playerId),
      ]);

      const mainHandSkill = await getMainHandAttackSkill(signup.playerId);
      const attackSkill = mainHandSkill ?? 'melee';
      const attackSkillLevel = await getSkillLevel(signup.playerId, attackSkill);
      const [meleeLevel, rangedLevel, magicLevel] = await Promise.all([
        getSkillLevel(signup.playerId, 'melee'),
        getSkillLevel(signup.playerId, 'ranged'),
        getSkillLevel(signup.playerId, 'magic'),
      ]);
      const evasionLevel = progression.attributes.evasion;

      const stats = buildPlayerCombatStats(
        hpState.maxHp, hpState.maxHp,
        { attackStyle: attackSkill, skillLevel: attackSkillLevel, attributes: progression.attributes },
        equipStats,
      );

      const maxStamina = calculateMaxStamina({
        meleeLevel, rangedLevel, evasionLevel,
        equipmentStaminaBonus: 0,
      });
      const maxMana = calculateMaxMana({ magicLevel, equipmentManaBonus: 0 });

      return {
        playerId: signup.playerId,
        stats,
        template,
        actionDefinitions: { ...BASE_ACTION_DEFINITIONS },
        hp: signup.currentHp,
        maxHp: hpState.maxHp,
        stamina: signup.currentStamina,
        maxStamina,
        staminaRegenPerRound: calculateStaminaRegenPerRound(meleeLevel, rangedLevel, evasionLevel),
        mana: signup.currentMana,
        maxMana,
        manaRegenPerRound: calculateManaRegenPerRound(magicLevel),
        templateRound: signup.templateRound,
        activeEffects: [],
      };
    }),
  );

  // Build boss state from template
  const mob = encounter.mobTemplate;
  const bossTemplate = BOSS_TEMPLATES[mob.name];
  const bossStats = buildPlayerCombatStats(
    encounter.currentHp, encounter.maxHp,
    { attackStyle: 'melee', skillLevel: mob.level, attributes: { vitality: 0, strength: 0, dexterity: 0, intelligence: 0, luck: 0, evasion: 0 } },
    { attack: 0, rangedPower: 0, magicPower: 0, accuracy: 0, armor: 0, magicDefence: 0, health: 0, dodge: 0 },
  );
  // Override with mob's actual stats
  bossStats.defence = mob.defence;
  bossStats.magicDefence = mob.magicDefence;
  bossStats.dodge = mob.evasion;
  bossStats.accuracy = mob.accuracy;
  bossStats.damageMin = mob.damageMin;
  bossStats.damageMax = mob.damageMax;
  bossStats.damageType = (mob.damageType as 'physical' | 'magic') ?? 'physical';

  const bossState: BossState = {
    hp: encounter.currentHp,
    maxHp: encounter.maxHp,
    stats: bossStats,
    template: bossTemplate?.actions ?? [{ actionId: 'boss_physical_attack', targetMode: 'single_target' as const }],
    actionDefinitions: bossTemplate?.actionDefinitions ?? { boss_physical_attack: { id: 'boss_physical_attack', name: 'Attack', description: 'Physical boss attack', actionType: 'normal_attack', category: 'offensive', cost: { stamina: 0, mana: 0 }, damageMultiplier: 1.0, damageType: 'physical' } },
    roundNumber: nextRound,
    activeEffects: Array.isArray(encounter.bossEffects) ? encounter.bossEffects as unknown as BossActiveEffect[] : [],
  };

  // Build threat table from carried-forward threat values
  const threatTable = initThreatTable(signups.map(s => s.playerId));
  for (const signup of signups) {
    const entry = threatTable.find(e => e.playerId === signup.playerId);
    if (entry) entry.threat = signup.threat;
  }

  const input: BossRoundInput = {
    boss: bossState,
    participants,
    threatTable,
  };

  const result = resolveBossRoundEngine(input);

  // Compute round summary
  const totalPlayerDmg = result.participantResults.reduce((s, r) => s + r.damageDealt, 0);
  const playersAlive = result.participantResults.filter(r => !r.isDead).length;
  const playersDead = result.participantResults.filter(r => r.isDead).length;

  const roundSummary: BossRoundSummary = {
    round: nextRound,
    bossDamage: result.participantResults.reduce((s, r) => s + r.damageTaken, 0),
    totalPlayerDamage: totalPlayerDmg,
    bossHpPercent: encounter.maxHp > 0 ? Math.round((result.bossHpAfter / encounter.maxHp) * 100) : 0,
    playersAlive,
    playersDead,
  };
  const existingSummaries = (Array.isArray(encounter.roundSummaries)
    ? encounter.roundSummaries
    : []) as unknown as BossRoundSummary[];
  const newSummaries = [...existingSummaries, roundSummary];

  const nextNextRoundAt = new Date(Date.now() + WORLD_EVENT_CONSTANTS.BOSS_ROUND_INTERVAL_MINUTES * 60 * 1000);

  // Find top cumulative damage dealer for killedBy
  let killedBy: string | null = null;
  if (result.bossDefeated) {
    const allParticipantsForKill = await prisma.bossParticipant.findMany({
      where: { encounterId },
      select: { playerId: true, totalDamage: true },
    });
    const cumulativeDamage = new Map<string, number>();
    for (const p of allParticipantsForKill) {
      cumulativeDamage.set(p.playerId, (cumulativeDamage.get(p.playerId) ?? 0) + p.totalDamage);
    }
    for (const pr of result.participantResults) {
      if (pr.damageDealt > 0) {
        cumulativeDamage.set(pr.playerId, (cumulativeDamage.get(pr.playerId) ?? 0) + pr.damageDealt);
      }
    }
    let topDamage = 0;
    for (const [playerId, dmg] of cumulativeDamage) {
      if (dmg > topDamage) {
        topDamage = dmg;
        killedBy = playerId;
      }
    }
  }

  // Optimistic lock: only update if roundNumber hasn't changed
  const updated = await prisma.bossEncounter.updateMany({
    where: { id: encounterId, roundNumber: encounter.roundNumber },
    data: {
      currentHp: result.bossHpAfter,
      roundNumber: nextRound,
      nextRoundAt: nextNextRoundAt,
      status: result.bossDefeated ? 'defeated' : 'in_progress',
      killedBy,
      bossEffects: JSON.parse(JSON.stringify(result.bossActiveEffectsAfter)),
      roundSummaries: JSON.parse(JSON.stringify(newSummaries)),
    },
  });

  if (updated.count === 0) return null;

  // Persist per-participant results
  await Promise.all(
    result.participantResults.map((pr) =>
      prisma.bossParticipant.updateMany({
        where: { encounterId, playerId: pr.playerId, roundNumber: nextRound },
        data: {
          totalDamage: { increment: pr.damageDealt },
          totalHealing: { increment: pr.healingDone },
          attacks: { increment: pr.damageDealt > 0 ? 1 : (pr.hit === false && pr.actionId !== 'defend' ? 1 : 0) },
          hits: { increment: pr.hit ? 1 : 0 },
          crits: { increment: pr.isCritical ? 1 : 0 },
          currentHp: pr.hpAfter,
          currentStamina: pr.staminaAfter,
          currentMana: pr.manaAfter,
          threat: result.threatTableAfter.find(t => t.playerId === pr.playerId)?.threat ?? 0,
          damageAbsorbed: { increment: pr.damageAbsorbed },
          templateRound: pr.templateRoundAfter,
          status: pr.isDead ? 'knocked_out' : 'alive',
        },
      }),
    ),
  );

  // Progressive bestiary reveal: alive players learn the boss's action for this round
  const alivePlayerIdsForReveal = result.participantResults
    .filter(r => !r.isDead)
    .map(r => r.playerId);
  if (alivePlayerIdsForReveal.length > 0) {
    await revealBossRotation(encounter.mobTemplate.id, alivePlayerIdsForReveal, nextRound);
  }

  // Auto-signup: create next-round rows carrying forward resources (skip dead players)
  if (!result.bossDefeated && !result.allPlayersDead) {
    const autoSignupParticipants = signups.filter((s) => s.autoSignUp);
    if (autoSignupParticipants.length > 0) {
      const turnCost = WORLD_EVENT_CONSTANTS.BOSS_SIGNUP_TURN_COST;
      const autoNextRound = nextRound + 1;

      // Filter out dead players and recovering players
      const aliveResults = result.participantResults.filter(r => !r.isDead);
      const alivePlayerIds = new Set(aliveResults.map(r => r.playerId));

      const eligible = autoSignupParticipants.filter(s => alivePlayerIds.has(s.playerId));

      if (eligible.length > 0) {
        await Promise.all(
          eligible.map(async (participant) => {
            const pr = result.participantResults.find(r => r.playerId === participant.playerId);
            if (!pr) return;

            try {
              await prisma.$transaction(async (tx) => {
                await spendPlayerTurnsTx(tx, participant.playerId, turnCost);
                await tx.bossParticipant.create({
                  data: {
                    encounterId,
                    playerId: participant.playerId,
                    roundNumber: autoNextRound,
                    turnsCommitted: turnCost,
                    currentHp: pr.hpAfter,
                    currentStamina: pr.staminaAfter,
                    currentMana: pr.manaAfter,
                    threat: result.threatTableAfter.find(t => t.playerId === participant.playerId)?.threat ?? 0,
                    templateRound: pr.templateRoundAfter,
                    status: 'alive',
                    autoSignUp: true,
                  },
                });
              });
            } catch {
              // Skip players who can't auto-signup (insufficient turns, etc.)
            }
          }),
        );
      }
    }
  }

  // Handle raid wipe
  if (result.allPlayersDead) {
    await Promise.all(
      participants.map(async (p) => {
        const progression = await getPlayerProgressionState(p.playerId);
        const fleeResult = calculateFleeResult({
          evasionLevel: progression.attributes.evasion,
          mobLevel: encounter.mobTemplate.level ?? 1,
          maxHp: p.maxHp,
          currentGold: 0,
        });
        if (fleeResult.outcome === 'knockout') {
          await enterRecoveringState(p.playerId, p.maxHp);
          await trackAchievements(p.playerId, { totalDeaths: 1 });
        } else {
          await setHp(p.playerId, fleeResult.remainingHp);
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

    const zoneName = encounter.event.zone?.name ?? 'unknown';
    await emitSystemMessage(io, 'world', 'world', `The raid against ${encounter.mobTemplate.name} in ${zoneName} has been wiped!`);
    if (encounter.event.zoneId) {
      await emitSystemMessage(io, 'zone', `zone:${encounter.event.zoneId}`, `The raid against ${encounter.mobTemplate.name} has been wiped! The boss is weakened...`);
    }

    return { bossDefeated: false, roundResult: result };
  }

  // Boss defeated — distribute loot
  if (result.bossDefeated) {
    await prisma.worldEvent.updateMany({
      where: { id: encounter.eventId, status: 'active' },
      data: { status: 'completed' },
    });

    const allParticipants = await prisma.bossParticipant.findMany({
      where: { encounterId },
    });
    const contributorMap = new Map<string, { totalDamage: number; totalHealing: number; damageAbsorbed: number; roundsSurvived: number; attackSkill?: string }>();
    for (const p of allParticipants) {
      const existing = contributorMap.get(p.playerId);
      if (existing) {
        existing.totalDamage += p.totalDamage;
        existing.totalHealing += p.totalHealing;
        existing.damageAbsorbed += p.damageAbsorbed;
        existing.roundsSurvived += p.status === 'alive' ? 1 : 0;
      } else {
        contributorMap.set(p.playerId, {
          totalDamage: p.totalDamage,
          totalHealing: p.totalHealing,
          damageAbsorbed: p.damageAbsorbed,
          roundsSurvived: p.status === 'alive' ? 1 : 0,
        });
      }
    }
    // Resolve attack skill for each contributor
    await Promise.all(
      Array.from(contributorMap.keys()).map(async (playerId) => {
        const entry = contributorMap.get(playerId)!;
        if (!entry.attackSkill) {
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
    const rewardsByPlayer = await distributeBossLoot(encounter.mobTemplateId, encounter.mobTemplate.level ?? 1, contributors, zoneTier);
    await prisma.bossEncounter.update({
      where: { id: encounterId },
      data: { rewardsByPlayer: JSON.parse(JSON.stringify(rewardsByPlayer)) },
    });

    let killerName = 'unknown';
    if (killedBy) {
      const killer = await prisma.player.findUnique({
        where: { id: killedBy },
        select: { username: true },
      });
      if (killer) killerName = killer.username;
    }
    const zoneName = encounter.event.zone?.name ?? 'unknown';
    await emitSystemMessage(
      io, 'world', 'world',
      `${encounter.mobTemplate.name} in ${zoneName} has been slain! ${killerName} dealt the final blow.`,
    );
    if (encounter.event.zoneId) {
      await emitSystemMessage(
        io, 'zone', `zone:${encounter.event.zoneId}`,
        `${encounter.mobTemplate.name} has been slain! ${killerName} dealt the final blow.`,
      );
    }
  } else {
    const hpPercent = Math.round((result.bossHpAfter / encounter.maxHp) * 100);
    await emitSystemMessage(
      io, 'zone', `zone:${encounter.event.zoneId}`,
      `Boss round ${nextRound}: ${totalPlayerDmg} damage dealt to ${encounter.mobTemplate.name} (${hpPercent}% HP remaining)`,
    );
  }

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

  for (const enc of dueEncounters) {
    await resolveBossRound(enc.id, io);
  }
}

export async function getActiveBossEncounters(): Promise<BossEncounterData[]> {
  const rows = await prisma.bossEncounter.findMany({
    where: {
      OR: [
        { status: { in: ['waiting', 'in_progress'] } },
        { status: 'defeated', nextRoundAt: { gt: new Date() } },
      ],
    },
    orderBy: { nextRoundAt: 'asc' },
  });
  return rows.map(toBossEncounterData);
}

async function revealBossRotation(
  mobTemplateId: string,
  alivePlayerIds: string[],
  roundNumber: number,
): Promise<void> {
  await Promise.all(
    alivePlayerIds.map(playerId =>
      prisma.$queryRaw`
        INSERT INTO player_boss_rotations (player_id, mob_template_id, rounds_revealed)
        VALUES (${playerId}, ${mobTemplateId}, ${roundNumber})
        ON CONFLICT (player_id, mob_template_id)
        DO UPDATE SET rounds_revealed = GREATEST(player_boss_rotations.rounds_revealed, ${roundNumber})
      `,
    ),
  );
}

export async function getBossHistory(
  playerId: string,
  page: number,
  pageSize: number,
): Promise<{
  entries: Array<{
    encounter: BossEncounterData;
    mobName: string;
    mobLevel: number;
    zoneName: string;
    killedByUsername: string | null;
    playerStats: { totalDamage: number; totalHealing: number; attacks: number; hits: number; crits: number; roundsParticipated: number };
  }>;
  total: number;
}> {
  const distinctEncounters = await prisma.bossParticipant.findMany({
    where: { playerId },
    select: { encounterId: true },
    distinct: ['encounterId'],
    orderBy: { encounterId: 'desc' },
  });
  const total = distinctEncounters.length;

  const paginatedIds = distinctEncounters
    .slice((page - 1) * pageSize, page * pageSize)
    .map((p) => p.encounterId);

  if (paginatedIds.length === 0) return { entries: [], total };

  const encounters = await prisma.bossEncounter.findMany({
    where: { id: { in: paginatedIds } },
    include: {
      event: { select: { zone: { select: { name: true } } } },
      mobTemplate: { select: { name: true, level: true } },
    },
  });
  const idOrder = new Map(paginatedIds.map((id, i) => [id, i]));
  encounters.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

  const participations = await prisma.bossParticipant.findMany({
    where: { playerId, encounterId: { in: paginatedIds } },
  });

  const statsMap = new Map<string, { totalDamage: number; totalHealing: number; attacks: number; hits: number; crits: number; roundsParticipated: number }>();
  for (const p of participations) {
    const existing = statsMap.get(p.encounterId);
    if (existing) {
      existing.totalDamage += p.totalDamage;
      existing.totalHealing += p.totalHealing;
      existing.attacks += p.attacks;
      existing.hits += p.hits;
      existing.crits += p.crits;
      existing.roundsParticipated += 1;
    } else {
      statsMap.set(p.encounterId, {
        totalDamage: p.totalDamage,
        totalHealing: p.totalHealing,
        attacks: p.attacks,
        hits: p.hits,
        crits: p.crits,
        roundsParticipated: 1,
      });
    }
  }

  const killedByIds = encounters.map((e) => e.killedBy).filter((id): id is string => id !== null);
  const killedByPlayers = killedByIds.length > 0
    ? await prisma.player.findMany({ where: { id: { in: killedByIds } }, select: { id: true, username: true } })
    : [];
  const killedByMap = new Map(killedByPlayers.map((p) => [p.id, p.username]));

  const entries = encounters.map((enc) => ({
    encounter: toBossEncounterData(enc),
    mobName: enc.mobTemplate.name,
    mobLevel: enc.mobTemplate.level ?? 1,
    zoneName: enc.event.zone?.name ?? 'Unknown',
    killedByUsername: enc.killedBy ? (killedByMap.get(enc.killedBy) ?? null) : null,
    playerStats: statsMap.get(enc.id) ?? { totalDamage: 0, totalHealing: 0, attacks: 0, hits: 0, crits: 0, roundsParticipated: 0 },
  }));

  return { entries, total };
}
