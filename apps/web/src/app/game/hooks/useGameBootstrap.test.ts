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
});
