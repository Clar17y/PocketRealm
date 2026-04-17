import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMBAT_TEMPLATE_CONSTANTS, SKILL_POINT_CONSTANTS } from '@pocketrealm/shared';

import { mockPrisma } from '../__test__/setup';
import {
  createTemplate,
  getTemplates,
  getActiveTemplate,
  setActiveTemplate,
  updateTemplate,
  deleteTemplate,
  validateTemplateSlots,
} from './combatTemplateService';

beforeEach(() => {
  vi.clearAllMocks();
});

const PLAYER_ID = 'player-1';
const TEMPLATE_ID = 'template-1';

function makeSlot(overrides: Record<string, any> = {}) {
  return {
    id: 'slot-1',
    templateId: TEMPLATE_ID,
    sortOrder: 0,
    actionId: 'light_attack',
    conditionType: null,
    resource: null,
    threshold: null,
    effectName: null,
    thenActionId: null,
    ...overrides,
  };
}

function makeRecord(overrides: Record<string, any> = {}) {
  return {
    id: TEMPLATE_ID,
    playerId: PLAYER_ID,
    name: 'My Template',
    isActive: false,
    slots: [makeSlot()],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('createTemplate', () => {
  it('creates a template; first one is auto-active', async () => {
    mockPrisma.combatTemplate.count.mockResolvedValue(0);
    mockPrisma.combatTemplate.create.mockResolvedValue(makeRecord({ isActive: true }));

    const result = await createTemplate(PLAYER_ID, 'My Template', [{ actionId: 'light_attack' }]);

    expect(mockPrisma.combatTemplate.create).toHaveBeenCalledWith({
      data: {
        playerId: PLAYER_ID,
        name: 'My Template',
        isActive: true,
        slots: {
          create: [{
            sortOrder: 0,
            actionId: 'light_attack',
            conditionType: null,
            resource: null,
            threshold: null,
            effectName: null,
            thenActionId: null,
          }],
        },
      },
      include: { slots: { orderBy: { sortOrder: 'asc' } } },
    });
    expect(result.isActive).toBe(true);
    expect(result.id).toBe(TEMPLATE_ID);
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].actionId).toBe('light_attack');
  });

  it('creates second template as NOT active', async () => {
    mockPrisma.combatTemplate.count.mockResolvedValue(1);
    mockPrisma.combatTemplate.create.mockResolvedValue(makeRecord({ isActive: false }));

    const result = await createTemplate(PLAYER_ID, 'Second', [{ actionId: 'normal_attack' }]);

    expect(mockPrisma.combatTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isActive: false }),
      include: { slots: { orderBy: { sortOrder: 'asc' } } },
    });
    expect(result.isActive).toBe(false);
  });

  it('creates template with conditional slot', async () => {
    const slotWithCondition = makeSlot({
      conditionType: 'resource_below',
      resource: 'hp',
      threshold: 30,
      thenActionId: 'defend',
    });
    mockPrisma.combatTemplate.count.mockResolvedValue(0);
    mockPrisma.combatTemplate.create.mockResolvedValue(
      makeRecord({ isActive: true, slots: [slotWithCondition] }),
    );

    const result = await createTemplate(PLAYER_ID, 'Conditional', [{
      actionId: 'light_attack',
      condition: { type: 'resource_below', resource: 'hp', threshold: 30 },
      thenActionId: 'defend',
    }]);

    expect(result.slots[0].condition).toEqual({
      type: 'resource_below',
      resource: 'hp',
      threshold: 30,
    });
    expect(result.slots[0].thenActionId).toBe('defend');
  });

  it('rejects when over MAX_TEMPLATES limit', async () => {
    mockPrisma.combatTemplate.count.mockResolvedValue(COMBAT_TEMPLATE_CONSTANTS.MAX_TEMPLATES);

    await expect(
      createTemplate(PLAYER_ID, 'Overflow', [{ actionId: 'light_attack' }]),
    ).rejects.toThrow(`Maximum ${COMBAT_TEMPLATE_CONSTANTS.MAX_TEMPLATES} templates allowed`);
  });

  it('rejects unknown action IDs', async () => {
    mockPrisma.combatTemplate.count.mockResolvedValue(0);

    await expect(
      createTemplate(PLAYER_ID, 'Bad', [{ actionId: 'nonexistent_action' }]),
    ).rejects.toThrow("Unknown action 'nonexistent_action'");
  });
});

