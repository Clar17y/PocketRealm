import { prisma } from '@pocketrealm/database';
import { BOSS_TEMPLATES, BESTIARY_UNLOCK_CONSTANTS } from '@pocketrealm/shared';
import { getCachedBossMobTemplates } from './staticDataCacheService';

const { DISCOVERED_THRESHOLD: HP_THRESHOLD, STATS_THRESHOLD, ROTATION_THRESHOLD } = BESTIARY_UNLOCK_CONSTANTS;

interface BossBestiaryEntry {
  bossTemplateId: string;
  name: string;
  defeatCount: number;
  hpPerParticipant: number | null;
  stats: { accuracy: number; defence: number } | null;
  rotation: Array<{ round: number; actionName: string; targetMode: string; isTelegraphed: boolean }> | null;
}

interface WorldBossBestiaryResponse {
  bosses: BossBestiaryEntry[];
}

export async function getWorldBossBestiary(playerId: string): Promise<WorldBossBestiaryResponse> {
  const bossMobTemplates = await getCachedBossMobTemplates();

  const participations = await prisma.bossParticipant.findMany({
    where: { playerId },
    include: {
      encounter: {
        select: { mobTemplateId: true, status: true, baseHp: true },
      },
    },
  });

  const defeatedEncountersByBoss = new Map<string, Set<string>>();
  const baseHpByBoss = new Map<string, number>();
  for (const p of participations) {
    if (p.encounter.status === 'defeated') {
      const id = p.encounter.mobTemplateId;
      const set = defeatedEncountersByBoss.get(id) ?? new Set();
      set.add(p.encounterId);
      defeatedEncountersByBoss.set(id, set);
      if (!baseHpByBoss.has(id)) baseHpByBoss.set(id, p.encounter.baseHp);
    }
  }

  const bosses: BossBestiaryEntry[] = bossMobTemplates.map(mob => {
    const defeats = defeatedEncountersByBoss.get(mob.id)?.size ?? 0;

    // hpPerParticipant from encounter data or mob template
    const hpPerParticipant = baseHpByBoss.get(mob.id) ?? mob.bossBaseHp ?? mob.hp;

    const template = BOSS_TEMPLATES[mob.name];

    return {
      bossTemplateId: mob.id,
      name: mob.name,
      defeatCount: defeats,
      hpPerParticipant: defeats >= HP_THRESHOLD ? hpPerParticipant : null,
      stats: defeats >= STATS_THRESHOLD ? {
        accuracy: mob.accuracy,
        defence: mob.defence,
      } : null,
      rotation: defeats >= ROTATION_THRESHOLD && template
        ? template.actions.map((a, i) => ({
            round: i + 1,
            actionName: template.actionDefinitions[a.actionId]?.name ?? a.actionId,
            targetMode: a.targetMode,
            isTelegraphed: a.isTelegraphed ?? false,
          }))
        : null,
    };
  });

  return { bosses };
}
