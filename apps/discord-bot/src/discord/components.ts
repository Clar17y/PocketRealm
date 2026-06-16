import {
  isDiscordNotificationType,
  type DiscordNotificationType,
} from '@pocketrealm/shared/discord/discordNotifications';

export interface ParsedSupportButtonId {
  action: string;
  publicId: string;
}

export type ParsedDuelButtonId =
  | {
    action: 'accept' | 'decline';
    duelId: string;
    targetDiscordUserId: string;
  }
  | {
    action: 'replay';
    duelId: string;
    page: number;
  }
  | {
    action: 'builds' | 'rematch';
    duelId: string;
  };

export function supportButtonId(action: string, publicId: string): string {
  return `support:${action}:${publicId}`;
}

export function parseSupportButtonId(customId: string): ParsedSupportButtonId | null {
  const parts = customId.split(':');
  if (parts.length !== 3) {
    return null;
  }

  const [scope, action, publicId] = parts;
  if (scope !== 'support' || !action || !publicId) {
    return null;
  }

  return { action, publicId };
}

export function duelAcceptButtonId(duelId: string, targetDiscordUserId: string): string {
  return duelTargetButtonId('accept', duelId, targetDiscordUserId);
}

export function duelDeclineButtonId(duelId: string, targetDiscordUserId: string): string {
  return duelTargetButtonId('decline', duelId, targetDiscordUserId);
}

export function duelReplayButtonId(duelId: string, page: number): string {
  return `duel:replay:${duelId}:${page}`;
}

export function duelBuildsButtonId(duelId: string): string {
  return `duel:builds:${duelId}`;
}

export function duelRematchButtonId(duelId: string): string {
  return `duel:rematch:${duelId}`;
}

export function parseDuelButtonId(customId: string): ParsedDuelButtonId | null {
  const parts = customId.split(':');
  const [scope, action, duelId] = parts;
  if (scope !== 'duel' || !action || !duelId) {
    return null;
  }

  if (action === 'accept' || action === 'decline') {
    if (parts.length !== 4 || !parts[3]) {
      return null;
    }

    return { action, duelId, targetDiscordUserId: parts[3] };
  }

  if (action === 'replay') {
    if (parts.length !== 4 || !/^[1-9]\d*$/.test(parts[3] ?? '')) {
      return null;
    }

    return { action, duelId, page: Number.parseInt(parts[3], 10) };
  }

  if (action === 'builds' || action === 'rematch') {
    if (parts.length !== 3) {
      return null;
    }

    return { action, duelId };
  }

  return null;
}

function duelTargetButtonId(
  action: 'accept' | 'decline',
  duelId: string,
  targetDiscordUserId: string,
): string {
  return `duel:${action}:${duelId}:${targetDiscordUserId}`;
}

export interface ParsedNotifyButtonId {
  type: DiscordNotificationType;
  nextEnabled: boolean;
}

export function notifyToggleButtonId(type: DiscordNotificationType, nextEnabled: boolean): string {
  return `notify:toggle:${type}:${nextEnabled ? '1' : '0'}`;
}

export function parseNotifyButtonId(customId: string): ParsedNotifyButtonId | null {
  const parts = customId.split(':');
  if (parts.length !== 4) {
    return null;
  }

  const [scope, action, type, nextEnabled] = parts;
  if (scope !== 'notify' || action !== 'toggle' || !isDiscordNotificationType(type)) {
    return null;
  }

  if (nextEnabled !== '0' && nextEnabled !== '1') {
    return null;
  }

  return { type, nextEnabled: nextEnabled === '1' };
}
