import type { EncounterMobSlot, QuestProgressUpdate } from '@pocketrealm/shared';
import { trackProgress } from './progressService';

export async function trackEncounterSiteKillProgress(
  playerId: string,
  killedMobs: EncounterMobSlot[],
): Promise<QuestProgressUpdate[]> {
  if (killedMobs.length === 0) return [];

  const [killProgress, familyProgress] = await Promise.all([
    trackProgress(playerId, 'kill_count', killedMobs.length, undefined),
    trackProgress(playerId, 'kill_family', killedMobs.length, undefined),
  ]);

  const prefixCounts = new Map<string, number>();
  for (const mob of killedMobs) {
    if (!mob.prefix) continue;
    prefixCounts.set(mob.prefix, (prefixCounts.get(mob.prefix) ?? 0) + 1);
  }

  const prefixProgress = await Promise.all(
    [...prefixCounts.entries()].map(([prefix, count]) =>
      trackProgress(playerId, 'kill_prefix', count, { prefix }),
    ),
  );

  return [
    ...killProgress,
    ...familyProgress,
    ...prefixProgress.flat(),
  ];
}
