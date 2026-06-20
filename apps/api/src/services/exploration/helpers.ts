import { z } from 'zod';
import {
  isMiniBossFamilyRole,
  isPermanentEncounterFamilyRole,
  resolveZoneTiers,
  getHighestUnlockedTier,
  type EncounterSiteSize,
  type EncounterMobRole,
  type EncounterMobStatus,
  type EncounterMobSlot,
} from '@pocketrealm/shared';
import {
  assignEncounterRolesToRooms,
  generateRoomAssignments,
  rollMobPrefix,
  selectTierWithBleedthrough,
} from '@pocketrealm/game-engine';
import { pickWeighted as pickWeightedGeneric } from '../../utils/pickWeighted.js';
export {
  applyTrackedFamilyWeightBias,
  buildTrackableMobFamiliesByZone,
  type TrackableMobFamily,
} from '../../services/explorationTrackingService';

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
  prospectingResourceNodeId: z.string().uuid().optional(),
}).superRefine((value, ctx) => {
  if (value.trackingFamilyId && value.prospectingResourceNodeId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['prospectingResourceNodeId'],
      message: 'Choose either mob tracking or resource prospecting.',
    });
  }
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

function pickBaseFamilyMember(
  members: ZoneFamilyMember[],
  role: EncounterMobRole,
): ZoneFamilyMember | null {
  const nonMiniBossMembers = members.filter((member) => !isMiniBossFamilyRole(member.role));
  const pool = role === 'mini_boss'
    ? members
    : (nonMiniBossMembers.length > 0 ? nonMiniBossMembers : members);

  if (pool.length === 0) return null;
  return pool[randomIntInclusive(0, pool.length - 1)] ?? null;
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

  const zoneMembers = family.members.filter((member) => member.mobTemplate.zoneId === zoneId);
  const eligibleZoneMembers = zoneMembers.filter(
    (member) => (member.mobTemplate.explorationTier ?? 1) <= currentTier,
  );
  const eligibleEncounterMembers = eligibleZoneMembers.filter((member) => isPermanentEncounterFamilyRole(member.role));
  if (eligibleEncounterMembers.length === 0) return [];

  // Group members by tier
  const membersByTier = new Map<number, ZoneFamilyMember[]>();
  for (const member of eligibleEncounterMembers) {
    const tier = member.mobTemplate.explorationTier ?? 1;
    if (!membersByTier.has(tier)) membersByTier.set(tier, []);
    membersByTier.get(tier)!.push(member);
  }

  // Pick a member at a bleedthrough-selected tier, falling back to lower tiers
  function pickMemberWithBleedthrough(
    role: EncounterMobRole,
  ): ZoneFamilyMember | null {
    const selectedTier = selectTierWithBleedthrough(currentTier, tiers);
    for (let t = selectedTier; t >= 1; t--) {
      const tierMembers = membersByTier.get(t) ?? [];
      if (tierMembers.length === 0) continue;
      const picked = pickBaseFamilyMember(tierMembers, role);
      if (picked) return picked;
    }
    return pickBaseFamilyMember(eligibleEncounterMembers, role);
  }

  const { rooms } = generateRoomAssignments(size);
  const roleAssignments = assignEncounterRolesToRooms(rooms);

  // Assign mobs to rooms sequentially
  const mobs: EncounterMobSlot[] = [];
  let slot = 0;

  for (const assignment of roleAssignments) {
    const member = pickMemberWithBleedthrough(assignment.role);
    if (!member) continue;

    mobs.push({
      slot: slot++,
      mobTemplateId: member.mobTemplate.id,
      role: assignment.role,
      prefix: rollMobPrefix(),
      status: 'alive',
      room: assignment.room,
    });
  }

  // Fallback: if no mobs were generated, use an encounter-eligible member
  // (never an expedition-only member from eligibleZoneMembers).
  if (mobs.length === 0 && eligibleEncounterMembers.length > 0) {
    const member = eligibleEncounterMembers[0]!;
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
