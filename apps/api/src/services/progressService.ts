import type { ProgressType, QuestProgressUpdate } from '@pocketrealm/shared';
import type { GuildContractType } from '@pocketrealm/shared';
import { getPlayerGuildId } from './guildService';
import { incrementContractProgress } from './guildContractService';
import { incrementQuestProgress } from './questService';

const GUILD_CONTRACT_TYPES = new Set<string>([
  'kill_count', 'kill_family', 'boss_rounds', 'craft_items',
  'craft_rare', 'gather_actions', 'exploration_turns', 'pvp_wins',
]);

export async function trackProgress(
  playerId: string,
  type: ProgressType,
  amount: number,
  metadata?: { prefix?: string; zoneId?: string; rarity?: string },
  preloadedGuildId?: string | null,
): Promise<QuestProgressUpdate[]> {
  if (amount <= 0) return [];

  const guildId = preloadedGuildId !== undefined
    ? preloadedGuildId
    : await getPlayerGuildId(playerId);

  const contractPromise = (guildId && GUILD_CONTRACT_TYPES.has(type))
    ? incrementContractProgress(guildId, type as GuildContractType, amount)
    : Promise.resolve();

  const [, questResult] = await Promise.allSettled([
    contractPromise,
    incrementQuestProgress(playerId, type, amount, metadata),
  ]);

  return questResult.status === 'fulfilled' ? questResult.value : [];
}