describe('getTemplates', () => {
  it('returns all templates for player', async () => {
    const records = [
      makeRecord({ id: 'a', name: 'First', isActive: true }),
      makeRecord({ id: 'b', name: 'Second', isActive: false }),
    ];
    mockPrisma.combatTemplate.findMany.mockResolvedValue(records);

    const result = await getTemplates(PLAYER_ID);

    expect(mockPrisma.combatTemplate.findMany).toHaveBeenCalledWith({
      where: { playerId: PLAYER_ID },
      orderBy: { createdAt: 'asc' },
      include: { slots: { orderBy: { sortOrder: 'asc' } } },
    });
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('First');
    expect(result[1].name).toBe('Second');
  });
});

describe('getActiveTemplate', () => {
  it('returns active template slots', async () => {
    const slots = [
      makeSlot({ id: 'slot-1', sortOrder: 0, actionId: 'heavy_attack' }),
      makeSlot({ id: 'slot-2', sortOrder: 1, actionId: 'defend' }),
    ];
    mockPrisma.combatTemplate.findFirst.mockResolvedValue(makeRecord({ isActive: true, slots }));

    const result = await getActiveTemplate(PLAYER_ID);

    expect(result).toEqual([
      { id: 'slot-1', sortOrder: 0, actionId: 'heavy_attack' },
      { id: 'slot-2', sortOrder: 1, actionId: 'defend' },
    ]);
  });

  it('returns default when no active template', async () => {
    mockPrisma.combatTemplate.findFirst.mockResolvedValue(null);

    const result = await getActiveTemplate(PLAYER_ID);

    expect(result).toEqual([{
      id: 'default',
      sortOrder: 0,
      actionId: SKILL_POINT_CONSTANTS.DEFAULT_ACTION_ID,
    }]);
  });
});

describe('setActiveTemplate', () => {
  it('deactivates all and activates chosen template', async () => {
    mockPrisma.combatTemplate.findFirst.mockResolvedValue(makeRecord());

    await setActiveTemplate(PLAYER_ID, TEMPLATE_ID);

    expect(mockPrisma.combatTemplate.updateMany).toHaveBeenCalledWith({
      where: { playerId: PLAYER_ID },
      data: { isActive: false },
    });
    expect(mockPrisma.combatTemplate.update).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID },
      data: { isActive: true },
    });
  });

  it('rejects non-existent template', async () => {
    mockPrisma.combatTemplate.findFirst.mockResolvedValue(null);

    await expect(setActiveTemplate(PLAYER_ID, 'missing')).rejects.toThrow('Template not found');
  });
});

describe('updateTemplate', () => {
  it('updates name only', async () => {
    const record = makeRecord({ name: 'Original' });
    mockPrisma.combatTemplate.findFirst.mockResolvedValueOnce(record);
    mockPrisma.combatTemplate.update.mockResolvedValue(makeRecord({ name: 'Renamed' }));
    mockPrisma.combatTemplate.findUniqueOrThrow.mockResolvedValue(makeRecord({ name: 'Renamed' }));

    const result = await updateTemplate(PLAYER_ID, TEMPLATE_ID, 'Renamed');

    expect(mockPrisma.combatTemplate.update).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID },
      data: { name: 'Renamed' },
    });
    expect(result.name).toBe('Renamed');
  });

  it('replaces slots via delete + createMany', async () => {
    const updatedSlots = [
      makeSlot({ id: 'new-1', sortOrder: 0, actionId: 'defend' }),
      makeSlot({ id: 'new-2', sortOrder: 1, actionId: 'normal_attack' }),
    ];
    mockPrisma.combatTemplate.findFirst.mockResolvedValueOnce(makeRecord());
    mockPrisma.combatTemplate.findUniqueOrThrow.mockResolvedValue(makeRecord({ slots: updatedSlots }));

    const result = await updateTemplate(PLAYER_ID, TEMPLATE_ID, undefined, [
      { actionId: 'defend' },
      { actionId: 'normal_attack' },
    ]);

    expect(mockPrisma.combatTemplateSlot.deleteMany).toHaveBeenCalledWith({
      where: { templateId: TEMPLATE_ID },
    });
    expect(mockPrisma.combatTemplateSlot.createMany).toHaveBeenCalledWith({
      data: [
        {
          templateId: TEMPLATE_ID,
          sortOrder: 0,
          actionId: 'defend',
          conditionType: null,
          resource: null,
          threshold: null,
          effectName: null,
          thenActionId: null,
        },
        {
          templateId: TEMPLATE_ID,
          sortOrder: 1,
          actionId: 'normal_attack',
          conditionType: null,
          resource: null,
          threshold: null,
          effectName: null,
          thenActionId: null,
        },
      ],
    });
    expect(result.slots).toHaveLength(2);
  });

  it('rejects non-existent template', async () => {
    mockPrisma.combatTemplate.findFirst.mockResolvedValue(null);

    await expect(updateTemplate(PLAYER_ID, 'missing', 'Name')).rejects.toThrow(
      'Template not found',
    );
  });
});

