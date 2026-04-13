import type { Server as SocketServer } from 'socket.io';
import { prisma } from '@pocketrealm/database';
import { logger } from '../logger';

export type ScheduledRoundKind = 'bossEncounter' | 'guildExpedition';
export type GetIo = () => SocketServer | null;

type DueResolver = (id: string, io: SocketServer | null) => Promise<void>;
type BossResolverModule = { resolveDueBossEncounter: DueResolver };
type ExpeditionResolverModule = { resolveDueExpeditionStep: DueResolver };

type Entry = {
  timer: NodeJS.Timeout;
  attempts: number;
};

const timers = new Map<string, Entry>();

const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 5 * 60_000;
const MAX_RETRY_ATTEMPTS = 3;

function key(kind: ScheduledRoundKind, id: string): string {
  return `${kind}:${id}`;
}

async function resolveFor(kind: ScheduledRoundKind, id: string, io: SocketServer | null): Promise<void> {
  // Dynamic imports avoid top-level cycles:
  // registry -> boss/expedition service -> registry.
  if (kind === 'bossEncounter') {
    const mod = (await import('./bossEncounterService.js')) as unknown as BossResolverModule;
    return mod.resolveDueBossEncounter(id, io);
  }

  const mod = (await import('./expeditionRoundService.js')) as unknown as ExpeditionResolverModule;
  return mod.resolveDueExpeditionStep(id, io);
}

function scheduleInternal(
  kind: ScheduledRoundKind,
  id: string,
  runAt: Date,
  getIo: GetIo,
  attempts: number,
): void {
  const mapKey = key(kind, id);
  const existing = timers.get(mapKey);
  if (existing) clearTimeout(existing.timer);

  const delay = Math.max(0, runAt.getTime() - Date.now());

  const timer = setTimeout(async () => {
    timers.delete(mapKey);

    try {
      await resolveFor(kind, id, getIo());
    } catch (err) {
      const nextAttempts = attempts + 1;
      if (nextAttempts >= MAX_RETRY_ATTEMPTS) {
        logger.error(
          { err, kind, id, attempts: nextAttempts },
          'Round timer resolver failed; giving up',
        );
        return;
      }

      const backoffMs = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, nextAttempts - 1));
      logger.error(
        { err, kind, id, attempts: nextAttempts, backoffMs },
        'Round timer resolver failed; retrying',
      );
      scheduleInternal(kind, id, new Date(Date.now() + backoffMs), getIo, nextAttempts);
    }
  }, delay);

  timers.set(mapKey, { timer, attempts });
}

export const roundTimerRegistry = {
  schedule(kind: ScheduledRoundKind, id: string, runAt: Date, getIo: GetIo): void {
    scheduleInternal(kind, id, runAt, getIo, 0);
  },

  cancel(kind: ScheduledRoundKind, id: string): void {
    const mapKey = key(kind, id);
    const existing = timers.get(mapKey);
    if (!existing) return;

    clearTimeout(existing.timer);
    timers.delete(mapKey);
  },

  async rehydrate(getIo: GetIo): Promise<void> {
    const bossRows = await prisma.bossEncounter.findMany({
      where: { status: 'in_progress', nextRoundAt: { not: null } },
      select: { id: true, nextRoundAt: true },
    });
    for (const row of bossRows) {
      this.schedule('bossEncounter', row.id, row.nextRoundAt!, getIo);
    }

    const expRows = await prisma.guildExpedition.findMany({
      where: {
        status: { in: ['recruiting', 'in_progress'] },
        nextRoundAt: { not: null },
      },
      select: { id: true, nextRoundAt: true },
    });
    for (const row of expRows) {
      this.schedule('guildExpedition', row.id, row.nextRoundAt!, getIo);
    }

    logger.info(
      { bossTimers: bossRows.length, expeditionTimers: expRows.length },
      'Round timer registry rehydrated',
    );
  },

  size(): number {
    return timers.size;
  },

  keys(): string[] {
    return Array.from(timers.keys());
  },

  clearAll(): void {
    for (const entry of timers.values()) clearTimeout(entry.timer);
    timers.clear();
  },
};
