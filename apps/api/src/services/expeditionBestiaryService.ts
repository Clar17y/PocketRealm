import { prisma } from '@pocketrealm/database';
import { EXPEDITION_THEMES } from '@pocketrealm/shared/constants/expeditionDefinitions';
import { BESTIARY_UNLOCK_CONSTANTS } from '@pocketrealm/shared';
import type { ExpeditionTheme, ExpeditionThemeMob } from '@pocketrealm/shared';

type MobRole = 'trash' | 'elite' | 'caster' | 'add' | 'mini_boss' | 'final_boss';

interface ExpeditionBestiaryMob {
  mobTemplateId: string;
  name: string;
  role: MobRole;
  killCount: number;
  stats: { hp: number; attack: number; defence: number } | null;
  rotation: Array<{ round: number; actionName: string; targetMode: string }> | null;
}

interface ExpeditionBestiaryTheme {
  theme: string;
  themeName: string;
  attempted: boolean;
  mobs: ExpeditionBestiaryMob[];
}

interface ExpeditionBestiaryResponse {
  themes: ExpeditionBestiaryTheme[];
}

const { STATS_THRESHOLD, ROTATION_THRESHOLD } = BESTIARY_UNLOCK_CONSTANTS;

function getRotation(
  mob: ExpeditionThemeMob,
  role: MobRole,
  theme: ExpeditionTheme,
): Array<{ round: number; actionName: string; targetMode: string }> {
  if (role === 'final_boss') {
    const allActions = [
      ...theme.finalBoss.phase1,
      ...theme.finalBoss.phase2,
      ...theme.finalBoss.phase3,
    ];
    return allActions.map((a, i) => ({
      round: i + 1,
      actionName: a.actionId,
      targetMode: a.targetMode,
    }));
  }
  return mob.actionTemplate.map((a, i) => ({
    round: i + 1,
    actionName: a.actionId,
    targetMode: a.targetMode,
  }));
}

function getThemeMobRoster(theme: ExpeditionTheme): Array<{ mob: ExpeditionThemeMob; role: MobRole }> {
  const roster: Array<{ mob: ExpeditionThemeMob; role: MobRole }> = [];

  for (const m of theme.trash) roster.push({ mob: m, role: 'trash' });
  for (const m of theme.elites) roster.push({ mob: m, role: 'elite' });
  roster.push({ mob: theme.casterAdd, role: 'caster' });
  roster.push({ mob: theme.regularAdd, role: 'add' });
  roster.push({ mob: theme.miniBoss, role: 'mini_boss' });
  roster.push({ mob: theme.finalBoss.mob, role: 'final_boss' });

  return roster;
}

export async function getExpeditionBestiary(playerId: string): Promise<ExpeditionBestiaryResponse> {
  const entries = await prisma.playerExpeditionBestiary.findMany({
    where: { playerId },
  });

  const killsByMob = new Map<string, number>();
  const attemptedThemes = new Set<string>();
  for (const e of entries) {
    killsByMob.set(e.mobTemplateId, e.killCount);
    attemptedThemes.add(e.theme);
  }

  const themes: ExpeditionBestiaryTheme[] = EXPEDITION_THEMES.map(theme => {
    const roster = getThemeMobRoster(theme);
    const attempted = attemptedThemes.has(theme.id);

    const mobs: ExpeditionBestiaryMob[] = roster.map(({ mob, role }) => {
      const kills = killsByMob.get(mob.key) ?? 0;
      return {
        mobTemplateId: mob.key,
        name: mob.name,
        role,
        killCount: kills,
        stats: kills >= STATS_THRESHOLD ? {
          hp: mob.hp,
          attack: mob.stats.attack,
          defence: mob.stats.defence,
        } : null,
        rotation: kills >= ROTATION_THRESHOLD
          ? getRotation(mob, role, theme)
          : null,
      };
    });

    return { theme: theme.id, themeName: theme.name, attempted, mobs };
  });

  return { themes };
}
