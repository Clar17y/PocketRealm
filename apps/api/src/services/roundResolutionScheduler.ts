import { prisma } from '@pocketrealm/database';
import { checkAndResolveDueBossRounds } from './bossEncounterService';
import { checkAndResolveExpeditionRounds } from './expeditionService';
import { logger } from '../logger';

const ACTIVE_INTERVAL_MS = 5_000;
const IDLE_INTERVAL_MS = 60_000;

type GetIo = () => Parameters<typeof checkAndResolveDueBossRounds>[0];

async function hasActiveRounds(): Promise<boolean> {
  const [bossCount, expeditionCount] = await Promise.all([
    prisma.bossEncounter.count({
      where: { status: 'in_progress' },
    }),
    prisma.guildExpedition.count({
      where: { status: { in: ['recruiting', 'in_progress'] } },
    }),
  ]);
  return bossCount > 0 || expeditionCount > 0;
}

export function startRoundResolutionScheduler(getIo: GetIo): void {
  async function tick() {
    try {
      const active = await hasActiveRounds();
      if (active) {
        await Promise.all([
          checkAndResolveDueBossRounds(getIo()),
          checkAndResolveExpeditionRounds(getIo()),
        ]);
      }
      setTimeout(tick, active ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS);
    } catch (err) {
      logger.error({ err }, 'Round resolution error');
      setTimeout(tick, IDLE_INTERVAL_MS);
    }
  }

  setTimeout(tick, ACTIVE_INTERVAL_MS);
}
