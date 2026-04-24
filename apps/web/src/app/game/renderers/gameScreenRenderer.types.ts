import type { ExpeditionContext } from '@/lib/assets';
import type { CharacterSummary, SeasonArchiveSummary } from '@/lib/api';
import type { useCasinoSocket } from '@/hooks/useCasinoSocket';
import type { usePushNotifications } from '@/hooks/usePushNotifications';
import type { useGameController } from '../useGameController';

export type GameControllerState = ReturnType<typeof useGameController>;

export interface GameScreenPlayer {
  id?: string;
  username?: string;
  role?: string;
  email?: string;
  emailVerified?: boolean;
  seasonId?: string | null;
  isPremium?: boolean;
  premiumExpiresAt?: string | null;
}

export interface MailRecipient {
  id: string;
  name: string;
}

export interface GameScreenRendererProps {
  gc: GameControllerState;
  player: GameScreenPlayer | null;
  seasonArchives: SeasonArchiveSummary[];
  realmLabel: string;
  realmEndsAt: string | Date | null;
  activePlayerId: string | null;
  characters: CharacterSummary[];
  switchingPlayerId: string | null;
  onSwitchPlayer: (playerId: string) => void;
  casinoSocket: ReturnType<typeof useCasinoSocket>;
  achievementCategory: string | null;
  setAchievementCategory: (category: string | null) => void;
  expeditionContext: ExpeditionContext | null;
  setExpeditionContext: (context: ExpeditionContext | null) => void;
  mailRecipient: MailRecipient | null;
  setMailRecipient: (recipient: MailRecipient | null) => void;
  deepLinkTab: string | null;
  pushState: ReturnType<typeof usePushNotifications>['state'];
  pushToggle: ReturnType<typeof usePushNotifications>['toggle'];
  onLogout: () => void;
  onAccountRefresh: () => Promise<void>;
  onForceRelogin: () => void;
}
