import { EXPEDITION_ROOM_COMPOSITIONS } from '@pocketrealm/shared/constants/expeditionDefinitions';
import type {
  ExpeditionRoomDefinition,
  ExpeditionRoomType,
  ExpeditionMobState,
  ExpeditionTheme,
  ExpeditionThemeMob,
} from '@pocketrealm/shared';
import { EXPEDITION_CONSTANTS } from '@pocketrealm/shared';

const MAX_TIER_INDEX = 2;

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

function buildMobFromTheme(
  themeMob: ExpeditionThemeMob,
  roomIndex: number,
  mobIndex: number,
  templateIdMap?: Map<string, string>,
): ExpeditionMobState {
  return {
    id: `mob-${roomIndex}-${mobIndex}`,
    mobTemplateId: templateIdMap?.get(themeMob.key) ?? '',
    name: themeMob.name,
    prefix: null,
    hp: themeMob.hp,
    maxHp: themeMob.hp,
    stats: { ...themeMob.stats, hp: themeMob.hp, maxHp: themeMob.hp },
    actionTemplate: themeMob.actionTemplate,
    activeEffects: [],
  };
}

function generateMobsForRoom(
  roomType: ExpeditionRoomType,
  roomIndex: number,
  tier: number,
  theme: ExpeditionTheme,
  rng: () => number,
  templateIdMap?: Map<string, string>,
): ExpeditionMobState[] {
  const { MOB_COUNTS } = EXPEDITION_CONSTANTS;
  const mobs: ExpeditionMobState[] = [];

  switch (roomType) {
    case 'trash': {
      const count = mobCountForTier(MOB_COUNTS.trash, tier);
      for (let i = 0; i < count; i++) {
        const pick = pickRandom(theme.trash, rng);
        mobs.push(buildMobFromTheme(pick, roomIndex, i, templateIdMap));
      }
      break;
    }
    case 'elite': {
      const count = mobCountForTier(MOB_COUNTS.elite, tier);
      for (let i = 0; i < count; i++) {
        const pick = pickRandom(theme.elites, rng);
        mobs.push(buildMobFromTheme(pick, roomIndex, i, templateIdMap));
      }
      break;
    }
    case 'mini_boss': {
      mobs.push(buildMobFromTheme(theme.miniBoss, roomIndex, 0, templateIdMap));
      const addCount = mobCountForTier(MOB_COUNTS.mini_boss_adds, tier);
      for (let i = 0; i < addCount; i++) {
        const addPool = [...theme.miniBossAdds, theme.casterAdd];
        const pick = pickRandom(addPool, rng);
        mobs.push(buildMobFromTheme(pick, roomIndex, i + 1, templateIdMap));
      }
      break;
    }
    case 'event': {
      const count = mobCountForTier(MOB_COUNTS.event, tier);
      for (let i = 0; i < count; i++) {
        const pick = pickRandom(theme.trash, rng);
        mobs.push(buildMobFromTheme(pick, roomIndex, i, templateIdMap));
      }
      break;
    }
    case 'final_boss': {
      const bossThemeMob = theme.finalBoss.mob;
      const bossMob = buildMobFromTheme(bossThemeMob, roomIndex, 0, templateIdMap);
      bossMob.phaseTemplates = [
        { hpThreshold: EXPEDITION_CONSTANTS.BOSS_PHASE_THRESHOLDS[1], template: theme.finalBoss.phase3 },
        { hpThreshold: EXPEDITION_CONSTANTS.BOSS_PHASE_THRESHOLDS[0], template: theme.finalBoss.phase2 },
      ];
      bossMob.actionTemplate = theme.finalBoss.phase1;
      mobs.push(bossMob);
      break;
    }
  }
  return mobs;
}

/**
 * Generate an ordered list of expedition rooms for a given tier using a theme's mob roster.
 * The final_boss room is always placed last; all other rooms are shuffled.
 */
export function generateExpeditionRooms(
  tier: number,
  theme: ExpeditionTheme,
  rng: () => number = Math.random,
  templateIdMap?: Map<string, string>,
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
    const mobs = generateMobsForRoom(roomType, i, tier, theme, rng, templateIdMap);
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
