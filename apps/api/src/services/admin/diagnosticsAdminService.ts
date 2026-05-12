import { getBalanceReport } from '../analyticsService';
import { prisma } from '@pocketrealm/database';
import { roundTimerRegistry } from '../roundTimerRegistry';

export {
  getAdminApiLatencyActions,
  getAdminApiLatencyReport,
  type ApiLatencyPeriod,
  type LatencyReport,
  type LatencyReportQuery,
} from './apiLatencyAdminService';

export async function getAdminSchedulerStatus() {
  const [pendingBossEncounters, pendingGuildExpeditions] = await Promise.all([
    prisma.bossEncounter.count({
      where: { status: 'in_progress', nextRoundAt: { not: null } },
    }),
    prisma.guildExpedition.count({
      where: {
        status: { in: ['recruiting', 'in_progress'] },
        nextRoundAt: { not: null },
      },
    }),
  ]);

  const pendingTimers = roundTimerRegistry.size();
  const pendingEnumeratedFromDb = pendingBossEncounters + pendingGuildExpeditions;

  return {
    pendingTimers,
    timerKeys: roundTimerRegistry.keys(),
    pendingBossEncounters,
    pendingGuildExpeditions,
    pendingEnumeratedFromDb,
    hasDrift: pendingTimers !== pendingEnumeratedFromDb,
  };
}

export async function getAdminBalanceAnalytics(period: '1h' | '24h' | '7d' | '30d') {
  return getBalanceReport(period);
}
