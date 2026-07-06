import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CRAFTING_CONSTANTS } from '@pocketrealm/shared';
import { Crafting } from './Crafting';

vi.mock('@/hooks/useNpcDialogue', () => ({
  useNpcDialogue: () => ({
    dialogueEvent: null,
    triggerDialogueEvent: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const baseRecipe = {
  icon: '?',
  itemType: 'resource',
  isAdvanced: false,
  isDiscovered: true,
  discoveryHint: null,
  soulbound: false,
  stackable: true,
  resultQuantity: 1,
  requiredLevel: 1,
  turnCost: 2,
  xpReward: 5,
  baseStats: {},
  materials: [],
  rarity: 'common' as const,
};

function renderCrafting(recipes: React.ComponentProps<typeof Crafting>['recipes']) {
  render(
    <Crafting
      skillName="Alchemy"
      skillLevel={10}
      xpRate={100}
      recipes={recipes}
      onCraft={vi.fn()}
      activityLog={[]}
      zoneCraftingLevel={null}
      zoneName={null}
      showNpcDialogue={false}
    />,
  );
}

function renderCraftingWithSpy(
  recipes: React.ComponentProps<typeof Crafting>['recipes'],
  props: Partial<React.ComponentProps<typeof Crafting>> = {},
) {
  const onCraft = vi.fn();
  render(
    <Crafting
      skillName="Tailoring"
      skillLevel={10}
      xpRate={100}
      recipes={recipes}
      onCraft={onCraft}
      activityLog={[]}
      zoneCraftingLevel={null}
      zoneName={null}
      showNpcDialogue={false}
      availableSlots={10}
      {...props}
    />
  );
  return onCraft;
}

const equipmentRecipe = {
  ...baseRecipe,
  id: 'robe',
  name: 'Silk Robe',
  itemType: 'armor',
  stackable: false,
  materials: [{ name: 'Silk', icon: '?', required: 1, owned: 200 }],
};

const attemptBudgetCap = CRAFTING_CONSTANTS.CRAFT_ATTEMPT_BUDGET_CAP;

describe('Crafting', () => {
  it('displays potion effects instead of empty base stats', () => {
    renderCrafting([
      {
        ...baseRecipe,
        id: 'minor-health',
        name: 'Minor Health Potion',
        consumableEffect: { type: 'heal_flat', value: 50 },
      },
      {
        ...baseRecipe,
        id: 'stamina',
        name: 'Stamina Potion',
        consumableEffect: { type: 'restore_stamina', value: 30 },
      },
      {
        ...baseRecipe,
        id: 'mana',
        name: 'Mana Potion',
        consumableEffect: { type: 'restore_mana', value: 20 },
      },
      {
        ...baseRecipe,
        id: 'cleanse',
        name: 'Cleansing Potion',
        consumableEffect: { type: 'cleanse_magic_dot' },
      },
      {
        ...baseRecipe,
        id: 'cleanse-all',
        name: 'Purifying Potion',
        consumableEffect: { type: 'cleanse_magic_dot', value: 0 },
      },
      {
        ...baseRecipe,
        id: 'resist',
        name: 'Resist Potion',
        consumableEffect: { type: 'buff_defence', value: 15, duration: 5 },
      },
      {
        ...baseRecipe,
        id: 'power',
        name: 'Elixir of Power',
        consumableEffect: { type: 'buff_attack', value: 0.25, duration: 5 },
      },
    ]);

    expect(screen.getByText('Effect')).toBeTruthy();
    expect(screen.getByText('Restores 50 HP')).toBeTruthy();
    expect(screen.queryByText('No base stats')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Stamina Potion/i }));

    expect(screen.getByText('Restores 30 stamina')).toBeTruthy();
    expect(screen.queryByText('No base stats')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Mana Potion/i }));

    expect(screen.getByText('Restores 20 mana')).toBeTruthy();
    expect(screen.queryByText('No base stats')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Cleansing Potion/i }));

    expect(screen.getByText('Cleanses 1 magic DoT')).toBeTruthy();
    expect(screen.queryByText('No base stats')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Purifying Potion/i }));

    expect(screen.getByText('Cleanses all magic DoTs')).toBeTruthy();
    expect(screen.queryByText('No base stats')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Resist Potion/i }));

    expect(screen.getByText('Increases defence and magic defence by 15 for 5 rounds')).toBeTruthy();
    expect(screen.queryByText('No base stats')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Elixir of Power/i }));

    expect(screen.getByText('Increases attack by 25% for 5 rounds')).toBeTruthy();
    expect(screen.queryByText('No base stats')).toBeNull();
  });

  it('keeps base stats for non-consumable recipes', () => {
    renderCrafting([
      {
        ...baseRecipe,
        id: 'iron-sword',
        name: 'Iron Sword',
        stackable: false,
        baseStats: { attack: 8 },
      },
    ]);

    expect(screen.getByText('Base Stats')).toBeTruthy();
    expect(screen.getByText('Attack')).toBeTruthy();
    expect(screen.getByText('+8')).toBeTruthy();
    expect(screen.queryByText('Effect')).toBeNull();
  });

  it('defaults craft destination to inventory', () => {
    const onCraft = renderCraftingWithSpy([equipmentRecipe]);

    fireEvent.click(screen.getByRole('button', { name: /Craft Silk Robe/i }));

    expect(onCraft).toHaveBeenCalledWith('robe', 1, {
      destination: 'inventory',
      autoForgeMinRarity: null,
    });
  });

  it('sends stash destination and rare auto-forge target', () => {
    const onCraft = renderCraftingWithSpy([equipmentRecipe]);

    fireEvent.click(screen.getByRole('button', { name: 'Stash' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rare+' }));
    fireEvent.click(screen.getByRole('button', { name: /Craft Silk Robe to stash and forge to Rare\+/i }));

    expect(screen.getByText('Craft attempts')).toBeTruthy();
    expect(onCraft).toHaveBeenCalledWith('robe', 1, {
      destination: 'stash',
      autoForgeMinRarity: 'rare',
    });
  });

  it('hides auto-forge controls for stackable recipes', () => {
    renderCraftingWithSpy([
      { ...baseRecipe, id: 'thread', name: 'Thread', itemType: 'resource', stackable: true },
    ]);

    expect(screen.queryByRole('button', { name: 'Rare+' })).toBeNull();
  });

  it('disables inventory auto-forge when minimum open slots are missing', () => {
    renderCraftingWithSpy([equipmentRecipe], { availableSlots: 2 });

    fireEvent.click(screen.getByRole('button', { name: 'Rare+' }));

    expect(screen.getByText('Rare+ auto-forge needs 3 open backpack slots.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Need 3 Open Slots/i })).toHaveProperty('disabled', true);
  });

  it('does not append a plus sign to legendary auto-forge labels', () => {
    renderCraftingWithSpy([equipmentRecipe]);

    fireEvent.click(screen.getByRole('button', { name: 'Legendary' }));

    expect(screen.getByRole('button', { name: /Craft Silk Robe and forge to Legendary/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Legendary\+/i })).toBeNull();
  });

  it('allows stash crafting even when the backpack is full and over-encumbered', () => {
    renderCraftingWithSpy([equipmentRecipe], {
      backpackFull: true,
      isOverEncumbered: true,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Stash' }));

    expect(screen.getByRole('button', { name: /Craft Silk Robe to stash/i })).toHaveProperty('disabled', false);
  });

  it('caps stash auto-forge craft quantity at the shared 200 attempt budget', () => {
    const onCraft = renderCraftingWithSpy([
      {
        ...equipmentRecipe,
        materials: [{ name: 'Silk', icon: '?', required: 1, owned: 500 }],
      },
    ], { availableSlots: 999 });

    fireEvent.click(screen.getByRole('button', { name: 'Stash' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rare+' }));

    expect(screen.getByRole('button', { name: `Max (${attemptBudgetCap})` })).toBeTruthy();
    expect(screen.getByText(/Rough forge/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: `Max (${attemptBudgetCap})` }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Craft ${attemptBudgetCap}x Silk Robe to stash and forge to Rare\\+`, 'i') }));

    expect(onCraft).toHaveBeenCalledWith('robe', attemptBudgetCap, {
      destination: 'stash',
      autoForgeMinRarity: 'rare',
    });
  });

  it('uses the shared attempt budget cap for no-material stash auto-forge recipes', () => {
    const onCraft = renderCraftingWithSpy([
      {
        ...equipmentRecipe,
        materials: [],
      },
    ], { availableSlots: 999 });

    fireEvent.click(screen.getByRole('button', { name: 'Stash' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rare+' }));

    expect(screen.getByRole('button', { name: `Max (${attemptBudgetCap})` })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: `Max (${attemptBudgetCap})` }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Craft ${attemptBudgetCap}x Silk Robe to stash and forge to Rare\\+`, 'i') }));

    expect(onCraft).toHaveBeenCalledWith('robe', attemptBudgetCap, {
      destination: 'stash',
      autoForgeMinRarity: 'rare',
    });
  });

  it('does not clamp stackable batch quantities to the attempt budget cap', () => {
    renderCraftingWithSpy([
      {
        ...baseRecipe,
        id: 'thread',
        name: 'Silk Thread',
        materials: [{ name: 'Silk', icon: '?', required: 1, owned: 500 }],
      },
    ]);

    expect(screen.getByRole('button', { name: 'Max (500)' })).toBeTruthy();
  });
});
