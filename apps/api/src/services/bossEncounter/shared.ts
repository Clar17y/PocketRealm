import { prisma } from '@pocketrealm/database';
import {
  calculateMaxMana,
  calculateMaxStamina,
} from '@pocketrealm/game-engine';
import {
  type BossEncounterData,
  type BossEncounterStatus,
  type BossParticipantData,
  type BossParticipantStatus,
} from '@pocketrealm/shared';
import { getPlayerProgressionState } from '../attributesService';
import { getSkillLevel } from '../combatStatsService';
import { parseBossEffects, parseBossRoundSummaries, parseBossRewardsByPlayer } from '../../utils/bossJsonSchemas';
import { validateEnum } from '../../utils/validateEnum';

const VALID_ENCOUNTER_STATUSES = new Set<BossEncounterStatus>(['waiting', 'in_progress', 'defeated', 'expired']);
const VALID_PARTICIPANT_STATUSES = new Set<BossParticipantStatus>(['alive', 'knocked_out']);

export type DueBossEncounterRef = {
  id: string;
  status: string;
  nextRoundAt: Date | null;
};

export function toBossEncounterData(row: {
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
  return {
    id: row.id,
    eventId: row.eventId,
    mobTemplateId: row.mobTemplateId,
    currentHp: row.currentHp,
    maxHp: row.maxHp,
    baseHp: row.baseHp,
    bossEffects: parseBossEffects(row.bossEffects, 'bossEffects'),
    roundNumber: row.roundNumber,
    nextRoundAt: row.nextRoundAt?.toISOString() ?? null,
    status: validateEnum(row.status, VALID_ENCOUNTER_STATUSES, 'waiting'),
    killedBy: row.killedBy,
    roundSummaries: parseBossRoundSummaries(row.roundSummaries, 'roundSummaries'),
    rewardsByPlayer: parseBossRewardsByPlayer(row.rewardsByPlayer, 'rewardsByPlayer'),
  };
}

export function toBossParticipantData(row: {
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
    status: validateEnum(row.status, VALID_PARTICIPANT_STATUSES, 'alive'),
  };
}

export async function computeResourcePools(playerId: string): Promise<{
  maxStamina: number;
  maxMana: number;
  meleeLevel: number;
  rangedLevel: number;
  magicLevel: number;
  evasionLevel: number;
}> {
  const [meleeLevel, rangedLevel, magicLevel, progression] = await Promise.all([
    getSkillLevel(playerId, 'melee'),
    getSkillLevel(playerId, 'ranged'),
    getSkillLevel(playerId, 'magic'),
    getPlayerProgressionState(playerId),
  ]);

  const evasionLevel = progression.attributes.evasion;
  return {
    maxStamina: calculateMaxStamina({
      meleeLevel,
      rangedLevel,
      evasionLevel,
      equipmentStaminaBonus: 0,
    }),
    maxMana: calculateMaxMana({
      magicLevel,
      equipmentManaBonus: 0,
    }),
    meleeLevel,
    rangedLevel,
    magicLevel,
    evasionLevel,
  };
}

export function isBossEncounterDue(
  encounter: DueBossEncounterRef | null,
): encounter is DueBossEncounterRef {
  return Boolean(
    encounter
    && encounter.status === 'in_progress'
    && encounter.nextRoundAt
    && encounter.nextRoundAt.getTime() <= Date.now(),
  );
}

export async function resolveUsername(playerId: string | null): Promise<string | null> {
  if (!playerId) {
    return null;
  }

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { username: true },
  });
  return player?.username ?? null;
}
