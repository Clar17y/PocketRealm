import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameBootstrap } from './useGameBootstrap';
import { getInventory, getZoneEvents, getZones } from '@/lib/api';

const apiMocks = vi.hoisted(() => ({
  getCraftingRecipes: vi.fn(),
  getGameBootstrap: vi.fn(),
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

  it('refreshes inventory state from the inventory endpoint', async () => {
    const options = createOptions();
    const item = {
      id: 'item-fang',
      quantity: 2,
      rarity: 'common',
      template: {
        id: 'template-fang',
        name: 'Alpha Wolf Fang',
        itemType: 'resource',
      },
    };
    vi.mocked(getInventory).mockResolvedValue({
      data: {
        items: [item],
        capacity: 32,
        usedSlots: 4,
        materialTotals: { 'template-fang': 2 },
      },
      error: null,
    } as never);

    const { result } = renderHook(() => useGameBootstrap(options));

    await act(async () => {
      await result.current.refreshInventory();
    });

    expect(getInventory).toHaveBeenCalledTimes(1);
    expect(options.setInventory).toHaveBeenCalledWith([item]);
    expect(options.setInventoryCapacity).toHaveBeenCalledWith(32);
    expect(options.setInventoryUsedSlots).toHaveBeenCalledWith(4);
    expect(options.setMaterialTotals).toHaveBeenCalledWith({ 'template-fang': 2 });
  });

  it('loads initial game state with one bootstrap API call', async () => {
    apiMocks.getGameBootstrap.mockResolvedValue({
      data: {
        turns: { currentTurns: 42, timeToCapMs: null, lastRegenAt: '2026-06-24T08:00:00.000Z' },
        player: {
          player: {
            characterXp: 100,
            characterLevel: 3,
            attributePoints: 2,
            attributes: { vitality: 1, strength: 1, dexterity: 1, intelligence: 1, luck: 1, evasion: 1 },
            gold: 25,
            activeEncounterSiteId: null,
            createdAt: '2026-06-01T00:00:00.000Z',
            tutorialStep: 99,
          },
        },
        skills: { skills: [{ id: 'skill-1', skillType: 'mining', level: 2, xp: 5, dailyXpGained: 0 }] },
        zones: {
          zones: [],
          connections: [],
          undiscoveredZones: [],
          currentZoneId: 'zone-forest',
        },
        inventory: { items: [], capacity: 24, usedSlots: 0, materialTotals: {} },
        equipment: { equipment: [] },
        hp: { currentHp: 10, maxHp: 10, regenPerSecond: 1, isRecovering: false, recoveryCost: null },
        resources: {
          stamina: { current: 10, max: 10, regenPerRound: 1, regenPerSecond: 1, restHealPerTurn: 1 },
          mana: { current: 10, max: 10, regenPerRound: 1, regenPerSecond: 1, restHealPerTurn: 1 },
        },
        skillPoints: { availablePoints: 0, spentPoints: 0, allocations: [], trees: [] },
        buffs: { buffs: [{ id: 'buff-1', name: 'Well Fed' }] },
        expeditionCooldowns: { weeklyCooldowns: {}, betweenCooldown: null, hasActiveExpedition: false },
        zoneEvents: { events: [] },
        crafting: { recipes: [], zoneCraftingLevel: 0, zoneName: null },
        guild: null,
      },
      error: null,
    } as never);
    const options = createOptions();

    const { result } = renderHook(() => useGameBootstrap(options));

    await act(async () => {
      await result.current.loadAll();
    });

    expect(apiMocks.getGameBootstrap).toHaveBeenCalledTimes(1);
    expect(apiMocks.getTurns).not.toHaveBeenCalled();
    expect(apiMocks.getPlayer).not.toHaveBeenCalled();
    expect(apiMocks.getInventory).not.toHaveBeenCalled();
    expect(apiMocks.getCraftingRecipes).not.toHaveBeenCalled();
    expect(options.setTurns).toHaveBeenCalledWith(42);
    expect(options.setCharacterProgression).toHaveBeenCalledWith({
      characterXp: 100,
      characterLevel: 3,
      attributePoints: 2,
      attributes: { vitality: 1, strength: 1, dexterity: 1, intelligence: 1, luck: 1, evasion: 1 },
    });
    expect(options.setSkills).toHaveBeenCalledWith([
      { id: 'skill-1', skillType: 'mining', level: 2, xp: 5, dailyXpGained: 0 },
    ]);
    expect(options.setActiveBuffs).toHaveBeenCalledWith([{ id: 'buff-1', name: 'Well Fed' }]);
    expect(options.setGuildTaxRate).toHaveBeenCalledWith(0);
  });
});
