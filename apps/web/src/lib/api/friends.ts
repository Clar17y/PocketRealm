import { fetchApi } from './core';
import type { FriendListEntry, FriendRequest, FriendProfile, BlockedPlayer, FriendMailEntry } from '@pocketrealm/shared';
import type { CombatOutcomeResponse, CombatLogEntryResponse } from './combat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SparResponse {
  winnerId: string | null;
  isDraw: boolean;
  attackerName: string;
  defenderName: string;
  attackerHpRemaining: number;
  defenderHpRemaining: number;
  combat: {
    outcome: CombatOutcomeResponse;
    log: CombatLogEntryResponse[];
  };
}

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

export async function getFriendsList() {
  return fetchApi<{ friends: FriendListEntry[] }>('/api/v1/friends');
}

export async function sendFriendRequest(targetId: string) {
  return fetchApi<{ friendshipId: string }>('/api/v1/friends/request', {
    method: 'POST',
    body: JSON.stringify({ targetId }),
  });
}

export async function searchPlayerByUsername(username: string) {
  return fetchApi<{ player: { id: string; username: string; characterLevel: number } | null }>(
    '/api/v1/friends/request/search',
    {
      method: 'POST',
      body: JSON.stringify({ username }),
    },
  );
}

export async function getIncomingFriendRequests() {
  return fetchApi<{ requests: FriendRequest[] }>('/api/v1/friends/requests/incoming');
}

export async function getOutgoingFriendRequests() {
  return fetchApi<{ requests: FriendRequest[] }>('/api/v1/friends/requests/outgoing');
}

export async function acceptFriendRequest(friendshipId: string) {
  return fetchApi<{ success: boolean }>(`/api/v1/friends/requests/${friendshipId}/accept`, {
    method: 'POST',
  });
}

export async function declineFriendRequest(friendshipId: string) {
  return fetchApi<{ success: boolean }>(`/api/v1/friends/requests/${friendshipId}/decline`, {
    method: 'POST',
  });
}

export async function unfriend(friendshipId: string) {
  return fetchApi<{ success: boolean }>(`/api/v1/friends/${friendshipId}`, {
    method: 'DELETE',
  });
}

export async function getFriendProfile(friendshipId: string) {
  return fetchApi<{ profile: FriendProfile }>(`/api/v1/friends/${friendshipId}/profile`);
}

// ---------------------------------------------------------------------------
// Spar
// ---------------------------------------------------------------------------

export async function sparFriend(friendshipId: string) {
  return fetchApi<SparResponse>(`/api/v1/friends/${friendshipId}/spar`, {
    method: 'POST',
  });
}

// ---------------------------------------------------------------------------
// Block
// ---------------------------------------------------------------------------

export async function blockPlayer(targetId: string) {
  return fetchApi<{ blockId: string }>('/api/v1/friends/block', {
    method: 'POST',
    body: JSON.stringify({ targetId }),
  });
}

export async function unblockPlayer(blockId: string) {
  return fetchApi<{ success: boolean }>(`/api/v1/friends/block/${blockId}`, {
    method: 'DELETE',
  });
}

export async function getBlockList() {
  return fetchApi<{ blocked: BlockedPlayer[] }>('/api/v1/friends/block');
}

// ---------------------------------------------------------------------------
// Mail
// ---------------------------------------------------------------------------

export async function sendFriendMail(recipientId: string, subject: string, body: string) {
  return fetchApi<{ mail: FriendMailEntry }>('/api/v1/friends/mail', {
    method: 'POST',
    body: JSON.stringify({ recipientId, subject, body }),
  });
}

export async function getFriendMailInbox(page = 1) {
  return fetchApi<{
    mail: FriendMailEntry[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }>(`/api/v1/friends/mail/inbox?page=${page}`);
}

export async function getFriendMailSent(page = 1) {
  return fetchApi<{
    mail: FriendMailEntry[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }>(`/api/v1/friends/mail/sent?page=${page}`);
}

export async function getFriendMailUnreadCount() {
  return fetchApi<{ count: number }>('/api/v1/friends/mail/unread-count');
}

export async function readFriendMail(mailId: string) {
  return fetchApi<{ mail: FriendMailEntry }>(`/api/v1/friends/mail/${mailId}`);
}

export async function deleteFriendMail(mailId: string) {
  return fetchApi<{ success: boolean }>(`/api/v1/friends/mail/${mailId}`, {
    method: 'DELETE',
  });
}
