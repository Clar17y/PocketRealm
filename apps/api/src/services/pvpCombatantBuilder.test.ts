import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';

// ── Mocks ────────────────────────────────────────────────────────────

vi.mock('@pocketrealm/game-engine', () => ({
  buildPlayerCombatStats: vi.fn(),
  calculateMaxHp: vi.fn(),
  calculateMaxStamina: vi.fn(),
  calculateStaminaRegenPerRound: vi.fn(),
  calculateMaxMana: vi.fn(),
  calculateManaRegenPerRound: vi.fn(),
}));

vi.mock('./attributesService', () => ({
  normalizePlayerAttributes: vi.fn(),
}));

vi.mock('./combatOrchestrationService', () => ({
  buildPlayerTemplateCombatant: vi.fn(),
}));

vi.mock('./combatStatsService', () => ({
  getSkillLevels: vi.fn(),
  getMainHandAttackSkill: vi.fn(),
  buildPerActionScaling: vi.fn(),
}));

vi.mock('./combatTemplateService', () => ({
  getActiveTemplate: vi.fn(),
}));

vi.mock('./equipmentService', () => ({
  getEquipmentStats: vi.fn(),
}));

vi.mock('./hpService', () => ({
  getHpState: vi.fn(),
}));

vi.mock('./resourceService', () => ({
  getResourceState: vi.fn(),
}));

vi.mock('./skillPointService', () => ({
  getSkillPoints: vi.fn(),
}));

// ── Imports (after mocks) ────────────────────────────────────────────

import { getAttackStyle, buildPvpCombatant } from './pvpCombatantBuilder';
import {
  buildPlayerCombatStats,
  calculateMaxHp,
  calculateMaxStamina,
  calculateStaminaRegenPerRound,
  calculateMaxMana,
  calculateManaRegenPerRound,
} from '@pocketrealm/game-engine';
import { normalizePlayerAttributes } from './attributesService';
import { buildPlayerTemplateCombatant } from './combatOrchestrationService';
import { getSkillLevels, getMainHandAttackSkill, buildPerActionScaling } from './combatStatsService';
import { getActiveTemplate } from './combatTemplateService';
import { getEquipmentStats } from './equipmentService';
import { getHpState } from './hpService';
import { getResourceState } from './resourceService';
import { getSkillPoints } from './skillPointService';

const mockBuildPlayerCombatStats = vi.mocked(buildPlayerCombatStats);
const mockCalculateMaxHp = vi.mocked(calculateMaxHp);
const mockCalculateMaxStamina = vi.mocked(calculateMaxStamina);
const mockCalculateStaminaRegenPerRound = vi.mocked(calculateStaminaRegenPerRound);
const mockCalculateMaxMana = vi.mocked(calculateMaxMana);
const mockCalculateManaRegenPerRound = vi.mocked(calculateManaRegenPerRound);
const mockNormalizePlayerAttributes = vi.mocked(normalizePlayerAttributes);
const mockBuildPlayerTemplateCombatant = vi.mocked(buildPlayerTemplateCombatant);
const mockGetSkillLevels = vi.mocked(getSkillLevels);
const mockGetMainHandAttackSkill = vi.mocked(getMainHandAttackSkill);
const mockBuildPerActionScaling = vi.mocked(buildPerActionScaling);
const mockGetActiveTemplate = vi.mocked(getActiveTemplate);
const mockGetEquipmentStats = vi.mocked(getEquipmentStats);
const mockGetHpState = vi.mocked(getHpState);
const mockGetResourceState = vi.mocked(getResourceState);
const mockGetSkillPoints = vi.mocked(getSkillPoints);

// ── Helpers ──────────────────────────────────────────────────────────

const PLAYER_ID = 'player-1';
const USERNAME = 'TestHero';

function fakeEquipmentStats(overrides?: Partial<Record<string, number>>) {
  return {
    attack: 10, rangedPower: 8, magicPower: 12,
    accuracy: 5, armor: 6, magicDefence: 4,
    health: 20, dodge: 3, luck: 1,
    critChance: 0.05, critDamage: 1.5, inventorySlots: 0,
    ...overrides,
  };
}

function fakeAttributes(overrides?: Partial<Record<string, number>>) {
  return {
    vitality: 5, strength: 10, dexterity: 8,
    intelligence: 6, luck: 3, evasion: 4,
    ...overrides,
  };
}

