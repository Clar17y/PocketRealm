import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameBootstrap } from './useGameBootstrap';
import { getZoneEvents, getZones } from '@/lib/api';

const apiMocks = vi.hoisted(() => ({
  getCraftingRecipes: vi.fn(),
  getEquipment: vi.fn(),
  getExpeditionCooldowns: vi.fn(),
  getHpState: vi.fn(),
  getInventory: vi.fn(),
  getPlayer: vi.fn(),
  getPlayerBuffs: vi.fn(),
  getPlayerGuild: vi.fn(),
  getResources: vi.fn(),
  getSkillPointState: vi.fn(),
  getSkills: vi.fn(),
  getTemplates: vi.fn(),
  getTurns: vi.fn(),
  getVocations: vi.fn(),
  getZoneEvents: vi.fn(),
  getZones: vi.fn(),
  allocateSkillPoint: vi.fn(),
  respecSkillPoints: vi.fn(),
  updateTutorialStep: vi.fn(),
}));

vi.mock('@/lib/api', () => apiMocks);

vi.mock('@/lib/assets', () => ({
  itemImageSrc: vi.fn(() => undefined),
}));

vi.mock('@/lib/changelog', () => ({
  getLatestVersion: vi.fn(() => '0.0.0'),
  CHANGELOG_STORAGE_KEY: 'changelog',
}));

vi.mock('@/lib/rarity', () => ({
  RARITY_RANK: { uncommon: 1, rare: 2, epic: 3, legendary: 4 },
}));

function createOptions() {
  return {
    tutorialStep: 0,
    activeZoneIdRef: { current: 'zone-forest' },
    playerCreatedAtRef: { current: null },
    hasLoadedOnceRef: { current: false },
    prevInventoryIdsRef: { current: new Set<string>() },
    lootRevealRarityRef: { current: 'rare' },
    initSettingsFromServer: vi.fn(),
    setActionError: vi.fn(),
    setTurns: vi.fn(),
    setCharacterProgression: vi.fn(),
    setGold: vi.fn(),
    setActiveEncounterSiteId: vi.fn(),
    setTutorialStep: vi.fn(),
    setShowChangelog: vi.fn(),
    setSkills: vi.fn(),
    setHpState: vi.fn(),
    setStaminaState: vi.fn(),
    setManaState: vi.fn(),
    setSkillPointState: vi.fn(),
    setActiveBuffs: vi.fn(),
    setHasActiveExpedition: vi.fn(),
    setZones: vi.fn(),
    setZoneConnections: vi.fn(),
    setUndiscoveredZones: vi.fn(),
    setActiveZoneId: vi.fn(),
    setActiveEvents: vi.fn(),
    setInventory: vi.fn(),
    setInventoryCapacity: vi.fn(),
    setInventoryUsedSlots: vi.fn(),
    setMaterialTotals: vi.fn(),
    setLootRevealItems: vi.fn(),
    setEquipment: vi.fn(),
    setCraftingRecipes: vi.fn(),
    setZoneCraftingLevel: vi.fn(),
    setZoneCraftingName: vi.fn(),
    setTemplates: vi.fn(),
    setGuildTaxRate: vi.fn(),
    setVocations: vi.fn(),
  };
}

describe('useGameBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getZones).mockResolvedValue({
      data: {
        zones: [
          {
            id: 'zone-forest',
            name: 'Forest Edge',
            description: null,
            difficulty: 1,
            travelCost: 10,
            isStarter: true,
            discovered: true,
            zoneType: 'wild',
            zoneExitChance: null,
            maxCraftingLevel: null,
            arrivalText: null,
            ambientTexts: null,
            environmentalTexts: null,
            exploration: null,
          },
        ],
        connections: [],
        undiscoveredZones: [],
        currentZoneId: 'zone-forest',
      },
      error: null,
    } as never);
    vi.mocked(getZoneEvents).mockResolvedValue({ data: { events: [] }, error: null } as never);
  });

  it('ignores stale zone reloads after the active zone has changed', async () => {
    const options = createOptions();
    options.activeZoneIdRef.current = 'zone-cave';

    const { result } = renderHook(() => useGameBootstrap(options));

    await act(async () => {
      await result.current.reloadZones({ expectedActiveZoneId: 'zone-forest' });
    });

    expect(getZones).toHaveBeenCalledTimes(1);
    expect(options.setZones).not.toHaveBeenCalled();
    expect(getZoneEvents).not.toHaveBeenCalled();
  });

  it('loads vocation snapshot during the initial game bootstrap', async () => {
    const options = createOptions();
    apiMocks.getTurns.mockResolvedValue({ data: { currentTurns: 250 } });
    apiMocks.getPlayer.mockResolvedValue({
      data: {
        player: {
          characterXp: 0,
          characterLevel: 1,
          attributePoints: 0,
          attributes: { vitality: 0, strength: 0, dexterity: 0, intelligence: 0, luck: 0, evasion: 0 },
          gold: 0,
          activeEncounterSiteId: null,
          createdAt: '2026-05-21T00:00:00.000Z',
          tutorialStep: 999,
        },
      },
    });
    apiMocks.getSkills.mockResolvedValue({ data: { skills: [] } });
    apiMocks.getInventory.mockResolvedValue({ data: { items: [], capacity: 24, usedSlots: 0, materialTotals: {} } });
    apiMocks.getEquipment.mockResolvedValue({ data: { equipment: [] } });
    apiMocks.getHpState.mockResolvedValue({ data: { currentHp: 100, maxHp: 100, regenPerSecond: 1, isRecovering: false, recoveryCost: null } });
    apiMocks.getResources.mockResolvedValue({
      data: {
        stamina: { current: 100, max: 100, regenPerSecond: 1, lastRegenAt: '2026-05-21T00:00:00.000Z' },
        mana: { current: 100, max: 100, regenPerSecond: 1, lastRegenAt: '2026-05-21T00:00:00.000Z' },
      },
    });
    apiMocks.getSkillPointState.mockResolvedValue({ data: { availablePoints: 0 } });
    apiMocks.getPlayerBuffs.mockResolvedValue({ data: { buffs: [] } });
    apiMocks.getExpeditionCooldowns.mockResolvedValue({ data: { hasActiveExpedition: false } });
    apiMocks.getCraftingRecipes.mockResolvedValue({ data: { recipes: [], zoneCraftingLevel: null, zoneName: null } });
    apiMocks.getPlayerGuild.mockResolvedValue({ data: { guild: null } });
    apiMocks.getVocations.mockResolvedValue({
      data: {
        playerId: 'player-1',
        vocations: [],
        dailyCap: {
          dayStart: '2026-05-21T00:00:00.000Z',
          turnsSpent: 0,
          turnsLimit: 100,
          turnsRemaining: 100,
        },
      },
    });

    const { result } = renderHook(() => useGameBootstrap(options));

    await act(async () => {
      await result.current.loadAll();
    });

    expect(apiMocks.getVocations).toHaveBeenCalledTimes(1);
    expect(options.setVocations).toHaveBeenCalledWith({
      playerId: 'player-1',
      vocations: [],
      dailyCap: {
        dayStart: '2026-05-21T00:00:00.000Z',
        turnsSpent: 0,
        turnsLimit: 100,
        turnsRemaining: 100,
      },
    });
  });
});
