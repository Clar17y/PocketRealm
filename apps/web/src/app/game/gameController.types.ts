import type { EventModifierBadge, CombatActiveEvent } from '@/lib/api';
import type { CombatLogEntryResponse as LastCombatLogEntry } from '@/lib/api/combat';

export type { LastCombatLogEntry };

export type Screen =
  | 'home'
  | 'explore'
  | 'inventory'
  | 'combat'
  | 'settings'
  | 'skills'
  | 'equipment'
  | 'zones'
  | 'bestiary'
  | 'crafting'
  | 'forge'
  | 'gathering'
  | 'rest'
  | 'arena'
  | 'worldEvents'
  | 'achievements'
  | 'leaderboard'
  | 'guild'
  | 'friends'
  | 'mail'
  | 'templates'
  | 'talentTree'
  | 'casino'
  | 'training'
  | 'quests'
  | 'admin';

export interface PendingEncounter {
  encounterSiteId: string;
  zoneId: string;
  zoneName: string;
  mobFamilyId: string;
  mobFamilyName: string;
  siteName: string;
  size: string;
  totalMobs: number;
  aliveMobs: number;
  defeatedMobs: number;
  decayedMobs: number;
  nextMobTemplateId: string | null;
  nextMobName: string | null;
  nextMobPrefix: string | null;
  nextMobDisplayName: string | null;
  discoveredAt: string;
  clearStrategy: string | null;
  currentRoom: number;
  totalRooms: number;
  roomMobCounts: Array<{ room: number; alive: number; total: number }>;
  currentRoomMobs: Array<{ slot: number; name: string; prefix: string | null; hp: number; maxHp: number }>;
  eventModifiers?: EventModifierBadge[];
  totalTurnCost: number;
}

export type CombatPlaybackItem = {
  mobName: string;
  mobDisplayName: string;
  mobTemplateId: string;
  mobPrefix: string | null;
  outcome: string;
  combatantAMaxHp: number;
  combatantBMaxHp: number;
  log: LastCombatLogEntry[] | null;
  combatLogId?: string;
};

export type CombatPlaybackQueueItem = CombatPlaybackItem & {
  room?: number;
  playerStartHp: number;
  playerStartStamina?: number;
  playerStartMana?: number;
  rewards: LastCombat['rewards'];
  activeEvents?: CombatActiveEvent[];
};

export interface LastCombat {
  mobTemplateId: string;
  mobPrefix: string | null;
  mobName: string;
  mobDisplayName: string;
  outcome: string;
  combatantAMaxHp: number;
  combatantBMaxHp: number;
  log: LastCombatLogEntry[];
  fights?: Array<{
    mobName: string;
    mobDisplayName: string;
    mobTemplateId: string;
    mobPrefix: string | null;
    outcome: string;
    combatantAMaxHp: number;
    combatantBMaxHp: number;
    log: LastCombatLogEntry[];
    combatLogId?: string;
  }> | null;
  rewards: {
    xp: number;
    loot: Array<{
      itemTemplateId: string;
      quantity: number;
      rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
      itemName?: string | null;
    }>;
    siteCompletion?: {
      chestRarity: 'common' | 'uncommon' | 'rare';
      materialRolls: number;
      loot: Array<{
        itemTemplateId: string;
        quantity: number;
        rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
        itemName?: string | null;
      }>;
      recipeUnlocked: {
        recipeId: string;
        resultTemplateId: string;
        recipeName: string;
        soulbound: boolean;
      } | null;
      fullClearBonus?: boolean;
    } | null;
    skillXpGrants: Array<{
      skillType: string;
      xpGained: number;
      xpAfterEfficiency: number;
      efficiency: number;
      leveledUp: boolean;
      newLevel: number;
      characterXpGain: number;
      characterXpAfter: number;
      characterLevelBefore: number;
      characterLevelAfter: number;
      attributePointsAfter: number;
      characterLeveledUp: boolean;
    }>;
  };
}

export type BestiarySkipEntry = {
  id: string;
  isDiscovered: boolean;
  prefixesEncountered: string[];
};

export type ActivityLogEntry = {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'danger' | 'warning';
};

export interface CharacterProgression {
  characterXp: number;
  characterLevel: number;
  attributePoints: number;
  attributes: {
    vitality: number;
    strength: number;
    dexterity: number;
    intelligence: number;
    luck: number;
    evasion: number;
  };
}

export interface HpState {
  currentHp: number;
  maxHp: number;
  regenPerSecond: number;
  isRecovering: boolean;
  recoveryCost: number | null;
}

export const DEFAULT_CHARACTER_PROGRESSION: CharacterProgression = {
  characterXp: 0,
  characterLevel: 1,
  attributePoints: 0,
  attributes: {
    vitality: 0,
    strength: 0,
    dexterity: 0,
    intelligence: 0,
    luck: 0,
    evasion: 0,
  },
};
