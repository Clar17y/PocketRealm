export type FriendshipStatus = 'pending' | 'accepted';

export interface FriendListEntry {
  friendshipId: string;
  playerId: string;
  username: string;
  characterLevel: number;
  isOnline: boolean;
}

export interface FriendRequest {
  friendshipId: string;
  playerId: string;
  username: string;
  characterLevel: number;
  createdAt: string;
}

export interface FriendProfile {
  playerId: string;
  username: string;
  characterLevel: number;
  isOnline: boolean;
  equipment: FriendEquipmentSlot[];
}

export interface FriendEquipmentSlot {
  slot: string;
  itemName: string | null;
  rarity: string | null;
}

export interface BlockedPlayer {
  blockId: string;
  playerId: string;
  username: string;
  createdAt: string;
}

export interface FriendMailEntry {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  subject: string;
  body: string;
  goldCost: number;
  isSystem: boolean;
  isRead: boolean;
  createdAt: string;
}
