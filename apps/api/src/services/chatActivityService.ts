import { Prisma, prisma } from '@pocketrealm/database';
import {
  CHAT_ACTIVITY_CONSTANTS,
  CHAT_ACTIVITY_EVENT_TYPES,
  CHAT_ACTIVITY_SCOPES,
  CHAT_CONSTANTS,
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
  zoneId: string | null;
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

type BaseActivityCreateInput = {
  eventType: ChatActivityEventType;
  actorPlayerId: string | null;
  actorUsername: string | null;
  subjectName: string | null;
  subjectRarity: string | null;
  metadata?: Prisma.InputJsonObject;
};

type ActivityCreateInput = BaseActivityCreateInput & {
  scope: ChatActivityScope;
  zoneId: string | null;
};

const RARITY_ORDER = ITEM_RARITY_CONSTANTS.ORDER;

function isChatActivityEventType(value: string): value is ChatActivityEventType {
  return (CHAT_ACTIVITY_EVENT_TYPES as readonly string[]).includes(value);
}

function isChatActivityScope(value: string): value is ChatActivityScope {
  return (CHAT_ACTIVITY_SCOPES as readonly string[]).includes(value);
}

function rarityRank(rarity: string | null | undefined): number {
  return RARITY_ORDER.findIndex((knownRarity) => knownRarity === rarity);
}

function pickBestLootItem(items: LootActivityItem[]): LootActivityItem | null {
  let bestItem: LootActivityItem | null = null;
  let bestRank = -1;

  for (const item of items) {
    if (!item.itemName || !isRarityAtLeast(item.rarity, CHAT_ACTIVITY_CONSTANTS.MIN_LOOT_RARITY)) {
      continue;
    }

    const rank = rarityRank(item.rarity);
    if (rank > bestRank) {
      bestItem = item;
      bestRank = rank;
    }
  }

  return bestItem;
}

function metadataRecord(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  return metadata as Record<string, unknown>;
}

function toChatActivityRecord(row: ChatActivityRow): ChatActivityRecord | null {
  if (!isChatActivityEventType(row.eventType) || !isChatActivityScope(row.scope)) {
    return null;
  }
  if (row.scope === 'zone' && !row.zoneId) {
    return null;
  }

  return {
    id: row.id,
    eventType: row.eventType,
    scope: row.scope,
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

function hasPrismaRequestErrorCode(error: unknown, code: string): boolean {
  const knownRequestError = (Prisma as typeof Prisma & {
    PrismaClientKnownRequestError?: new (...args: never[]) => { code?: string };
  }).PrismaClientKnownRequestError;

  if (typeof knownRequestError === 'function' && error instanceof knownRequestError) {
    return error.code === code;
  }

  return Boolean(
    error
      && typeof error === 'object'
      && 'code' in error
      && (error as Record<'code', unknown>).code === code,
  );
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
  if (activity.scope === 'zone' && !activity.zoneId) {
    throw new Error('zoneId is required for zone chat activity');
  }

  if (!(await canBroadcastActivity(activity.actorPlayerId, activity.eventType))) {
    return;
  }

  const message = formatChatActivityMessage(activity.eventType, messagePreview(activity))
    .slice(0, CHAT_CONSTANTS.MAX_MESSAGE_LENGTH);
  const channelType: ChatChannelType = activity.scope === 'global' ? 'world' : 'zone';
  const channelId = activity.scope === 'global' ? 'world' : `zone:${activity.zoneId}`;
  const chatMessage = await emitSystemMessage(getIo(), channelType, channelId, message, 'activity');

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
    subjectName: params.bossName,
    subjectRarity: null,
    metadata: { zoneName: params.zoneName },
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
  const reactedRows: { activityId: string }[] = await prisma.playerNpcActivityReaction.findMany({
    where: { playerId, npcKey, reactedAt: { gte: since } },
    select: { activityId: true },
  });
  const reactedActivityIds = new Set(reactedRows.map((row) => row.activityId));
  let cursorId: string | undefined;

  for (let page = 0; page < CHAT_ACTIVITY_CONSTANTS.NPC_REACTION_MAX_PAGES; page++) {
    const activityRows: ChatActivityRow[] = await prisma.chatActivity.findMany({
      where: {
        createdAt: { gte: since },
        expiresAt: { gte: now },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: CHAT_ACTIVITY_CONSTANTS.NPC_REACTION_PAGE_SIZE,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });

    if (activityRows.length === 0) {
      return null;
    }

    for (const row of activityRows) {
      if (reactedActivityIds.has(row.id)) {
        continue;
      }

      const activity = toChatActivityRecord(row);
      if (!activity) {
        continue;
      }

      const relevance = getNpcActivityRelevance(npcKey, activity);
      if (!relevance.relevant || (relevance.preferOwn && activity.actorPlayerId !== playerId)) {
        continue;
      }

      const line = getNpcActivityReactionLine(npcKey, activity);
      if (!line) {
        continue;
      }

      try {
        await prisma.playerNpcActivityReaction.create({
          data: { playerId, npcKey, activityId: activity.id },
        });
      } catch (error: unknown) {
        if (hasPrismaRequestErrorCode(error, 'P2002')) {
          continue;
        }
        throw error;
      }

      return { activityId: activity.id, eventType: activity.eventType, line };
    }

    if (activityRows.length < CHAT_ACTIVITY_CONSTANTS.NPC_REACTION_PAGE_SIZE) {
      return null;
    }

    cursorId = activityRows[activityRows.length - 1]!.id;
  }

  return null;
}
