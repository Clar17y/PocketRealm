import { prisma, type Prisma } from '@pocketrealm/database';
import {
  CHAT_ACTIVITY_CONSTANTS,
  ITEM_RARITY_CONSTANTS,
  formatChatActivityMessage,
  getNpcActivityReactionLine,
  getNpcActivityRelevance,
  isRarityAtLeast,
  type ChatActivityEventType,
  type ChatActivityRecord,
  type ChatActivityScope,
  type ChatChannelType,
  type ChatNpcActivityReactionResponse,
  type NpcKey,
} from '@pocketrealm/shared';
import { redis } from '../redis';
import { getIo } from '../socket';
import { emitSystemMessage } from './systemMessageService';

export interface LootActivityItem {
  itemTemplateId: string;
  quantity: number;
  rarity?: string | null;
  itemName?: string | null;
}

export interface BaseActivityInput {
  zoneId: string;
  actorPlayerId: string | null;
  actorUsername: string | null;
}

type ChatActivityRow = {
  id: string;
  eventType: string;
  scope: string;
  zoneId: string | null;
  actorPlayerId: string | null;
  actorUsername: string | null;
  subjectName: string | null;
  subjectRarity: string | null;
  message: string;
  metadata: unknown;
  createdAt: Date;
};

type ActivityCreateInput = {
  eventType: ChatActivityEventType;
  scope: ChatActivityScope;
  zoneId: string | null;
  actorPlayerId: string | null;
  actorUsername: string | null;
  subjectName: string | null;
  subjectRarity: string | null;
  metadata?: Prisma.InputJsonObject;
};

const RARITY_ORDER = ITEM_RARITY_CONSTANTS.ORDER;

function rarityRank(rarity: string | null | undefined): number {
  return RARITY_ORDER.findIndex((knownRarity) => knownRarity === rarity);
}

function pickBestLootItem(items: LootActivityItem[]): LootActivityItem | null {
  const eligibleItems = items.filter(
    (item) => item.itemName && isRarityAtLeast(item.rarity, CHAT_ACTIVITY_CONSTANTS.MIN_LOOT_RARITY),
  );

  return [...eligibleItems].sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity))[0] ?? null;
}

function metadataRecord(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  return metadata as Record<string, unknown>;
}

function toChatActivityRecord(row: ChatActivityRow): ChatActivityRecord {
  return {
    id: row.id,
    eventType: row.eventType as ChatActivityEventType,
    scope: row.scope === 'global' ? 'global' : 'zone',
    zoneId: row.zoneId,
    actorPlayerId: row.actorPlayerId,
    actorUsername: row.actorUsername,
    subjectName: row.subjectName,
    subjectRarity: row.subjectRarity,
    message: row.message,
    metadata: metadataRecord(row.metadata),
    createdAt: row.createdAt.toISOString(),
  };
}

function expiresAtFromNow(): Date {
  return new Date(Date.now() + CHAT_ACTIVITY_CONSTANTS.NPC_REACTION_LOOKBACK_HOURS * 60 * 60 * 1000);
}

function messagePreview(activity: ActivityCreateInput): ChatActivityRecord {
  return {
    id: 'preview',
    eventType: activity.eventType,
    scope: activity.scope,
    zoneId: activity.zoneId,
    actorPlayerId: activity.actorPlayerId,
    actorUsername: activity.actorUsername,
    subjectName: activity.subjectName,
    subjectRarity: activity.subjectRarity,
    message: '',
    metadata: activity.metadata ?? {},
    createdAt: new Date().toISOString(),
  };
}

async function canBroadcastActivity(actorPlayerId: string | null, eventType: ChatActivityEventType): Promise<boolean> {
  if (!actorPlayerId) {
    return true;
  }

  const result = await redis.set(
    `chat_activity:${actorPlayerId}:${eventType}`,
    '1',
    'PX',
    CHAT_ACTIVITY_CONSTANTS.COOLDOWN_PER_PLAYER_EVENT_MS,
    'NX',
  );

  return result === 'OK';
}

async function broadcastAndPersistActivity(activity: ActivityCreateInput): Promise<void> {
  if (!(await canBroadcastActivity(activity.actorPlayerId, activity.eventType))) {
    return;
  }

  const message = formatChatActivityMessage(activity.eventType, messagePreview(activity));
  const channelType: ChatChannelType = activity.scope === 'global' ? 'world' : 'zone';
  const channelId = activity.scope === 'global' ? 'world' : `zone:${activity.zoneId}`;
  const chatMessage = await emitSystemMessage(getIo(), channelType, channelId, message);

  await prisma.chatActivity.create({
    data: {
      chatMessageId: chatMessage.id,
      eventType: activity.eventType,
      scope: activity.scope,
      zoneId: activity.zoneId,
      actorPlayerId: activity.actorPlayerId,
      actorUsername: activity.actorUsername,
      subjectName: activity.subjectName,
      subjectRarity: activity.subjectRarity,
      message,
      metadata: activity.metadata ?? {},
      expiresAt: expiresAtFromNow(),
    },
  });
}