describe('deleteTemplate', () => {
  it('deletes non-active template', async () => {
    mockPrisma.combatTemplate.findFirst.mockResolvedValue(makeRecord({ isActive: false }));

    await deleteTemplate(PLAYER_ID, TEMPLATE_ID);

    expect(mockPrisma.combatTemplate.delete).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID },
    });
  });

  it('rejects deleting active template', async () => {
    mockPrisma.combatTemplate.findFirst.mockResolvedValue(makeRecord({ isActive: true }));

    await expect(deleteTemplate(PLAYER_ID, TEMPLATE_ID)).rejects.toThrow(
      'Cannot delete the active template',
    );
  });
});

describe('validateTemplateSlots', () => {
  it('accepts base actions', () => {
    expect(() =>
      validateTemplateSlots([{ actionId: 'light_attack' }, { actionId: 'defend' }]),
    ).not.toThrow();
  });

  it('rejects empty template', () => {
    expect(() => validateTemplateSlots([])).toThrow('Template must have at least one action');
  });

  it('accepts unlocked talent actions', () => {
    expect(() =>
      validateTemplateSlots(
        [{ actionId: 'fire_bolt' }],
        ['fire_bolt'],
      ),
    ).not.toThrow();
  });

  it('rejects unknown actionId', () => {
    expect(() =>
      validateTemplateSlots([{ actionId: 'nonexistent' }]),
    ).toThrow("Unknown action 'nonexistent'");
  });

  it('rejects valid action not unlocked by player', () => {
    expect(() =>
      validateTemplateSlots([{ actionId: 'fire_bolt' }]),
    ).toThrow("Action 'fire_bolt' is not available");
  });

  it('validates thenActionId against definition registry', () => {
    expect(() =>
      validateTemplateSlots([{
        actionId: 'light_attack',
        condition: { type: 'resource_below', resource: 'hp', threshold: 50 },
        thenActionId: 'unavailable_action',
      }]),
    ).toThrow("Unknown action 'unavailable_action'");
  });

  it('validates thenActionId against available actions', () => {
    expect(() =>
      validateTemplateSlots([{
        actionId: 'light_attack',
        condition: { type: 'resource_below', resource: 'hp', threshold: 50 },
        thenActionId: 'fire_bolt',
      }]),
    ).toThrow("Action 'fire_bolt' is not available");
  });

  // Condition field consistency (resource/threshold, effectName, thenActionId pairing)
  // is validated by Zod schemas in the route layer, not the service layer.

  it('accepts valid conditional slot', () => {
    expect(() =>
      validateTemplateSlots([{
        actionId: 'light_attack',
        condition: { type: 'resource_below', resource: 'hp', threshold: 30 },
        thenActionId: 'defend',
      }]),
    ).not.toThrow();
  });

  it('accepts valid buff condition slot', () => {
    expect(() =>
      validateTemplateSlots([{
        actionId: 'normal_attack',
        condition: { type: 'has_debuff', effectName: 'poison' },
        thenActionId: 'minor_heal',
      }], ['minor_heal']),
    ).not.toThrow();
  });
});