function fakeCombatStats(overrides?: Partial<Record<string, unknown>>) {
  return {
    hp: 100, maxHp: 120,
    attack: 15, accuracy: 8,
    defence: 10, magicDefence: 7,
    dodge: 3, evasion: 4,
    damageMin: 5, damageMax: 20,
    speed: 2, damageType: 'melee' as const,
    critChance: 0.05, critDamage: 1.5,
    ...overrides,
  };
}

function fakeResourceState(staminaCurrent = 80, manaCurrent = 50) {
  return {
    stamina: { current: staminaCurrent, max: 100, regenPerRound: 5, regenPerSecond: 0.1 },
    mana: { current: manaCurrent, max: 80, regenPerRound: 3, regenPerSecond: 0.05 },
  };
}

function fakeHpState(currentHp = 95) {
  return {
    currentHp,
    maxHp: 120,
    regenPerSecond: 0.4,
    lastHpRegenAt: new Date().toISOString(),
    isRecovering: false,
    recoveryCost: null,
  };
}

function fakeSkillPoints(unlockedActions: string[] = []) {
  return {
    playerId: PLAYER_ID,
    totalPointsEarned: 5,
    totalPointsSpent: 3,
    availablePoints: 2,
    allocations: {},
    unlockedActions,
  };
}

const FAKE_TEMPLATE = [{ id: 'slot-1', sortOrder: 0, actionId: 'basic_attack' }];
const FAKE_COMBATANT = { id: PLAYER_ID, name: USERNAME, stats: fakeCombatStats() };

// ── Setup ────────────────────────────────────────────────────────────

function setupDefaultMocks() {
  mockGetEquipmentStats.mockResolvedValue(fakeEquipmentStats() as any);
  mockGetActiveTemplate.mockResolvedValue(FAKE_TEMPLATE as any);
  mockGetSkillPoints.mockResolvedValue(fakeSkillPoints());
  mockNormalizePlayerAttributes.mockReturnValue(fakeAttributes() as any);
  mockGetSkillLevels.mockResolvedValue({ melee: 5, ranged: 5, evasion: 5, magic: 5 });
  mockGetMainHandAttackSkill.mockResolvedValue('melee');
  mockBuildPerActionScaling.mockResolvedValue({
    skillLevels: { melee: 5, ranged: 5, magic: 5 },
    attributes: { strength: 10, dexterity: 8, intelligence: 6 },
    weaponPower: { attack: 10, rangedPower: 8, magicPower: 12 },
    equipmentAccuracy: 5,
    weaponRequiredSkill: 'melee',
  });
  mockCalculateMaxHp.mockReturnValue(120);
  mockBuildPlayerCombatStats.mockReturnValue(fakeCombatStats() as any);
  mockBuildPlayerTemplateCombatant.mockReturnValue(FAKE_COMBATANT as any);
  mockCalculateMaxStamina.mockReturnValue(100);
  mockCalculateStaminaRegenPerRound.mockReturnValue(5);
  mockCalculateMaxMana.mockReturnValue(80);
  mockCalculateManaRegenPerRound.mockReturnValue(3);
  mockGetHpState.mockResolvedValue(fakeHpState() as any);
  mockGetResourceState.mockResolvedValue(fakeResourceState() as any);

  mockPrisma.player.findUniqueOrThrow.mockResolvedValue({
    attributes: { vitality: 5, strength: 10, dexterity: 8, intelligence: 6, luck: 3, evasion: 4 },
  });
}

// ── Tests ────────────────────────────────────────────────────────────

