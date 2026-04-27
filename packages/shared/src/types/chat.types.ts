import type { TitleStyleVariant } from './achievement.types';

export type ChatChannelType = 'world' | 'zone' | 'guild' | 'casino';

export interface ChatSendPayload {
  channelType: ChatChannelType;
  channelId: string;
  message: string;
}

export type ChatRole = 'player' | 'admin' | 'moderator';
export type ChatMessageType = 'player' | 'system' | 'activity';

export interface ChatMessageEvent {
  id: string;
  channelType: ChatChannelType;
  channelId: string;
  playerId: string;
  username: string;
  title?: string;
  titleTier?: number;
  titleStyle?: TitleStyleVariant;
  message: string;
  createdAt: string;
  role?: ChatRole;
  messageType?: ChatMessageType;
}

export interface ChatPinnedMessageEvent {
  id: string | null;
  message: string | null;
  pinnedBy: string;
  channelId: string;
}

export interface ChatPresenceEvent {
  worldOnline: number;
  zoneOnline: Record<string, number>;
}

export interface ChatErrorEvent {
  code: string;
  message: string;
}

export const CHAT_ACTIVITY_SCOPES = ['zone', 'global'] as const;
export type ChatActivityScope = (typeof CHAT_ACTIVITY_SCOPES)[number];

export const CHAT_ACTIVITY_EVENT_TYPES = [
  'rare_loot',
  'craft_crit',
  'zone_discovery',
  'achievement',
  'boss_defeat',
  'server_milestone',
] as const;
export type ChatActivityEventType = (typeof CHAT_ACTIVITY_EVENT_TYPES)[number];

export interface ChatActivityRecord {
  id: string;
  eventType: ChatActivityEventType;
  scope: ChatActivityScope;
  zoneId: string | null;
  actorPlayerId: string | null;
  actorUsername: string | null;
  subjectName: string | null;
  subjectRarity: string | null;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ChatNpcActivityReactionResponse {
  reaction: {
    activityId: string;
    eventType: ChatActivityEventType;
    line: string;
  } | null;
}
