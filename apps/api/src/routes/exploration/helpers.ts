import { z } from 'zod';
import { prisma } from '@pocketrealm/database';
import {
  resolveZoneTiers,
  getHighestUnlockedTier,
  type EncounterSiteSize,
  type EncounterMobRole,
  type EncounterMobStatus,
  type EncounterMobSlot,
} from '@pocketrealm/shared';
import {
  generateRoomAssignments,
  rollMobPrefix,
  selectTierWithBleedthrough,
} from '@pocketrealm/game-engine';
import { pickWeighted as pickWeightedGeneric } from '../../utils/pickWeighted.js';

export const EXPLORATION_TRACKING_CONSTANTS = {
  RESULT_RATE_MULTIPLIER: 0.75,
  TRACKED_FAMILY_WEIGHT_MULTIPLIER: 4,
  NON_TRACKED_WEIGHT_MULTIPLIER: 0.35,
} as const;

// --- Zod schemas ---

export const estimateQuerySchema = z.object({
  turns: z.coerce.number().int(),
  zoneId: z.string().uuid().optional(),
});

export const startSchema = z.object({
  zoneId: z.string().uuid(),
  turns: z.number().int(),
  tier: z.number().int().min(1).optional(),
  trackingFamilyId: z.string().uuid().optional(),
});

// --- Types ---

export type { EncounterSiteSize } from '@pocketrealm/shared';

type NarrativeEventType =
  | 'ambush_victory'
  | 'ambush_defeat'
  | 'encounter_site'
  | 'resource_node'
  | 'hidden_cache'
  | 'zone_exit'
  | 'event_discovery';

export interface NarrativeEvent {
  turn: number;
  type: NarrativeEventType;
  description: string;
  details?: Record<string, unknown>;
}

export interface ZoneFamilyMember {
  role: string;
  mobTemplate: {
    id: string;
    name: string;
    zoneId: string;
    explorationTier: number;
  };
}

export interface ZoneFamilyRow {
  zoneId: string;
  mobFamilyId: string;
  discoveryWeight: number;
  minSize: string;
  maxSize: string;
  mobFamily: {
    id: string;
    name: string;
    siteNounSmall: string;
    siteNounMedium: string;
    siteNounLarge: string;
    members: ZoneFamilyMember[];
  };
}

export interface PendingResourceDiscovery {
  turnOccurred: number;
  resourceNodeId: string;
  resourceType: string;
  capacity: number;
  sizeName: string;
}

export interface PendingEncounterSiteDiscovery {
  turnOccurred: number;
  mobFamilyId: string;
  siteName: string;
  size: EncounterSiteSize;
  mobs: EncounterMobSlot[];
}

export interface PendingAmbushCombatLog {
  turnsSpent: number;
  result: unknown;
}

export interface TrackableMobFamily {
  mobFamilyId: string;
  name: string;
}

type WeightedFamilyRecord = {
  mobFamilyId: string;
};

// --- Utility functions ---

export function pickWeighted<T>(
  items: T[],
  weightKey: string,
  defaultWeight = 100
): T | null {
  return pickWeightedGeneric(items, (item) => {
    const value = (item as Record<string, unknown>)[weightKey];
    return typeof value === 'number' && Number.isFinite(value) ? value : defaultWeight;
  });
}