describe('pvpCombatantBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getAttackStyle ─────────────────────────────────────────────────

  describe('getAttackStyle', () => {
    it('returns melee when no main-hand weapon equipped', async () => {
      mockPrisma.playerEquipment.findUnique.mockResolvedValue(null);

      const result = await getAttackStyle(PLAYER_ID);

      expect(result).toBe('melee');
      expect(mockPrisma.playerEquipment.findUnique).toHaveBeenCalledWith({
        where: { playerId_slot: { playerId: PLAYER_ID, slot: 'main_hand' } },
        select: { item: { select: { template: { select: { requiredSkill: true } } } } },
      });
    });

    it('returns melee when weapon has no template', async () => {
      mockPrisma.playerEquipment.findUnique.mockResolvedValue({
        item: { template: null },
      });

      const result = await getAttackStyle(PLAYER_ID);
      expect(result).toBe('melee');
    });

    it('returns melee when weapon has no item', async () => {
      mockPrisma.playerEquipment.findUnique.mockResolvedValue({
        item: null,
      });

      const result = await getAttackStyle(PLAYER_ID);
      expect(result).toBe('melee');
    });

    it('returns melee when requiredSkill is melee', async () => {
      mockPrisma.playerEquipment.findUnique.mockResolvedValue({
        item: { template: { requiredSkill: 'melee' } },
      });

      const result = await getAttackStyle(PLAYER_ID);
      expect(result).toBe('melee');
    });

    it('returns ranged when requiredSkill is ranged', async () => {
      mockPrisma.playerEquipment.findUnique.mockResolvedValue({
        item: { template: { requiredSkill: 'ranged' } },
      });

      const result = await getAttackStyle(PLAYER_ID);
      expect(result).toBe('ranged');
    });

    it('returns magic when requiredSkill is magic', async () => {
      mockPrisma.playerEquipment.findUnique.mockResolvedValue({
        item: { template: { requiredSkill: 'magic' } },
      });

      const result = await getAttackStyle(PLAYER_ID);
      expect(result).toBe('magic');
    });

    it('returns melee for unrecognised requiredSkill (e.g. mining)', async () => {
      mockPrisma.playerEquipment.findUnique.mockResolvedValue({
        item: { template: { requiredSkill: 'mining' } },
      });

      const result = await getAttackStyle(PLAYER_ID);
      expect(result).toBe('melee');
    });

    it('returns melee when requiredSkill is null', async () => {
      mockPrisma.playerEquipment.findUnique.mockResolvedValue({
        item: { template: { requiredSkill: null } },
      });

      const result = await getAttackStyle(PLAYER_ID);
      expect(result).toBe('melee');
    });

    it('returns melee when requiredSkill is undefined', async () => {
      mockPrisma.playerEquipment.findUnique.mockResolvedValue({
        item: { template: {} },
      });

      const result = await getAttackStyle(PLAYER_ID);
      expect(result).toBe('melee');
    });
  });

  // ── buildPvpCombatant ──────────────────────────────────────────────

  describe('buildPvpCombatant', () => {
    beforeEach(() => {
      setupDefaultMocks();
    });

    it('fetches player attributes and normalizes them', async () => {
      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      expect(mockPrisma.player.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: PLAYER_ID },
        select: { attributes: true },
      });
      expect(mockNormalizePlayerAttributes).toHaveBeenCalled();
    });

    it('queries equipment stats, attack style, template, and skill points in parallel', async () => {
      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      expect(mockGetEquipmentStats).toHaveBeenCalledWith(PLAYER_ID);
      expect(mockGetActiveTemplate).toHaveBeenCalledWith(PLAYER_ID);
      expect(mockGetSkillPoints).toHaveBeenCalledWith(PLAYER_ID);
    });

    it('uses an empty read-only skill allocation when the allocation record is missing', async () => {
      mockPrisma.skillPointAllocation.findUnique.mockResolvedValue(null);
      mockGetSkillPoints.mockResolvedValue(fakeSkillPoints(['power_strike']));

      await buildPvpCombatant(PLAYER_ID, USERNAME, false, { readOnlySkillAllocation: true });

      expect(mockGetSkillPoints).not.toHaveBeenCalled();
      expect(mockPrisma.skillPointAllocation.findUnique).toHaveBeenCalledWith({
        where: { playerId: PLAYER_ID },
        select: { allocations: true },
      });
      expect(mockPrisma.skillPointAllocation.create).not.toHaveBeenCalled();
      expect(mockPrisma.skillPointAllocation.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.skillPointAllocation.update).not.toHaveBeenCalled();
      expect(mockBuildPlayerTemplateCombatant).toHaveBeenCalledWith(
        expect.objectContaining({ unlockedActions: [] }),
      );
    });

    it('queries skill levels for melee, ranged, evasion, and magic', async () => {
      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      expect(mockGetSkillLevels).toHaveBeenCalledWith(
        PLAYER_ID,
        expect.arrayContaining(['melee', 'ranged', 'evasion', 'magic']),
      );
    });

    // ── Attack style → skill level mapping ───────────────────────────

    it('uses melee skill level when attackStyle is melee', async () => {
      mockGetMainHandAttackSkill.mockResolvedValue('melee');
      // melee=10, ranged=20, evasion=15, magic=25
      mockGetSkillLevels.mockResolvedValue({ melee: 10, ranged: 20, evasion: 15, magic: 25 });

      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      // buildPlayerCombatStats receives skillLevel matching the attack style
      expect(mockBuildPlayerCombatStats).toHaveBeenCalledWith(
        120, 120, // hp, maxHp (defender ghost: both are maxHp)
        expect.objectContaining({ attackStyle: 'melee', skillLevel: 10 }),
        expect.anything(),
      );
    });

    it('uses ranged skill level when attackStyle is ranged', async () => {
      mockGetMainHandAttackSkill.mockResolvedValue('ranged');
      mockGetSkillLevels.mockResolvedValue({ melee: 10, ranged: 20, evasion: 15, magic: 25 });

      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      expect(mockBuildPlayerCombatStats).toHaveBeenCalledWith(
        120, 120,
        expect.objectContaining({ attackStyle: 'ranged', skillLevel: 20 }),
        expect.anything(),
      );
    });

    it('uses magic skill level when attackStyle is magic', async () => {
      mockGetMainHandAttackSkill.mockResolvedValue('magic');
      mockGetSkillLevels.mockResolvedValue({ melee: 10, ranged: 20, evasion: 15, magic: 25 });

      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      expect(mockBuildPlayerCombatStats).toHaveBeenCalledWith(
        120, 120,
        expect.objectContaining({ attackStyle: 'magic', skillLevel: 25 }),
        expect.anything(),
      );
    });

    // ── useCurrentResources = false (defender ghost) ─────────────────

    it('uses max HP for both currentHp and maxHp when useCurrentResources=false', async () => {
      mockCalculateMaxHp.mockReturnValue(150);

      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      // Both args should be maxHp (150)
      expect(mockBuildPlayerCombatStats).toHaveBeenCalledWith(
        150, 150,
        expect.anything(),
        expect.anything(),
      );
    });

    it('calculates max stamina/mana from skill levels when useCurrentResources=false', async () => {
      mockGetSkillLevels.mockResolvedValue({ melee: 10, ranged: 20, evasion: 15, magic: 25 });
      mockCalculateMaxStamina.mockReturnValue(200);
      mockCalculateMaxMana.mockReturnValue(150);

      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      expect(mockCalculateMaxStamina).toHaveBeenCalledWith({
        meleeLevel: 10, rangedLevel: 20, evasionLevel: 15, equipmentStaminaBonus: 0,
      });
      expect(mockCalculateMaxMana).toHaveBeenCalledWith({
        magicLevel: 25, equipmentManaBonus: 0,
      });
    });

    it('sets stamina = maxStamina and mana = maxMana when useCurrentResources=false', async () => {
      mockCalculateMaxStamina.mockReturnValue(200);
      mockCalculateMaxMana.mockReturnValue(150);
      mockCalculateStaminaRegenPerRound.mockReturnValue(8);
      mockCalculateManaRegenPerRound.mockReturnValue(4);

      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      expect(mockBuildPlayerTemplateCombatant).toHaveBeenCalledWith(
        expect.objectContaining({
          stamina: 200,
          maxStamina: 200,
          mana: 150,
          maxMana: 150,
        }),
      );
    });

    it('does NOT call getHpState or getResourceState when useCurrentResources=false', async () => {
      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      expect(mockGetHpState).not.toHaveBeenCalled();
      expect(mockGetResourceState).not.toHaveBeenCalled();
    });

    // ── useCurrentResources = true (attacker, live resources) ────────

    it('uses live HP from getHpState when useCurrentResources=true', async () => {
      mockGetHpState.mockResolvedValue(fakeHpState(75) as any);
      mockCalculateMaxHp.mockReturnValue(120);

      await buildPvpCombatant(PLAYER_ID, USERNAME, true);

      expect(mockGetHpState).toHaveBeenCalledWith(PLAYER_ID);
      expect(mockBuildPlayerCombatStats).toHaveBeenCalledWith(
        75, 120, // currentHp from state, maxHp from calculation
        expect.anything(),
        expect.anything(),
      );
    });

    it('uses live stamina/mana from getResourceState when useCurrentResources=true', async () => {
      mockGetResourceState.mockResolvedValue(fakeResourceState(60, 40) as any);

      await buildPvpCombatant(PLAYER_ID, USERNAME, true);

      expect(mockGetResourceState).toHaveBeenCalledWith(PLAYER_ID);
      expect(mockBuildPlayerTemplateCombatant).toHaveBeenCalledWith(
        expect.objectContaining({
          stamina: 60,
          maxStamina: 100,
          mana: 40,
          maxMana: 80,
        }),
      );
    });

    it('does NOT call calculateMaxStamina/calculateMaxMana when useCurrentResources=true', async () => {
      await buildPvpCombatant(PLAYER_ID, USERNAME, true);

      expect(mockCalculateMaxStamina).not.toHaveBeenCalled();
      expect(mockCalculateMaxMana).not.toHaveBeenCalled();
    });

    // ── buildPlayerTemplateCombatant delegation ──────────────────────

    it('passes correct params to buildPlayerTemplateCombatant (defender)', async () => {
      mockCalculateMaxStamina.mockReturnValue(200);
      mockCalculateMaxMana.mockReturnValue(150);
      mockCalculateStaminaRegenPerRound.mockReturnValue(8);
      mockCalculateManaRegenPerRound.mockReturnValue(4);
      mockGetSkillPoints.mockResolvedValue(fakeSkillPoints(['power_strike', 'fireball']));

      const fakeStats = fakeCombatStats();
      mockBuildPlayerCombatStats.mockReturnValue(fakeStats as any);

      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      expect(mockBuildPlayerTemplateCombatant).toHaveBeenCalledWith({
        playerId: PLAYER_ID,
        username: USERNAME,
        playerStats: fakeStats,
        template: FAKE_TEMPLATE,
        stamina: 200,
        maxStamina: 200,
        staminaRegenPerRound: 8,
        mana: 150,
        maxMana: 150,
        manaRegenPerRound: 4,
        unlockedActions: ['power_strike', 'fireball'],
        perActionScaling: {
          skillLevels: { melee: 5, ranged: 5, magic: 5 },
          attributes: { strength: 10, dexterity: 8, intelligence: 6 },
          weaponPower: { attack: 10, rangedPower: 8, magicPower: 12 },
          equipmentAccuracy: 5,
          weaponRequiredSkill: 'melee',
        },
      });
    });

    it('passes correct params to buildPlayerTemplateCombatant (attacker)', async () => {
      mockGetHpState.mockResolvedValue(fakeHpState(88) as any);
      mockGetResourceState.mockResolvedValue(fakeResourceState(55, 33) as any);
      mockCalculateStaminaRegenPerRound.mockReturnValue(7);
      mockCalculateManaRegenPerRound.mockReturnValue(2);
      mockGetSkillPoints.mockResolvedValue(fakeSkillPoints([]));

      const fakeStats = fakeCombatStats({ hp: 88, maxHp: 120 });
      mockBuildPlayerCombatStats.mockReturnValue(fakeStats as any);

      await buildPvpCombatant(PLAYER_ID, USERNAME, true);

      expect(mockBuildPlayerTemplateCombatant).toHaveBeenCalledWith({
        playerId: PLAYER_ID,
        username: USERNAME,
        playerStats: fakeStats,
        template: FAKE_TEMPLATE,
        stamina: 55,
        maxStamina: 100,
        staminaRegenPerRound: 7,
        mana: 33,
        maxMana: 80,
        manaRegenPerRound: 2,
        unlockedActions: [],
        perActionScaling: {
          skillLevels: { melee: 5, ranged: 5, magic: 5 },
          attributes: { strength: 10, dexterity: 8, intelligence: 6 },
          weaponPower: { attack: 10, rangedPower: 8, magicPower: 12 },
          equipmentAccuracy: 5,
          weaponRequiredSkill: 'melee',
        },
      });
    });

    // ── perActionScaling: weaponRequiredSkill matches attack style ───

    it('passes weaponRequiredSkill=magic to buildPerActionScaling when wielding a staff', async () => {
      mockGetMainHandAttackSkill.mockResolvedValue('magic');
      mockGetSkillLevels.mockResolvedValue({ melee: 5, ranged: 5, evasion: 5, magic: 20 });
      mockGetEquipmentStats.mockResolvedValue(fakeEquipmentStats({ magicPower: 30 }) as any);

      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      expect(mockBuildPerActionScaling).toHaveBeenCalledWith(PLAYER_ID, expect.objectContaining({
        weaponRequiredSkill: 'magic',
        skillLevels: expect.objectContaining({ magic: 20 }),
      }));
    });

    it('passes weaponRequiredSkill=ranged to buildPerActionScaling when wielding a bow', async () => {
      mockGetMainHandAttackSkill.mockResolvedValue('ranged');

      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      expect(mockBuildPerActionScaling).toHaveBeenCalledWith(PLAYER_ID, expect.objectContaining({
        weaponRequiredSkill: 'ranged',
      }));
    });

    it('passes weaponRequiredSkill=null to buildPerActionScaling when unarmed', async () => {
      mockGetMainHandAttackSkill.mockResolvedValue(null);

      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      expect(mockBuildPerActionScaling).toHaveBeenCalledWith(PLAYER_ID, expect.objectContaining({
        weaponRequiredSkill: null,
      }));
    });

    // ── calculateMaxHp uses normalized attributes ────────────────────

    it('passes vitality from normalized attributes to calculateMaxHp', async () => {
      const attrs = fakeAttributes({ vitality: 15 });
      mockNormalizePlayerAttributes.mockReturnValue(attrs as any);

      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      expect(mockCalculateMaxHp).toHaveBeenCalledWith({
        vitalityLevel: 15,
        equipmentHealthBonus: expect.any(Number),
      });
    });

    it('passes equipment health bonus to calculateMaxHp', async () => {
      mockGetEquipmentStats.mockResolvedValue(fakeEquipmentStats({ health: 50 }) as any);

      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      expect(mockCalculateMaxHp).toHaveBeenCalledWith(
        expect.objectContaining({ equipmentHealthBonus: 50 }),
      );
    });

    // ── Stamina/mana regen per round calculation ─────────────────────

    it('passes correct skill levels to calculateStaminaRegenPerRound', async () => {
      mockGetSkillLevels.mockResolvedValue({ melee: 12, ranged: 18, evasion: 9, magic: 30 });

      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      expect(mockCalculateStaminaRegenPerRound).toHaveBeenCalledWith(12, 18, 9);
    });

    it('passes magic level to calculateManaRegenPerRound', async () => {
      mockGetSkillLevels.mockResolvedValue({ melee: 12, ranged: 18, evasion: 9, magic: 30 });

      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      expect(mockCalculateManaRegenPerRound).toHaveBeenCalledWith(30);
    });

    // ── Equipment stats forwarded to buildPlayerCombatStats ──────────

    it('forwards equipment stats to buildPlayerCombatStats', async () => {
      const equip = fakeEquipmentStats({ attack: 50, rangedPower: 30, magicPower: 40 });
      mockGetEquipmentStats.mockResolvedValue(equip as any);

      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      expect(mockBuildPlayerCombatStats).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        equip,
      );
    });

    // ── Attributes forwarded to buildPlayerCombatStats ───────────────

    it('forwards normalized attributes to buildPlayerCombatStats', async () => {
      const attrs = fakeAttributes({ strength: 20, evasion: 12 });
      mockNormalizePlayerAttributes.mockReturnValue(attrs as any);

      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      expect(mockBuildPlayerCombatStats).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ attributes: attrs }),
        expect.anything(),
      );
    });

    // ── Edge: no weapon equipped defaults to melee ───────────────────

    it('defaults to melee attack style when no weapon is equipped', async () => {
      mockGetMainHandAttackSkill.mockResolvedValue(null);

      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      expect(mockBuildPlayerCombatStats).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ attackStyle: 'melee' }),
        expect.anything(),
      );
    });

    // ── Edge: zero skill levels ──────────────────────────────────────

    it('handles zero skill levels gracefully', async () => {
      mockGetSkillLevels.mockResolvedValue({ melee: 0, ranged: 0, evasion: 0, magic: 0 });
      mockCalculateMaxStamina.mockReturnValue(50);
      mockCalculateMaxMana.mockReturnValue(30);

      await buildPvpCombatant(PLAYER_ID, USERNAME, false);

      expect(mockBuildPlayerCombatStats).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ skillLevel: 0 }),
        expect.anything(),
      );
      expect(mockCalculateStaminaRegenPerRound).toHaveBeenCalledWith(0, 0, 0);
      expect(mockCalculateManaRegenPerRound).toHaveBeenCalledWith(0);
    });

    // ── Edge: player.findUniqueOrThrow rejects → propagates ─────────

    it('propagates error when player not found', async () => {
      mockPrisma.player.findUniqueOrThrow.mockRejectedValue(
        new Error('Record not found'),
      );

      await expect(buildPvpCombatant(PLAYER_ID, USERNAME, false)).rejects.toThrow(
        'Record not found',
      );
    });
  });
});
