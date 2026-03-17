import { fetchApi, type TurnStateResponse, type TaxInfo } from './core';
import type { StateUpdates, SkillStateDTO } from '@pocketrealm/shared';

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
      tutorialStep: number;
      combatLogSpeedMs: number;
      explorationSpeedMs: number;
      autoSkipKnownCombat: boolean;
      defaultExploreTurns: number;
      quickRestHealPercent: number;
      defaultRefiningMax: boolean;
      lowHpWarning: boolean;
      confirmRarity: 'none' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
      lootRevealRarity: 'none' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
      gold: number;
      homeTownId: string | null;
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
  combatLogSpeedMs?: number;
  explorationSpeedMs?: number;
  autoSkipKnownCombat?: boolean;
  defaultExploreTurns?: number;
  quickRestHealPercent?: number;
  defaultRefiningMax?: boolean;
  lowHpWarning?: boolean;
  confirmRarity?: 'none' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  lootRevealRarity?: 'none' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  forgeConfirmRarity?: 'none' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  homeTownId?: string;
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
    skills: SkillStateDTO[];
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
      bossRotation?: {
        totalRounds: number;
        revealedRounds: number;
        actions: Array<{
          round: number;
          actionName: string;
          targetMode: 'single_target' | 'aoe';
          isTelegraphed: boolean;
        }>;
      };
    }>;
    prefixSummary: Array<{
      prefix: string;
      displayName: string;
      totalKills: number;
      discovered: boolean;
    }>;
  }>('/api/v1/bestiary');
}

export async function getExpeditionBestiary() {
  return fetchApi<{
    themes: Array<{
      theme: string;
      themeName: string;
      attempted: boolean;
      mobs: Array<{
        mobTemplateId: string;
        name: string;
        role: 'trash' | 'elite' | 'caster' | 'add' | 'mini_boss' | 'final_boss';
        killCount: number;
        stats: { hp: number; attack: number; defence: number } | null;
        rotation: Array<{ round: number; actionName: string; targetMode: string }> | null;
      }>;
    }>;
  }>('/api/v1/bestiary/expeditions');
}

export async function getWorldBossBestiary() {
  return fetchApi<{
    bosses: Array<{
      bossTemplateId: string;
      name: string;
      defeatCount: number;
      hpPerParticipant: number | null;
      stats: { accuracy: number; defence: number } | null;
      rotation: Array<{ round: number; actionName: string; targetMode: string; isTelegraphed: boolean }> | null;
    }>;
  }>('/api/v1/bestiary/bosses');
}

export async function getTurns() {
  return fetchApi<{
    currentTurns: number;
    timeToCapMs: number | null;
    lastRegenAt: string;
  }>('/api/v1/turns');
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
    effectiveTurns?: number;
    turnsNeeded?: number;
    healAmount?: number;
    resultingHp?: number;
    taxRate?: number;
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
    tax: TaxInfo | null;
    stateUpdates?: StateUpdates;
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

export async function claimStarterWeapon(weaponType: 'melee' | 'ranged' | 'magic') {
  return fetchApi<{ success: true; itemId: string; weaponType: string }>(
    '/api/v1/player/starter-weapon',
    {
      method: 'POST',
      body: JSON.stringify({ weaponType }),
    },
  );
}