export function randomIntInclusive(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getNodeSizeName(capacity: number, maxCapacity: number): string {
  const ratio = capacity / maxCapacity;
  if (ratio <= 0.25) return 'Tiny';
  if (ratio <= 0.5) return 'Small';
  if (ratio <= 0.75) return 'Medium';
  if (ratio <= 0.9) return 'Large';
  return 'Huge';
}

const ENCOUNTER_SIZE_ORDER: EncounterSiteSize[] = ['small', 'medium', 'large'];

function toEncounterSize(value: string): EncounterSiteSize | null {
  if (value === 'small' || value === 'medium' || value === 'large') return value;
  return null;
}

export function pickEncounterSize(minRaw: string, maxRaw: string): EncounterSiteSize {
  const minSize = toEncounterSize(minRaw) ?? 'small';
  const maxSize = toEncounterSize(maxRaw) ?? 'large';
  const minIndex = ENCOUNTER_SIZE_ORDER.indexOf(minSize);
  const maxIndex = ENCOUNTER_SIZE_ORDER.indexOf(maxSize);
  const start = Math.max(0, Math.min(minIndex, maxIndex));
  const end = Math.max(0, Math.max(minIndex, maxIndex));
  const allowed = ENCOUNTER_SIZE_ORDER.slice(start, end + 1);
  return allowed[randomIntInclusive(0, allowed.length - 1)] ?? 'small';
}

export function getSiteName(
  familyName: string,
  size: EncounterSiteSize,
  nouns: { siteNounSmall: string; siteNounMedium: string; siteNounLarge: string }
): string {
  if (size === 'small') return `Small ${familyName} ${nouns.siteNounSmall}`;
  if (size === 'medium') return `${familyName} ${nouns.siteNounMedium}`;
  return `Large ${familyName} ${nouns.siteNounLarge}`;
}

function pickFamilyMemberByRole(
  members: ZoneFamilyMember[],
  role: EncounterMobRole,
  fallback: EncounterMobRole[] = []
): ZoneFamilyMember | null {
  const byRole = members.filter((member) => member.role === role);
  if (byRole.length > 0) {
    return byRole[randomIntInclusive(0, byRole.length - 1)] ?? null;
  }

  for (const fbRole of fallback) {
    const fallbackMembers = members.filter((member) => member.role === fbRole);
    if (fallbackMembers.length > 0) {
      return fallbackMembers[randomIntInclusive(0, fallbackMembers.length - 1)] ?? null;
    }
  }

  if (members.length === 0) return null;
  return members[randomIntInclusive(0, members.length - 1)] ?? null;
}

export function applyTrackedFamilyWeightBias<T extends WeightedFamilyRecord>(
  items: T[],
  trackedFamilyId: string | null | undefined,
  weightKey: keyof T & string,
): T[] {
  if (!trackedFamilyId) return items;
  if (!items.some((item) => item.mobFamilyId === trackedFamilyId)) return items;

  return items.map((item) => ({
    ...item,
    [weightKey]: Number((item as Record<string, unknown>)[weightKey] ?? 0) * (
      item.mobFamilyId === trackedFamilyId
        ? EXPLORATION_TRACKING_CONSTANTS.TRACKED_FAMILY_WEIGHT_MULTIPLIER
        : EXPLORATION_TRACKING_CONSTANTS.NON_TRACKED_WEIGHT_MULTIPLIER
    ),
  })) as T[];
}

export async function buildTrackableMobFamiliesByZone(
  playerId: string,
  zoneIds: string[],
): Promise<Map<string, TrackableMobFamily[]>> {
  if (zoneIds.length === 0) return new Map<string, TrackableMobFamily[]>();

  const kills = await prisma.playerBestiary.findMany({
    where: { playerId, kills: { gt: 0 } },
    select: { mobTemplateId: true },
  });
  if (kills.length === 0) return new Map<string, TrackableMobFamily[]>();

  const members = await prisma.mobFamilyMember.findMany({
    where: {
      mobTemplateId: { in: kills.map((entry) => entry.mobTemplateId) },
      mobTemplate: { zoneId: { in: zoneIds } },
    },
    select: {
      mobFamilyId: true,
      mobTemplate: { select: { zoneId: true } },
      mobFamily: { select: { name: true } },
    },
  });

  const byZone = new Map<string, Map<string, TrackableMobFamily>>();
  for (const member of members) {
    const zoneFamilies = byZone.get(member.mobTemplate.zoneId) ?? new Map<string, TrackableMobFamily>();
    zoneFamilies.set(member.mobFamilyId, {
      mobFamilyId: member.mobFamilyId,
      name: member.mobFamily.name,
    });
    byZone.set(member.mobTemplate.zoneId, zoneFamilies);
  }

  return new Map(
    [...byZone.entries()].map(([zoneId, families]) => [
      zoneId,
      [...families.values()].sort((a, b) => a.name.localeCompare(b.name)),
    ]),
  );
}

export function buildEncounterSiteMobs(
  family: ZoneFamilyRow['mobFamily'],
  size: EncounterSiteSize,
  zoneId: string,
  explorationPercent: number = 100,
  zoneTiers: Record<string, number> | null = null,
  overrideTier?: number,
): EncounterMobSlot[] {
  const tiers = resolveZoneTiers(zoneTiers);

  let currentTier = getHighestUnlockedTier(explorationPercent, zoneTiers);
  if (currentTier === 0) return [];

  if (overrideTier !== undefined && overrideTier >= 1) {
    currentTier = overrideTier;
  }

  // Get ALL zone members (not filtered by tier)
  const zoneMembers = family.members
    .filter((member) => member.mobTemplate.zoneId === zoneId);
  if (zoneMembers.length === 0) return [];

  // Group members by tier
  const membersByTier = new Map<number, ZoneFamilyMember[]>();
  for (const member of zoneMembers) {
    const tier = member.mobTemplate.explorationTier ?? 1;
    if (!membersByTier.has(tier)) membersByTier.set(tier, []);
    membersByTier.get(tier)!.push(member);
  }

  // Pick a member at a bleedthrough-selected tier, falling back to lower tiers
  function pickMemberWithBleedthrough(
    role: EncounterMobRole,
    fallbackRoles: EncounterMobRole[],
  ): ZoneFamilyMember | null {
    const selectedTier = selectTierWithBleedthrough(currentTier, tiers);
    for (let t = selectedTier; t >= 1; t--) {
      const tierMembers = membersByTier.get(t) ?? [];
      if (tierMembers.length === 0) continue;
      const picked = pickFamilyMemberByRole(tierMembers, role, fallbackRoles);
      if (picked) return picked;
    }
    return pickFamilyMemberByRole(zoneMembers, role, fallbackRoles);
  }

  const { rooms, totalMobs } = generateRoomAssignments(size);

  // Role composition based on total mobs and site size
  let bossCount = 0;
  let eliteCount = 0;
  if (size === 'medium') eliteCount = 1;
  else if (size === 'large') { bossCount = 1; eliteCount = 2; }

  const trashCount = Math.max(0, totalMobs - eliteCount - bossCount);

  // Build role queue — trash first, elites/bosses last so they land in final rooms
  const roleQueue: EncounterMobRole[] = [
    ...Array(trashCount).fill('trash' as const),
    ...Array(eliteCount).fill('elite' as const),
    ...Array(bossCount).fill('boss' as const),
  ];

  // Assign mobs to rooms sequentially
  const mobs: EncounterMobSlot[] = [];
  let slot = 0;
  let roleIndex = 0;

  for (const room of rooms) {
    for (let i = 0; i < room.mobCount && roleIndex < roleQueue.length; i++) {
      const role = roleQueue[roleIndex]!;
      const fallbacks: EncounterMobRole[] = role === 'trash'
        ? ['elite', 'boss'] : role === 'elite'
        ? ['trash', 'boss'] : ['elite', 'trash'];

      const member = pickMemberWithBleedthrough(role, fallbacks);
      if (!member) { roleIndex++; continue; }

      mobs.push({
        slot: slot++,
        mobTemplateId: member.mobTemplate.id,
        role,
        prefix: rollMobPrefix(),
        status: 'alive',
        room: room.roomNumber,
      });
      roleIndex++;
    }
  }

  // Fallback: if no mobs were generated
  if (mobs.length === 0 && zoneMembers.length > 0) {
    const member = zoneMembers[0]!;
    mobs.push({
      slot: 0,
      mobTemplateId: member.mobTemplate.id,
      role: 'trash',
      prefix: rollMobPrefix(),
      status: 'alive',
      room: 1,
    });
  }

  return mobs;
}
