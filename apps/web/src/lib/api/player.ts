import { fetchApi, type TurnStateResponse } from './core';

export async function getPlayer() {
  return fetchApi<{
    player: {
      id: string;
      username: string;
      email: string;
      role: string;
      createdAt: string;
      characterXp: number;
      characterLevel: number;
      attributePoints: number;
      autoPotionThreshold: number;
      tutorialStep: number;
      combatLogSpeedMs: number;
      explorationSpeedMs: number;
      autoSkipKnownCombat: boolean;
      defaultExploreTurns: number;
      quickRestHealPercent: number;
      defaultRefiningMax: boolean;
      attributes: {
        vitality: number;
        strength: number;
        dexterity: number;
        intelligence: number;
        luck: number;
        evasion: number;
      };
    };
  }>('/api/v1/player');
}

export interface PlayerSettings {
  autoPotionThreshold?: number;
  combatLogSpeedMs?: number;
  explorationSpeedMs?: number;
  autoSkipKnownCombat?: boolean;
  defaultExploreTurns?: number;
  quickRestHealPercent?: number;
  defaultRefiningMax?: boolean;
}

export async function updatePlayerSettings(settings: PlayerSettings) {
  return fetchApi<PlayerSettings>('/api/v1/player/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

export async function updateTutorialStep(step: number) {
  return fetchApi<{ tutorialStep: number }>('/api/v1/player/tutorial', {
    method: 'PATCH',
    body: JSON.stringify({ step }),
  });
}

export async function getPlayerAttributes() {
  return fetchApi<{
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
  }>('/api/v1/player/attributes');
}

export async function allocatePlayerAttribute(
  attribute: 'vitality' | 'strength' | 'dexterity' | 'intelligence' | 'luck' | 'evasion',
  points: number = 1
) {
  return fetchApi<{
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
  }>('/api/v1/player/attributes', {
    method: 'POST',
    body: JSON.stringify({ attribute, points }),
  });
}

export async function getSkills() {
  return fetchApi<{
    skills: Array<{
      skillType: string;
      level: number;
      xp: number;
      dailyXpGained: number;
    }>;
  }>('/api/v1/player/skills');
}

export async function getEquipment() {
  return fetchApi<{
    equipment: Array<{
      playerId: string;
      slot: string;
      itemId: string | null;
      item: null | {
        id: string;
        templateId: string;
        ownerId: string;
        rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
        currentDurability: number | null;
        maxDurability: number | null;
        quantity: number;
        bonusStats: Record<string, number> | null;
        createdAt: string;
        template: {
          id: string;
          name: string;
          itemType: string;
          weightClass: 'heavy' | 'medium' | 'light' | null;
          slot: string | null;
          tier: number;
          baseStats: Record<string, unknown>;
          requiredSkill: string | null;
          requiredLevel: number;
          maxDurability: number;
          stackable: boolean;
        };
      };
    }>;
  }>('/api/v1/player/equipment');
}

export async function getBestiary() {
  return fetchApi<{
    mobs: Array<{
      id: string;
      name: string;
      level: number;
      isDiscovered: boolean;
      killCount: number;
      stats: { hp: number; accuracy: number; defence: number };
      zones: string[];
      description: string;
      drops: Array<{
        item: { id: string; name: string; itemType: string; tier: number };
        rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
        dropRate: number;
        minQuantity: number;
        maxQuantity: number;
      }>;
      prefixesEncountered: string[];
      explorationTier: number;
      tierLocked: boolean;
    }>;
    prefixSummary: Array<{
      prefix: string;
      displayName: string;
      totalKills: number;
      discovered: boolean;
    }>;
  }>('/api/v1/bestiary');
}

export async function getTurns() {
  return fetchApi<{
    currentTurns: number;
    timeToCapMs: number | null;
    lastRegenAt: string;
  }>('/api/v1/turns');
}

export async function spendTurns(amount: number, reason?: string) {
  return fetchApi<{
    previousTurns: number;
    spent: number;
    currentTurns: number;
  }>('/api/v1/turns/spend', {
    method: 'POST',
    body: JSON.stringify({ amount, reason }),
  });
}

export async function getHpState() {
  return fetchApi<{
    currentHp: number;
    maxHp: number;
    regenPerSecond: number;
    lastHpRegenAt: string;
    isRecovering: boolean;
    recoveryCost: number | null;
  }>('/api/v1/hp');
}

export async function restEstimate(turns: number) {
  return fetchApi<{
    isRecovering: boolean;
    recoveryCost?: number;
    recoveryExitHp?: number;
    currentHp?: number;
    maxHp?: number;
    healPerTurn?: number;
    turnsRequested?: number;
    turnsNeeded?: number;
    healAmount?: number;
    resultingHp?: number;
  }>(`/api/v1/hp/rest/estimate?turns=${turns}`);
}

export async function rest(turns: number) {
  return fetchApi<{
    previousHp: number;
    healedAmount: number;
    currentHp: number;
    maxHp: number;
    turnsSpent: number;
    turns: TurnStateResponse;
  }>('/api/v1/hp/rest', {
    method: 'POST',
    body: JSON.stringify({ turns }),
  });
}

export async function recoverFromKnockout() {
  return fetchApi<{
    previousState: 'recovering';
    currentHp: number;
    maxHp: number;
    turnsSpent: number;
    turns: TurnStateResponse;
  }>('/api/v1/hp/recover', {
    method: 'POST',
  });
}
