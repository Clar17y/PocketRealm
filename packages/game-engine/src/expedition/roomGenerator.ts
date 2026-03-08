import type {
  ExpeditionRoomDefinition,
  ExpeditionRoomType,
  ExpeditionMobState,
  CombatantStats,
} from '@pocketrealm/shared';
import type { BossTemplateAction } from '@pocketrealm/shared';
import {
  EXPEDITION_ROOM_COMPOSITIONS,
  EXPEDITION_CONSTANTS,
  TRASH_MOB_TEMPLATE,
  ELITE_MOB_TEMPLATE,
  MINI_BOSS_TEMPLATE,
  MINI_BOSS_ADD_TEMPLATE,
  FINAL_BOSS_PHASE1_TEMPLATE,
  FINAL_BOSS_PHASE2_TEMPLATE,
  FINAL_BOSS_PHASE3_TEMPLATE,
} from '@pocketrealm/shared';

export interface MobPoolEntry {
  mobTemplateId: string;
  name: string;
  level: number;
  hp: number;
  stats: CombatantStats;
}

const HP_SCALE_BY_TIER = [1, 1.5, 2] as const;
const MAX_TIER_INDEX = HP_SCALE_BY_TIER.length - 1;

/** Fisher-Yates shuffle (in-place, returns same array). */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Interpolate mob count between [min, max] based on tier position (0 = min, maxTier = max). */
function mobCountForTier(range: readonly [number, number], tier: number): number {
  const [min, max] = range;
  if (min === max) return min;
  const t = Math.min(tier, MAX_TIER_INDEX) / MAX_TIER_INDEX;
  return min + Math.round((max - min) * t);
}

function pickRandom<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickRandomMobs(pool: readonly MobPoolEntry[], count: number, rng: () => number): MobPoolEntry[] {
  const result: MobPoolEntry[] = [];
  for (let i = 0; i < count; i++) {
    result.push(pickRandom(pool, rng));
  }
  return result;
}

function buildMob(
  entry: MobPoolEntry,
  roomIndex: number,
  mobIndex: number,
  tier: number,
  actionTemplate: readonly BossTemplateAction[],
): ExpeditionMobState {
  const hpScale = HP_SCALE_BY_TIER[Math.min(tier, MAX_TIER_INDEX)];
  const scaledHp = Math.round(entry.hp * hpScale);
  return {
    id: `mob-${roomIndex}-${mobIndex}`,
    mobTemplateId: entry.mobTemplateId,
    name: entry.name,
    prefix: null,
    hp: scaledHp,
    maxHp: scaledHp,
    stats: { ...entry.stats, hp: scaledHp, maxHp: scaledHp },
    actionTemplate: [...actionTemplate],
    activeEffects: [],
  };
}

function generateMobsForRoom(
  roomType: ExpeditionRoomType,
  roomIndex: number,
  tier: number,
  mobPool: readonly MobPoolEntry[],
  rng: () => number,
): ExpeditionMobState[] {
  const { MOB_COUNTS } = EXPEDITION_CONSTANTS;
  const mobs: ExpeditionMobState[] = [];

  switch (roomType) {
    case 'trash': {
      const count = mobCountForTier(MOB_COUNTS.trash, tier);
      const picks = pickRandomMobs(mobPool, count, rng);
      for (let i = 0; i < picks.length; i++) {
        mobs.push(buildMob(picks[i], roomIndex, i, tier, TRASH_MOB_TEMPLATE));
      }
      break;
    }
    case 'elite': {
      const count = mobCountForTier(MOB_COUNTS.elite, tier);
      const picks = pickRandomMobs(mobPool, count, rng);
      for (let i = 0; i < picks.length; i++) {
        mobs.push(buildMob(picks[i], roomIndex, i, tier, ELITE_MOB_TEMPLATE));
      }
      break;
    }
    case 'mini_boss': {
      // 1 main mob + adds
      const main = pickRandom(mobPool, rng);
      mobs.push(buildMob(main, roomIndex, 0, tier, MINI_BOSS_TEMPLATE));
      const addCount = mobCountForTier(MOB_COUNTS.mini_boss_adds, tier);
      const adds = pickRandomMobs(mobPool, addCount, rng);
      for (let i = 0; i < adds.length; i++) {
        mobs.push(buildMob(adds[i], roomIndex, i + 1, tier, MINI_BOSS_ADD_TEMPLATE));
      }
      break;
    }
    case 'event': {
      const count = mobCountForTier(MOB_COUNTS.event, tier);
      const picks = pickRandomMobs(mobPool, count, rng);
      for (let i = 0; i < picks.length; i++) {
        mobs.push(buildMob(picks[i], roomIndex, i, tier, TRASH_MOB_TEMPLATE));
      }
      break;
    }
    case 'final_boss': {
      const boss = pickRandom(mobPool, rng);
      const bossMob = buildMob(boss, roomIndex, 0, tier, FINAL_BOSS_PHASE1_TEMPLATE);
      // Sorted by threshold ascending: lowest (most aggressive) first
      bossMob.phaseTemplates = [
        { hpThreshold: EXPEDITION_CONSTANTS.BOSS_PHASE_THRESHOLDS[1], template: [...FINAL_BOSS_PHASE3_TEMPLATE] },
        { hpThreshold: EXPEDITION_CONSTANTS.BOSS_PHASE_THRESHOLDS[0], template: [...FINAL_BOSS_PHASE2_TEMPLATE] },
      ];
      mobs.push(bossMob);
      break;
    }
  }

  return mobs;
}

/**
 * Generate an ordered list of expedition rooms for a given tier.
 * The final_boss room is always placed last; all other rooms are shuffled.
 */
export function generateExpeditionRooms(
  tier: number,
  mobPool: MobPoolEntry[],
  rng: () => number = Math.random,
): ExpeditionRoomDefinition[] {
  const composition = EXPEDITION_ROOM_COMPOSITIONS[tier];
  if (!composition) {
    throw new Error(`No room composition defined for tier ${tier}`);
  }

  // Expand { type, count } entries into a flat room type list
  const expanded: ExpeditionRoomType[] = [];
  for (const entry of composition) {
    for (let c = 0; c < entry.count; c++) {
      expanded.push(entry.type);
    }
  }

  // Separate final_boss from the rest so it always goes last
  const nonBoss: ExpeditionRoomType[] = [];
  let hasFinalBoss = false;
  for (const roomType of expanded) {
    if (roomType === 'final_boss') {
      hasFinalBoss = true;
    } else {
      nonBoss.push(roomType);
    }
  }
  shuffle(nonBoss, rng);

  // Rebuild ordered list: shuffled rooms + final_boss at end
  const orderedTypes: ExpeditionRoomType[] = [...nonBoss];
  if (hasFinalBoss) orderedTypes.push('final_boss');

  const rooms: ExpeditionRoomDefinition[] = [];
  for (let i = 0; i < orderedTypes.length; i++) {
    const roomType = orderedTypes[i];
    const mobs = generateMobsForRoom(roomType, i, tier, mobPool, rng);
    const room: ExpeditionRoomDefinition = {
      roomIndex: i,
      roomType,
      mobs,
    };
    if (roomType === 'event') {
      room.environmentalDotPercent = EXPEDITION_CONSTANTS.EVENT_DOT_PERCENT;
    }
    rooms.push(room);
  }

  return rooms;
}