export async function broadcastRareLootActivity(params: BaseActivityInput & { loot: LootActivityItem[] }): Promise<void> {
  const bestItem = pickBestLootItem(params.loot);
  if (!bestItem?.itemName) {
    return;
  }

  await broadcastAndPersistActivity({
    eventType: 'rare_loot',
    scope: 'zone',
    zoneId: params.zoneId,
    actorPlayerId: params.actorPlayerId,
    actorUsername: params.actorUsername,
    subjectName: bestItem.itemName,
    subjectRarity: bestItem.rarity ?? null,
    metadata: { itemTemplateId: bestItem.itemTemplateId, quantity: bestItem.quantity },
  });
}

export async function broadcastCraftActivity(
  params: BaseActivityInput & { itemName: string; rarity: string; skillType: string },
): Promise<void> {
  if (!isRarityAtLeast(params.rarity, CHAT_ACTIVITY_CONSTANTS.MIN_CRAFT_RARITY)) {
    return;
  }

  await broadcastAndPersistActivity({
    eventType: 'craft_crit',
    scope: 'zone',
    zoneId: params.zoneId,
    actorPlayerId: params.actorPlayerId,
    actorUsername: params.actorUsername,
    subjectName: params.itemName,
    subjectRarity: params.rarity,
    metadata: { skillType: params.skillType },
  });
}

export async function broadcastZoneDiscoveryActivity(
  params: BaseActivityInput & { discoveredZoneName: string },
): Promise<void> {
  await broadcastAndPersistActivity({
    eventType: 'zone_discovery',
    scope: 'zone',
    zoneId: params.zoneId,
    actorPlayerId: params.actorPlayerId,
    actorUsername: params.actorUsername,
    subjectName: params.discoveredZoneName,
    subjectRarity: null,
  });
}

export async function broadcastAchievementActivity(
  params: BaseActivityInput & { achievementTitle: string },
): Promise<void> {
  await broadcastAndPersistActivity({
    eventType: 'achievement',
    scope: 'zone',
    zoneId: params.zoneId,
    actorPlayerId: params.actorPlayerId,
    actorUsername: params.actorUsername,
    subjectName: params.achievementTitle,
    subjectRarity: null,
  });
}

export async function broadcastBossDefeatActivity(params: {
  zoneId: string | null;
  zoneName: string;
  bossName: string;
  killerName: string | null;
}): Promise<void> {
  await broadcastAndPersistActivity({
    eventType: 'boss_defeat',
    scope: 'global',
    zoneId: params.zoneId,
    actorPlayerId: null,
    actorUsername: params.killerName,
    subjectName: `${params.bossName} in ${params.zoneName}`,
    subjectRarity: null,
  });

  if (!params.zoneId) {
    return;
  }

  await broadcastAndPersistActivity({
    eventType: 'boss_defeat',
    scope: 'zone',
    zoneId: params.zoneId,
    actorPlayerId: null,
    actorUsername: params.killerName,
    subjectName: params.bossName,
    subjectRarity: null,
  });
}

export async function getNpcActivityReaction(
  playerId: string,
  npcKey: NpcKey,
): Promise<ChatNpcActivityReactionResponse['reaction']> {
  const now = new Date();
  const since = new Date(now.getTime() - CHAT_ACTIVITY_CONSTANTS.NPC_REACTION_LOOKBACK_HOURS * 60 * 60 * 1000);
  const [reactedRows, activityRows]: [{ activityId: string }[], ChatActivityRow[]] = await Promise.all([
    prisma.playerNpcActivityReaction.findMany({
      where: { playerId, npcKey },
      select: { activityId: true },
    }),
    prisma.chatActivity.findMany({
      where: {
        createdAt: { gte: since },
        expiresAt: { gte: now },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
  ]);
  const reactedActivityIds = new Set(reactedRows.map((row) => row.activityId));

  for (const row of activityRows) {
    if (reactedActivityIds.has(row.id)) {
      continue;
    }

    const activity = toChatActivityRecord(row);
    const relevance = getNpcActivityRelevance(npcKey, activity);
    if (!relevance.relevant || (relevance.preferOwn && activity.actorPlayerId !== playerId)) {
      continue;
    }

    const line = getNpcActivityReactionLine(npcKey, activity);
    if (!line) {
      continue;
    }

    await prisma.playerNpcActivityReaction.create({
      data: { playerId, npcKey, activityId: activity.id },
    });

    return { activityId: activity.id, eventType: activity.eventType, line };
  }

  return null;
}
