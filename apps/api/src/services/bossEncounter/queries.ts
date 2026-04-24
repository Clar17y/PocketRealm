import { prisma } from '@pocketrealm/database';
import { type BossEncounterData, type BossParticipantData } from '@pocketrealm/shared';
import { toBossEncounterData, toBossParticipantData } from './shared';

export async function getBossEncounterStatus(encounterId: string): Promise<{
  encounter: BossEncounterData;
  participants: BossParticipantData[];
} | null> {
  const encounter = await prisma.bossEncounter.findUnique({
    where: { id: encounterId },
  });
  if (!encounter) {
    return null;
  }

  const participants = await prisma.bossParticipant.findMany({
    where: { encounterId },
    orderBy: [{ roundNumber: 'asc' }, { totalDamage: 'desc' }],
  });

  return {
    encounter: toBossEncounterData(encounter),
    participants: participants.map(toBossParticipantData),
  };
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
    playerStats: {
      totalDamage: number;
      totalHealing: number;
      attacks: number;
      hits: number;
      crits: number;
      roundsParticipated: number;
    };
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
    .map((participation) => participation.encounterId);

  if (paginatedIds.length === 0) {
    return { entries: [], total };
  }

  const encounters = await prisma.bossEncounter.findMany({
    where: { id: { in: paginatedIds } },
    include: {
      event: { select: { zone: { select: { name: true } } } },
      mobTemplate: { select: { name: true, level: true } },
    },
  });
  const idOrder = new Map(paginatedIds.map((id, index) => [id, index]));
  encounters.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

  const participations = await prisma.bossParticipant.findMany({
    where: { playerId, encounterId: { in: paginatedIds } },
  });

  const statsMap = new Map<string, {
    totalDamage: number;
    totalHealing: number;
    attacks: number;
    hits: number;
    crits: number;
    roundsParticipated: number;
  }>();
  for (const participation of participations) {
    const existing = statsMap.get(participation.encounterId);
    if (existing) {
      existing.totalDamage += participation.totalDamage;
      existing.totalHealing += participation.totalHealing;
      existing.attacks += participation.attacks;
      existing.hits += participation.hits;
      existing.crits += participation.crits;
      existing.roundsParticipated += 1;
      continue;
    }

    statsMap.set(participation.encounterId, {
      totalDamage: participation.totalDamage,
      totalHealing: participation.totalHealing,
      attacks: participation.attacks,
      hits: participation.hits,
      crits: participation.crits,
      roundsParticipated: 1,
    });
  }

  const killedByIds = encounters
    .map((encounter) => encounter.killedBy)
    .filter((id): id is string => id !== null);
  const killedByPlayers = killedByIds.length > 0
    ? await prisma.player.findMany({
      where: { id: { in: killedByIds } },
      select: { id: true, username: true },
    })
    : [];
  const killedByMap = new Map(killedByPlayers.map((player) => [player.id, player.username]));

  const entries = encounters.map((encounter) => ({
    encounter: toBossEncounterData(encounter),
    mobName: encounter.mobTemplate.name,
    mobLevel: encounter.mobTemplate.level ?? 1,
    zoneName: encounter.event.zone?.name ?? 'Unknown',
    killedByUsername: encounter.killedBy ? (killedByMap.get(encounter.killedBy) ?? null) : null,
    playerStats: statsMap.get(encounter.id) ?? {
      totalDamage: 0,
      totalHealing: 0,
      attacks: 0,
      hits: 0,
      crits: 0,
      roundsParticipated: 0,
    },
  }));

  return { entries, total };
}
