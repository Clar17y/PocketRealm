export type ChatChannelType = 'world' | 'zone' | 'guild' | 'casino';

export interface ChatSendPayload {
  channelType: ChatChannelType;
  channelId: string;
  message: string;
}

export type ChatRole = 'player' | 'admin' | 'moderator';
export type ChatMessageType = 'player' | 'system';

export interface ChatMessageEvent {
  id: string;
  channelType: ChatChannelType;
  channelId: string;
  playerId: string;
  username: string;
  title?: string;
  titleTier?: number;
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
