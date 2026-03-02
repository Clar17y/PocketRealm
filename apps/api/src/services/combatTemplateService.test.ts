import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SKILL_POINT_CONSTANTS } from '@adventure/shared';

import { mockPrisma } from '../__test__/setup';
import {
  createTemplate,
  getTemplates,
  getActiveTemplate,
  setActiveTemplate,
  updateTemplate,
  deleteTemplate,
  validateTemplateActions,
} from './combatTemplateService';

beforeEach(() => {
  vi.clearAllMocks();
});

const PLAYER_ID = 'player-1';
const TEMPLATE_ID = 'template-1';

function makeRecord(overrides: Record<string, any> = {}) {
  return {
    id: TEMPLATE_ID,
    playerId: PLAYER_ID,
    name: 'My Template',
    isActive: false,
    actions: [{ actionId: 'light_attack' }],
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
        actions: [{ actionId: 'light_attack' }],
      },
    });
    expect(result.isActive).toBe(true);
    expect(result.id).toBe(TEMPLATE_ID);
  });

  it('creates second template as NOT active', async () => {
    mockPrisma.combatTemplate.count.mockResolvedValue(1);
    mockPrisma.combatTemplate.create.mockResolvedValue(makeRecord({ isActive: false }));

    const result = await createTemplate(PLAYER_ID, 'Second', [{ actionId: 'normal_attack' }]);

    expect(mockPrisma.combatTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isActive: false }),
    });
    expect(result.isActive).toBe(false);
  });

  it('rejects when over MAX_TEMPLATES limit', async () => {
    mockPrisma.combatTemplate.count.mockResolvedValue(SKILL_POINT_CONSTANTS.MAX_TEMPLATES);

    await expect(
      createTemplate(PLAYER_ID, 'Overflow', [{ actionId: 'light_attack' }]),
    ).rejects.toThrow(`Maximum ${SKILL_POINT_CONSTANTS.MAX_TEMPLATES} templates allowed`);
  });

  it('rejects unavailable action IDs', async () => {
    mockPrisma.combatTemplate.count.mockResolvedValue(0);

    await expect(
      createTemplate(PLAYER_ID, 'Bad', [{ actionId: 'nonexistent_action' }]),
    ).rejects.toThrow("Action 'nonexistent_action' is not available");
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
    });
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('First');
    expect(result[1].name).toBe('Second');
  });
});

describe('getActiveTemplate', () => {
  it('returns active template actions', async () => {
    const actions = [{ actionId: 'heavy_attack' }, { actionId: 'defend' }];
    mockPrisma.combatTemplate.findFirst.mockResolvedValue(makeRecord({ isActive: true, actions }));

    const result = await getActiveTemplate(PLAYER_ID);

    expect(result).toEqual(actions);
  });

  it('returns default when no active template', async () => {
    mockPrisma.combatTemplate.findFirst.mockResolvedValue(null);

    const result = await getActiveTemplate(PLAYER_ID);

    expect(result).toEqual([{ actionId: SKILL_POINT_CONSTANTS.DEFAULT_ACTION_ID }]);
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
  it('updates name and/or actions', async () => {
    mockPrisma.combatTemplate.findFirst.mockResolvedValue(makeRecord());
    const updatedActions = [{ actionId: 'defend' }, { actionId: 'normal_attack' }];
    mockPrisma.combatTemplate.update.mockResolvedValue(
      makeRecord({ name: 'Renamed', actions: updatedActions }),
    );

    const result = await updateTemplate(PLAYER_ID, TEMPLATE_ID, 'Renamed', updatedActions);

    expect(mockPrisma.combatTemplate.update).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID },
      data: { name: 'Renamed', actions: updatedActions },
    });
    expect(result.name).toBe('Renamed');
    expect(result.actions).toEqual(updatedActions);
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

describe('validateTemplateActions', () => {
  it('accepts base actions', () => {
    expect(() =>
      validateTemplateActions([{ actionId: 'light_attack' }, { actionId: 'defend' }]),
    ).not.toThrow();
  });

  it('rejects empty template', () => {
    expect(() => validateTemplateActions([])).toThrow('Template must have at least one action');
  });

  it('accepts unlocked talent actions', () => {
    expect(() =>
      validateTemplateActions(
        [{ actionId: 'talent_fireball' }],
        ['talent_fireball'],
      ),
    ).not.toThrow();
  });
});
