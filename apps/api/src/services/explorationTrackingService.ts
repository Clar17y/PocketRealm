import { prisma } from '@pocketrealm/database';
import { EXPLORATION_TRACKING_CONSTANTS } from '@pocketrealm/shared';

export interface TrackableMobFamily {
  mobFamilyId: string;
  name: string;
  minTier: number;
}

type WeightedFamilyRecord = {
  mobFamilyId: string;
  [key: string]: unknown;
};

export function applyTrackedFamilyWeightBias<T extends WeightedFamilyRecord>(
  items: T[],
  trackedFamilyId: string | null | undefined,
  weightKey: keyof T & string,
): T[] {
  if (!trackedFamilyId) return items;
  if (!items.some((item) => item.mobFamilyId === trackedFamilyId)) return items;

  return items.map((item) => ({
    ...item,
    [weightKey]: Number(item[weightKey] ?? 0) * (
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
      mobTemplate: { select: { zoneId: true, explorationTier: true } },
      mobFamily: { select: { name: true } },
    },
  });
  if (members.length === 0) return new Map<string, TrackableMobFamily[]>();

  const unlockedPairs = new Set(
    members.map((member) => `${member.mobTemplate.zoneId}:${member.mobFamilyId}`),
  );
  const allZoneFamilyMembers = await prisma.mobFamilyMember.findMany({
    where: {
      mobFamilyId: { in: [...new Set(members.map((member) => member.mobFamilyId))] },
      mobTemplate: { zoneId: { in: zoneIds } },
    },
    select: {
      mobFamilyId: true,
      mobTemplate: { select: { zoneId: true, explorationTier: true } },
    },
  });

  const byZone = new Map<string, Map<string, TrackableMobFamily>>();
  for (const member of allZoneFamilyMembers) {
    const pairKey = `${member.mobTemplate.zoneId}:${member.mobFamilyId}`;
    if (!unlockedPairs.has(pairKey)) continue;

    const zoneFamilies = byZone.get(member.mobTemplate.zoneId) ?? new Map<string, TrackableMobFamily>();
    const minTier = member.mobTemplate.explorationTier ?? 1;
    const existing = zoneFamilies.get(member.mobFamilyId);
    const unlockedMember = members.find(
      (candidate) =>
        candidate.mobFamilyId === member.mobFamilyId
        && candidate.mobTemplate.zoneId === member.mobTemplate.zoneId,
    );
    zoneFamilies.set(member.mobFamilyId, {
      mobFamilyId: member.mobFamilyId,
      name: unlockedMember?.mobFamily.name ?? existing?.name ?? '',
      minTier: existing ? Math.min(existing.minTier, minTier) : minTier,
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
