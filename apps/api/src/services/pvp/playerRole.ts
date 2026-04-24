export interface PlayerRoleSource {
  role?: string | null;
  account?: {
    role?: string | null;
  } | null;
}

export function getPlayerRole(player: PlayerRoleSource): string {
  return player.account?.role ?? player.role ?? 'player';
}
