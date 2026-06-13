import { prisma } from '@pocketrealm/database';
import { calculateCurrentTurns } from '@pocketrealm/game-engine';
import { DISCORD_NOTIFICATION_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';
import type { DiscordTurnsCappedPayload } from '@pocketrealm/shared/discord/discordNotifications';
import { getTurnConfig } from './turnBankService';

export interface DiscordTurnsCappedSweepSummary {
  checked: number;
  fired: number;
  rearmed: number;
  skipped: number;
}

/**
 * Detects opted-in linked players whose turn bank reached cap and writes
 * one outbox event per cap episode. Turn regen is lazy, so cap state is
 * computed here rather than evented from spend paths.
 *
 * State machine per preference row:
 *   at cap AND armed      -> insert outbox event, disarm
 *   below cap AND !armed  -> re-arm
 */
export async function runDiscordTurnsCappedSweep(
  now: Date = new Date(),
): Promise<DiscordTurnsCappedSweepSummary> {
  await prisma.discordNotificationEvent.deleteMany({
    where: {
      deliveredAt: {
        lt: new Date(now.getTime() - DISCORD_NOTIFICATION_CONSTANTS.DELIVERED_RETENTION_DAYS * 24 * 60 * 60 * 1000),
      },
    },
  });

  const preferences = await prisma.discordNotificationPreference.findMany({
    where: { type: 'turns_capped', enabled: true },
  });

  const summary: DiscordTurnsCappedSweepSummary = {
    checked: preferences.length,
    fired: 0,
    rearmed: 0,
    skipped: 0,
  };

  for (const preference of preferences) {
    const link = await prisma.discordAccountLink.findFirst({
      where: {
        discordGuildId: preference.discordGuildId,
        discordUserId: preference.discordUserId,
        unlinkedAt: null,
      },
      orderBy: { linkedAt: 'desc' },
      select: {
        account: {
          select: {
            activePlayer: {
              select: {
                id: true,
                username: true,
                turnBank: {
                  select: {
                    currentTurns: true,
                    lastRegenAt: true,
                    regenProgress: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const player = link?.account.activePlayer;
    if (!player?.turnBank) {
      summary.skipped += 1;
      continue;
    }

    const turnConfig = await getTurnConfig(prisma, player.id, now);
    const currentTurns = calculateCurrentTurns(
      player.turnBank.currentTurns,
      player.turnBank.lastRegenAt,
      now,
      turnConfig.regenRate,
      turnConfig.bankCap,
      player.turnBank.regenProgress,
    );
    const atCap = currentTurns >= turnConfig.bankCap;

    if (atCap && preference.armed) {
      const payload: DiscordTurnsCappedPayload = {
        currentTurns,
        bankCap: turnConfig.bankCap,
        username: player.username,
      };

      // skipDuplicates keeps the disarm committing even when another API
      // instance already inserted this cap episode's event.
      await prisma.$transaction([
        prisma.discordNotificationEvent.createMany({
          data: [{
            discordGuildId: preference.discordGuildId,
            discordUserId: preference.discordUserId,
            type: 'turns_capped',
            payload,
            dedupKey: `turns_capped:${player.id}:${player.turnBank.lastRegenAt.getTime()}`,
          }],
          skipDuplicates: true,
        }),
        prisma.discordNotificationPreference.update({
          where: { id: preference.id },
          data: { armed: false, lastFiredAt: now },
        }),
      ]);
      summary.fired += 1;
    } else if (!atCap && !preference.armed) {
      await prisma.discordNotificationPreference.update({
        where: { id: preference.id },
        data: { armed: true },
      });
      summary.rearmed += 1;
    }
  }

  return summary;
}
