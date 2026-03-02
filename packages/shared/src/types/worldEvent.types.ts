export type WorldEventType = 'resource' | 'mob' | 'boss';
export type WorldEventStatus = 'active' | 'completed' | 'expired';
export type WorldEventSource = 'system' | 'player_discovery';

export type MobEffectType =
  | 'spawn_rate_up'
  | 'spawn_rate_down'
  | 'damage_up'
  | 'damage_down'
  | 'hp_up'
  | 'hp_down';

export type ResourceEffectType = 'drop_rate_up' | 'drop_rate_down' | 'yield_up' | 'yield_down';

export type WorldEventEffectType = MobEffectType | ResourceEffectType;

export type BossEncounterStatus = 'waiting' | 'in_progress' | 'defeated' | 'expired';
export type BossParticipantStatus = 'alive' | 'knocked_out';

export interface BossActiveEffect {
  name: string;
  stat: string;
  modifier: number;
  roundsRemaining: number;
}

export type WorldEventScope = 'zone' | 'world';

export interface WorldEventData {
  id: string;
  type: WorldEventType;
  scope: WorldEventScope;
  zoneId: string | null;
  zoneName: string | null;
  title: string;
  description: string;
  effectType: WorldEventEffectType;
  effectValue: number;
  targetMobId: string | null;
  targetFamily: string | null;
  targetResource: string | null;
  startedAt: string;
  expiresAt: string | null;
  status: WorldEventStatus;
  createdBy: WorldEventSource;
}

export interface BossRoundSummary {
  round: number;
  bossDamage: number;
  totalPlayerDamage: number;
  bossHpPercent: number;
  playersAlive: number;
  playersDead: number;
}

export interface BossPlayerReward {
  loot: Array<{
    itemTemplateId: string;
    quantity: number;
    rarity?: string;
    itemName?: string;
  }>;
  xp?: {
    skillType: string;
    rawXp: number;
    xpAfterEfficiency: number;
    leveledUp: boolean;
    newLevel: number;
  };
  recipeUnlocked?: {
    recipeId: string;
    recipeName: string;
    soulbound: boolean;
  };
}

export interface BossEncounterData {
  id: string;
  eventId: string;
  mobTemplateId: string;
  currentHp: number;
  maxHp: number;
  baseHp: number;
  bossEffects: BossActiveEffect[];
  roundNumber: number;
  nextRoundAt: string | null;
  status: BossEncounterStatus;
  killedBy: string | null;
  roundSummaries: BossRoundSummary[] | null;
  rewardsByPlayer: Record<string, BossPlayerReward> | null;
}

export interface BossParticipantData {
  id: string;
  encounterId: string;
  playerId: string;
  roundNumber: number;
  turnsCommitted: number;
  totalDamage: number;
  totalHealing: number;
  attacks: number;
  hits: number;
  crits: number;
  autoSignUp: boolean;
  currentHp: number;
  currentStamina: number;
  currentMana: number;
  threat: number;
  damageAbsorbed: number;
  templateRound: number;
  status: BossParticipantStatus;
}

export interface PersistedMobData {
  id: string;
  playerId: string;
  mobTemplateId: string;
  zoneId: string;
  currentHp: number;
  maxHp: number;
  damagedAt: string;
}

export interface ActiveZoneModifiers {
  mobDamageMultiplier: number;
  mobHpMultiplier: number;
  mobSpawnRateMultiplier: number;
  resourceDropRateMultiplier: number;
  resourceYieldMultiplier: number;
}
