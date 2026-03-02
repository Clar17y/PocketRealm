import type { Server as SocketServer } from 'socket.io';
import { prisma } from '@adventure/database';
import {
  WORLD_EVENT_CONSTANTS,
  type BossEncounterData,
  type BossEncounterStatus,
  type BossParticipantData,
  type BossParticipantStatus,
  type BossPlayerReward,
  type BossRoundSummary,
} from '@adventure/shared';
import {
  resolveBossRoundLogic,
  buildPlayerCombatStats,
  calculateFleeResult,
  type BossRoundAttacker,
  type BossRoundHealer,
  type BossRoundResult,
  type BossStats,
} from '@adventure/game-engine';
import { emitSystemMessage } from './systemMessageService';
import { spendPlayerTurnsTx } from './turnBankService';
import { getEquipmentStats } from './equipmentService';
import { getPlayerProgressionState } from './attributesService';
import { getMainHandAttackSkill, getSkillLevel } from './combatStatsService';
import { getHpState, setHp, enterRecoveringState } from './hpService';
import { trackAchievements } from '../utils/routeHelpers.js';
import { distributeBossLoot } from './bossLootService';

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
    bossEffects: Array.isArray(row.bossEffects) ? row.bossEffects as unknown[] : [],
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
  role: BossParticipantRole,
  playerMaxHp: number,
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
    // Update role/autoSignUp on existing signup — no additional turn cost
    row = await prisma.bossParticipant.update({
      where: { id: existing.id },
      data: { role, autoSignUp },
    });
  } else {
    row = await prisma.$transaction(async (tx) => {
      await spendPlayerTurnsTx(tx, playerId, turnCost);

      return tx.bossParticipant.create({
        data: {
          encounterId,
          playerId,
          role,
          roundNumber: nextRound,
          turnsCommitted: turnCost,
          currentHp: playerMaxHp,
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
      mobTemplate: { select: { name: true, level: true, defence: true, magicDefence: true, evasion: true, bossAoeDmg: true } },
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

  // Build attacker/healer lists with real stats and compute raid pool
  const attackers: BossRoundAttacker[] = [];
  const healers: BossRoundHealer[] = [];

  // M3: batch all participant stat lookups in parallel
  const participantData = await Promise.all(
    signups.map(async (signup) => {
      const [hpState, equipStats, progression] = await Promise.all([
        getHpState(signup.playerId),
        getEquipmentStats(signup.playerId),
        getPlayerProgressionState(signup.playerId),
      ]);

      if (signup.role === 'attacker') {
        const mainHandSkill = await getMainHandAttackSkill(signup.playerId);
        const attackSkill = mainHandSkill ?? 'melee';
        const attackSkillLevel = await getSkillLevel(signup.playerId, attackSkill);
        return { signup, hpState, equipStats, progression, role: 'attacker' as const, attackSkill, attackSkillLevel };
      } else {
        const magicLevel = await getSkillLevel(signup.playerId, 'magic');
        return { signup, hpState, equipStats, progression, role: 'healer' as const, magicLevel };
      }
    }),
  );

  let raidPoolMax = 0;
  let totalDefence = 0;

  for (const pd of participantData) {
    raidPoolMax += pd.hpState.maxHp;
    totalDefence += pd.equipStats.armor;

    if (pd.role === 'attacker') {
      const stats = buildPlayerCombatStats(
        pd.hpState.maxHp, pd.hpState.maxHp,
        { attackStyle: pd.attackSkill, skillLevel: pd.attackSkillLevel, attributes: pd.progression.attributes },
        pd.equipStats,
      );
      const turnMultiplier = 1 + pd.signup.turnsCommitted * WORLD_EVENT_CONSTANTS.ATTACKER_TURN_SCALING;
      stats.damageMin = Math.round(stats.damageMin * turnMultiplier);
      stats.damageMax = Math.round(stats.damageMax * turnMultiplier);
      attackers.push({ playerId: pd.signup.playerId, stats });
    } else {
      const healAmount = Math.floor(
        pd.signup.turnsCommitted * (1 + pd.magicLevel * WORLD_EVENT_CONSTANTS.HEALER_MAGIC_SCALING),
      );
      healers.push({ playerId: pd.signup.playerId, healAmount });
    }
  }

  const avgDefence = signups.length > 0 ? totalDefence / signups.length : 0;

  // M2: use mob-specific stats with tier constants as fallback
  const tierDefence = WORLD_EVENT_CONSTANTS.BOSS_DEFENCE_BY_TIER[tierIndex]!;
  const mobAoe = encounter.mobTemplate.bossAoeDmg ?? WORLD_EVENT_CONSTANTS.BOSS_AOE_PER_PLAYER_BY_TIER[tierIndex]!;
  const bossStats: BossStats = {
    defence: encounter.mobTemplate.defence ?? tierDefence,
    magicDefence: encounter.mobTemplate.magicDefence ?? Math.round(tierDefence * 0.7),
    dodge: encounter.mobTemplate.evasion ?? Math.round(zoneTier * 3),
    aoeDamage: mobAoe * participantCount,
    avgParticipantDefence: avgDefence,
  };

  // Compute raid pool HP: new joiners add full HP, existing damage preserved as absolute
  let currentRaidPool: number;
  if (encounter.raidPoolHp !== null && encounter.raidPoolMax !== null && encounter.raidPoolMax > 0) {
    const damageTaken = encounter.raidPoolMax - encounter.raidPoolHp;
    currentRaidPool = Math.max(0, raidPoolMax - damageTaken);
  } else {
    currentRaidPool = raidPoolMax;
  }

  const result = resolveBossRoundLogic({
    bossHp: encounter.currentHp,
    bossMaxHp: encounter.maxHp,
    boss: bossStats,
    attackers,
    healers,
    raidPool: currentRaidPool,
    raidPoolMax,
  });

  // Compute round summary
  const totalPlayerDmg = result.attackerResults.reduce((s, a) => s + a.damage, 0);
  const roundSummary: BossRoundSummary = {
    round: nextRound,
    bossDamage: result.poolDamageTaken,
    totalPlayerDamage: totalPlayerDmg,
    bossHpPercent: encounter.maxHp > 0 ? Math.round((result.bossHpAfter / encounter.maxHp) * 100) : 0,
    raidPoolPercent: raidPoolMax > 0 ? Math.round((result.raidPoolAfter / raidPoolMax) * 100) : 100,
  };
  const existingSummaries = (Array.isArray(encounter.roundSummaries)
    ? encounter.roundSummaries
    : []) as unknown as BossRoundSummary[];
  const newSummaries = [...existingSummaries, roundSummary];

  // Defeated boss lingers for one interval so players can see the result
  const nextNextRoundAt = new Date(Date.now() + WORLD_EVENT_CONSTANTS.BOSS_ROUND_INTERVAL_MINUTES * 60 * 1000);

  // M6: find top cumulative damage dealer across all rounds for killedBy
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
    // Also add this round's damage (not yet persisted to DB)
    for (const ar of result.attackerResults) {
      if (ar.damage > 0) {
        cumulativeDamage.set(ar.playerId, (cumulativeDamage.get(ar.playerId) ?? 0) + ar.damage);
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

  // Optimistic lock: only update if roundNumber hasn't changed (C2 concurrency fix)
  const updated = await prisma.bossEncounter.updateMany({
    where: { id: encounterId, roundNumber: encounter.roundNumber },
    data: {
      currentHp: result.bossHpAfter,
      roundNumber: nextRound,
      nextRoundAt: nextNextRoundAt,
      status: result.bossDefeated ? 'defeated' : 'in_progress',
      killedBy,
      raidPoolHp: result.raidPoolAfter,
      raidPoolMax: raidPoolMax,
      roundSummaries: JSON.parse(JSON.stringify(newSummaries)),
    },
  });

  // Another process already resolved this round — bail out
  if (updated.count === 0) return null;

  // M3: batch participant damage/healing/stats updates in parallel
  await Promise.all([
    ...result.attackerResults.map((ar) =>
      prisma.bossParticipant.updateMany({
        where: { encounterId, playerId: ar.playerId, roundNumber: nextRound },
        data: {
          totalDamage: { increment: ar.damage },
          attacks: { increment: 1 },
          hits: { increment: ar.hit ? 1 : 0 },
          crits: { increment: ar.isCritical ? 1 : 0 },
        },
      }),
    ),
    ...result.healerResults
      .filter((hr) => hr.healAmount > 0)
      .map((hr) =>
        prisma.bossParticipant.updateMany({
          where: { encounterId, playerId: hr.playerId, roundNumber: nextRound },
          data: { totalHealing: { increment: hr.healAmount } },
        }),
      ),
  ]);

  // Auto-signup: re-enroll auto-signup participants for the next round (batched)
  if (!result.bossDefeated && !result.raidWiped) {
    const autoSignupParticipants = signups.filter((s) => s.autoSignUp);
    if (autoSignupParticipants.length > 0) {
      const turnCost = WORLD_EVENT_CONSTANTS.BOSS_SIGNUP_TURN_COST;
      const autoNextRound = nextRound + 1;

      // Check HP states in parallel to filter out recovering players
      const hpChecks = await Promise.all(
        autoSignupParticipants.map(async (p) => {
          const hpState = await getHpState(p.playerId);
          return { participant: p, hpState };
        }),
      );
      const eligible = hpChecks.filter((c) => !c.hpState.isRecovering);

      // Each player gets its own transaction so one failure doesn't affect others
      if (eligible.length > 0) {
        await Promise.all(
          eligible.map(async ({ participant, hpState }) => {
            try {
              await prisma.$transaction(async (tx) => {
                await spendPlayerTurnsTx(tx, participant.playerId, turnCost);
                await tx.bossParticipant.create({
                  data: {
                    encounterId,
                    playerId: participant.playerId,
                    role: participant.role,
                    roundNumber: autoNextRound,
                    turnsCommitted: turnCost,
                    currentHp: hpState.maxHp,
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
  if (result.raidWiped) {
    // M3: batch flee rolls in parallel (reuse participantData from above)
    await Promise.all(
      participantData.map(async (pd) => {
        const fleeResult = calculateFleeResult({
          evasionLevel: pd.progression.attributes.evasion,
          mobLevel: encounter.mobTemplate.level ?? 1,
          maxHp: pd.hpState.maxHp,
          currentGold: 0,
        });
        if (fleeResult.outcome === 'knockout') {
          await enterRecoveringState(pd.signup.playerId, pd.hpState.maxHp);
          await trackAchievements(pd.signup.playerId, { totalDeaths: 1 });
        } else {
          await setHp(pd.signup.playerId, fleeResult.remainingHp);
        }
      }),
    );

    // Persist boss HP and reset scaling for next attempt (don't reset roundNumber — C1 fix)
    await prisma.bossEncounter.update({
      where: { id: encounterId },
      data: {
        currentHp: result.bossHpAfter,
        nextRoundAt: new Date(Date.now() + WORLD_EVENT_CONSTANTS.BOSS_ROUND_INTERVAL_MINUTES * 60 * 1000),
        status: 'waiting',
        scaledAt: null,
        raidPoolHp: null,
        raidPoolMax: null,
      },
    });

    const zoneName = encounter.event.zone?.name ?? 'unknown';
    await emitSystemMessage(io, 'world', 'world', `The raid against ${encounter.mobTemplate.name} in ${zoneName} has been wiped!`);
    if (encounter.event.zoneId) {
      await emitSystemMessage(io, 'zone', `zone:${encounter.event.zoneId}`, `The raid against ${encounter.mobTemplate.name} has been wiped! The boss is weakened...`);
    }

    return { bossDefeated: false, roundResult: result };
  }

  // Complete event if boss defeated
  if (result.bossDefeated) {
    await prisma.worldEvent.updateMany({
      where: { id: encounter.eventId, status: 'active' },
      data: { status: 'completed' },
    });

    // Distribute loot to all contributors across all rounds
    const allParticipants = await prisma.bossParticipant.findMany({
      where: { encounterId },
    });
    const contributorMap = new Map<string, { totalDamage: number; totalHealing: number; attackSkill?: string }>();
    for (const p of allParticipants) {
      const existing = contributorMap.get(p.playerId);
      if (existing) {
        existing.totalDamage += p.totalDamage;
        existing.totalHealing += p.totalHealing;
      } else {
        contributorMap.set(p.playerId, { totalDamage: p.totalDamage, totalHealing: p.totalHealing });
      }
    }
    // Resolve attack skill for each contributor from current round's participantData
    for (const pd of participantData) {
      const entry = contributorMap.get(pd.signup.playerId);
      if (entry && pd.role === 'attacker' && !entry.attackSkill) {
        entry.attackSkill = pd.attackSkill;
      }
    }
    const contributors = Array.from(contributorMap.entries()).map(([playerId, stats]) => ({
      playerId,
      totalDamage: stats.totalDamage,
      totalHealing: stats.totalHealing,
      attackSkill: stats.attackSkill,
    }));
    const rewardsByPlayer = await distributeBossLoot(encounter.mobTemplateId, encounter.mobTemplate.level ?? 1, contributors, zoneTier);
    await prisma.bossEncounter.update({
      where: { id: encounterId },
      data: { rewardsByPlayer: JSON.parse(JSON.stringify(rewardsByPlayer)) },
    });

    // Announce boss kill in world chat and zone chat with killer name
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
      io,
      'world',
      'world',
      `${encounter.mobTemplate.name} in ${zoneName} has been slain! ${killerName} dealt the final blow.`,
    );
    if (encounter.event.zoneId) {
      await emitSystemMessage(
        io,
        'zone',
        `zone:${encounter.event.zoneId}`,
        `${encounter.mobTemplate.name} has been slain! ${killerName} dealt the final blow.`,
      );
    }
  } else {
    const totalDmg = result.attackerResults.reduce((s, a) => s + a.damage, 0);
    const hpPercent = Math.round((result.bossHpAfter / encounter.maxHp) * 100);
    await emitSystemMessage(
      io,
      'zone',
      `zone:${encounter.event.zoneId}`,
      `Boss round ${nextRound}: ${totalDmg} damage dealt to ${encounter.mobTemplate.name} (${hpPercent}% HP remaining)`,
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
  // Count distinct encounters at DB level
  const distinctEncounters = await prisma.bossParticipant.findMany({
    where: { playerId },
    select: { encounterId: true },
    distinct: ['encounterId'],
    orderBy: { encounterId: 'desc' },
  });
  const total = distinctEncounters.length;

  // Paginate at DB level using skip/take on the encounter IDs
  const paginatedIds = distinctEncounters
    .slice((page - 1) * pageSize, page * pageSize)
    .map((p) => p.encounterId);

  if (paginatedIds.length === 0) return { entries: [], total };

  // Fetch encounters with relations, ordered newest first
  const encounters = await prisma.bossEncounter.findMany({
    where: { id: { in: paginatedIds } },
    include: {
      event: { select: { zone: { select: { name: true } } } },
      mobTemplate: { select: { name: true, level: true } },
    },
  });
  // Sort by the paginated order (newest first, matching distinctEncounters order)
  const idOrder = new Map(paginatedIds.map((id, i) => [id, i]));
  encounters.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

  // Fetch player's participation rows for these encounters
  const participations = await prisma.bossParticipant.findMany({
    where: { playerId, encounterId: { in: paginatedIds } },
  });

  // Aggregate per encounter
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

  // Resolve killedBy usernames
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
